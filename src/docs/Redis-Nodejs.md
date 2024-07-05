# Nodejs(Koa)-Redis 集成及基础使用

Nodejs 框架使用 Koa，连接的类库用 io-redis，部分功能使用到了 koa-redis

### 1、配置类

用于连接 Redis，获取到 Redis 的 Client 即可。需要部署哨兵，可参考以下注释的内容进行配置。

```typescript
import redisStore from "koa-redis";
import Redisdb, { RedisOptions } from "ioredis";

export default class Redis {
  config: RedisOptions;
  client: Redisdb;
 ...
  constructor(options: any = {}) {
    this.config = {
      port: 6379,
      host: "127.0.0.1",
      db: 0,
      showFriendlyErrorStack: true,
      // sentinels: [ // 哨兵模式部署配置
      //   { host: "localhost", port: 26379 },
      //   { host: "localhost", port: 26380 },
      // ],
      name: "mymaster",
    };
    this.client = new Redisdb(this.config);
     ...
  }
}

```

### 2、RedisController

该 Controller 写了 Redis 的基础示例，包括分布式锁、Zset 限流、令牌桶限流、JWT 登录缓存、Session 登录缓存、以及 Redis 一些基础用法。

##### ①：分布式锁实现

思路：从入参获取当前 ClientId（服务 ID），key_resource_id,(当前上锁资源 ID)，expire(锁过期时间)。之后利用 Redis 的 Set 功能，配置 Nx、Ex、等功能保证锁的唯一性，但同时在业务逻辑未执行完时，执行锁的续期操作。当业务逻辑执行完毕，清除锁。

```typescript
// 尝试获取分布式锁，使用 SET 命令，仅当键不存在时（NX）设置，并设定过期时间（EX）
const isLocked = await this._redis.client.set(
  key_resource_id,
  client_id,
  "EX",
  expire,
  "NX"
);

// 初始化一个定时器变量用于存储续期操作的定时器ID
let timer: string | number | NodeJS.Timeout | undefined;

// 创建一个Promise来管理续期逻辑和最终的锁释放
new Promise<void>((resolve) => {
  // 续期Lua脚本，检查锁是否仍被当前客户端持有，并延长过期时间
  const continueScript = `
        local lockValue = redis.call("GET", KEYS[1])
        if lockValue == ARGV[1] then
          return redis.call("PEXPIRE", KEYS[1], ARGV[2])
        else
          return 0
        end`;
  // 设置一个定时器，每3秒执行一次续期操作,模拟WatchDog,给锁续签功能
  timer = setInterval(async () => {
    // 调用eval执行续期脚本
    // continueScript: 要执行的Lua脚本。
    // 1: 表示传给Lua脚本的KEYS数组的长度，在这里是1个键。
    // key_resource_id: 锁的标识符，对应Lua脚本中的KEYS[1]。
    // client_id: 请求锁的客户端ID，用于验证是否由持有锁的客户端发起续期，对应Lua脚本中的ARGV[1]。
    // expire: 锁需要续期的时间，单位通常为毫秒，对应Lua脚本中的ARGV[2]。
    const result = await this._redis.client.eval(
      continueScript,
      1,
      key_resource_id,
      client_id,
      expire
    );
    global.logger.info("PEXPIRE", result); // 记录续期操作日志
  }, 3000);

  // 在30秒后清除定时器并结束续期逻辑，准备释放锁
  setTimeout(() => {
    clearInterval(timer);
    resolve(); // 解析Promise，继续执行后续逻辑
  }, 30000);
}).then(async () => {
  // 解锁Lua脚本，仅当锁仍被当前客户端持有时删除锁
  const delScript = `
          if redis.call("GET", KEYS[1]) == ARGV[1] then
            return redis.call("DEL", KEYS[1])
          else
            return 0
          end
        `;
  // 执行解锁脚本
  const result = await this._redis.client.eval(
    delScript,
    1,
    key_resource_id,
    client_id
  );
  global.logger.info("result", result); // 记录解锁操作日志
});

global.logger.info("isLocked", isLocked); // 记录加锁结果
if (isLocked === "OK") {
  return "成功加锁";
} else {
  return "加锁失败";
}
```

接下来对这个接口做测试，入参如下：

```json
{
  "key_resource_id": "test_video",
  "client_id": "client1",
  "expire": "5000",
  "value": {
    "video": "xxxxxxxxxxxxxxxxxxxxxx"
  }
}
```

结果解读：首先会打印加锁成功，之后由于我们给锁的 Expire 时间设置为 5000，而续期时间是 3000，所以每隔 3s，我们会对这个锁进行一次续期操作，打印“PEXPIRE”。最后在 30 秒后，执行清理续期定时器，并删除锁，打印 RESULT:OK 。

![image-20240703101350073](C:\Users\Digital\Desktop\notes\koa\assets\image-20240703101350073.png)

##### ②：限流操作

###### 基于时间窗口（Zset）进行限流。

思路非常简单，利用 Redis 的 Zset 数据结构，查询一段时间内的请求数量，假如达到限流次数，就禁止访问。主要用到了 zrangebyscore 和 zadd 操作。假如没有达到限流次数，就允许通过，并根据当前 serviceId，add 一条新的数据。

```typescript
const currentTime = new Date().getTime();

const upStreamTime = currentTime - trafficLimitDto.timeWindow;

const range = await this._redis.client.zrangebyscore(
  trafficLimitDto.serviceId,
  upStreamTime,
  currentTime
);

if (range.length > trafficLimitDto.count) {
  return "超过限流限制，请稍后再试";
}

await this._redis.client.zadd(
  trafficLimitDto.serviceId,
  currentTime,
  currentTime
);

return "暂未到限流限制，可继续使用";
```

###### 基于令牌桶的限流操作

令牌桶算法以一个设定的速率产生令牌并放入令牌桶，每次用户请求都得申请令牌，如果令牌不足，则拒绝请求。
令牌桶算法中新请求到来时会从桶里拿走一个令牌，如果桶内没有令牌可拿，就拒绝服务。

限流桶流程我们可以利用 Redis 的 List，做一个简单的队列，然后我们定时的向这个队列 Push 令牌，这样可以控制令牌流入桶的速率，以达到动态限流的操作。

初始化桶：及定时操作

```typescript
const self = this;
async function initTokenBucket(initialTokens: number) {
  for (let i = 0; i < initialTokens; i++) {
    // 这里用"token"代表一个令牌，实际应用中可以根据需要存储令牌的标识
    await self._redis.client.rpush("tokens_bucket", "token");
  }
}

// 初始化时设置10个令牌（代表空桶）或设置100个令牌
const hasTokenBucket = await self._redis.client.exists("tokens_bucket");
if (hasTokenBucket === 0) {
  initTokenBucket(0); // 或者 initToken(10);
}
// 上锁，看是否初始化令牌桶
const locked = await self._redis.client.exists("hasOpenBucket");
if (locked == 0) {
  self._redis.client.set("hasOpenBucket", "true", "NX");
  setInterval(() => {
    self._redis.client.rpush("tokens_bucket", new Date().getTime());
  }, trafficLimitDto.timeWindow);
}
```

模拟获取令牌操作

```typescript
const token = await this._redis.client.lpop("tokens_bucket");
const length = (await this._redis.client.lrange("tokens_bucket", 0, -1)!)
  .length;
if (length <= 0) {
  return "限流了...请稍后再试";
} else {
  return "没限流，通过了";
}
```

##### ③：Session 登录

Session 登录，我们可以用到 koa-session 和 koa-redis 库，

首先我们可以在 main.ts 使用 koa-session 和 koa-redis 这个库的中间件,我刚开始以为这样配置完还需要做些什么，其实不用啦，使用完这两个中间件，在登录过后，会自动在 context.session 这个对象添加 session 信息，同时 koa-redis 会把 session 信息存储到 redis 内。

```typescript
// sessions
import session from "koa-session";
import redisStore from "koa-redis";

app.keys = ["secretkeys"];
app.use(
  session(
    {
      key: "sessionID",
      store: redisStore({
        client: _redis.client,
      }),
      maxAge: 1 * 24 * 60 * 60 * 1000, // one day
    },
    app
  )
);
```

如下图：请求任意一个接口，这个中间件会给你 Set-Cookie 设置一个 SessionID。之后每个请求都会带上 Cookie，作为鉴权。

![image-20240704180459773](C:\Users\Digital\Desktop\notes\koa\assets\image-20240704180459773.png)

我们也可以在 context.session 内存储用户信息，Redis 也会同步存储。

```typescript
if (ctx.session?.userInfo) {
  return "用户已登录";
}
if (MD5(loginDto.password) === userInfo.password) {
  ctx.session!.userInfo = {
    username: loginDto.username,
    password: MD5(loginDto.password),
  };
  global.logger.info(ctx.session);
} else {
  return "暂无此账号";
}

return ctx.session!.username;
```

如下图，不需要做什么操作，只需要给 context.session 赋值即可，koa-redis 中间件会帮我们存储到 Redis

![image-20240704180722945](C:\Users\Digital\Desktop\notes\koa\assets\image-20240704180722945.png)

##### ④：JWT 登录

JWT 登录其实比较...不知怎么说，其实用 Redis 做 JWT 登录，有些多此一举，大部分用这个场景的都是为了 JWT 续期作用，不想用 Oauth2 的 Refresh-token 功能。所以简单看看吧

```typescript
if (MD5(loginDto.password) === userInfo.password) {
  this._redis.client.set(
    "userInfo:" + loginDto.username,
    JSON.stringify(userInfo),
    "EX",
    20000
  );
  const token = jwt.sign(Object.assign({}, loginDto), Buffer.from(secret), {
    expiresIn: "3h",
  });
  return token;
}
```

##### ⑤：消息队列

Redis 原生就支持消息队列功能，用其 Xadd 和 Xread 功能即可完成，这里我用了一个 worker thread 去模拟第二个客户端发送消息。这里主线程读取消息

```typescript
const processMessage = (message: any) => {
      console.log("Id: %s. Data: %O", message[0], message[1]);
    };

    // 由于同异步问题，利用多线程解决异步问题
    new Worker("./src/threads/xadd.js");

    try {
      // 现在开始尝试读取消息，设置合理的阻塞时间，例如5秒
      const result = await this._redis.client.xread(
        "COUNT",
        1,
        "BLOCK",
        8000,
        "STREAMS",
        "mystream",
        "$"
      );
      if (result && result.length > 0) {
        const [key, messages] = result[0];
        messages.forEach(processMessage);
        return messages;
      } else {
      }
```

发送消息客户端

```typescript
const Redis = require("ioredis");
const _redis = new Redis({
  port: 6379,
  host: "127.0.0.1",
  db: 0,
  showFriendlyErrorStack: true,
  name: "mymaster1",
});
_redis.xadd("mystream", "*", "name", "zcc", "age", "30");
```

##### ⑥：排行榜

排行榜我们可以使用 Redis 提供的 Zset 功能，在这里我们这样做，我们入参可以是一个类似这样的数组：

```json
[
  { "name": "lyx", "score": "20" },
  { "name": "lyx1", "score": "21" },
  { "name": "lyx2", "score": "3" },
  { "name": "lyx3", "score": "4" }
]
```

然后我们对入参做一些处理，通过 flatMqp 转换成 Redis 需要的效果，类似['20', 'lyx', '21', 'lyx1', '3', 'lyx2', '4', 'lyx3']，这种效果，第一个是 Score，第二个是 Name，![image-20240705091750157](C:\Users\Digital\Desktop\notes\koa\assets\image-20240705091750157.png)

```typescript
this._redis.client.zadd(
  "分数排行榜",
  ...RankingList.flatMap((ranking) => [ranking.score, ranking.name]) // 使用flatMap扁平化数组并配对分数和名字
);

//     "分数排行榜"：有序集合的键名。
// 0：起始索引，0表示从第一个元素开始。
// -1：结束索引，-1表示直到最后一个元素。
// "WITHSCORES"：选项，指示返回每个成员及其对应的分数。
const redisResult = await this._redis.client.zrevrange(
  "分数排行榜",
  0,
  -1,
  "WITHSCORES"
);
//RedisResult: ['lyx1', '21', 'lyx', '20', 'lyx3', '4', 'lyx2', '3']
const formattedResult = redisResult.reduce((acc: any, value, index) => {
  if (index % 2 === 0) {
    // 偶数索引表示member
    acc.push({ name: value });
  } else {
    // 奇数索引表示score，与上一个member配对
    acc[acc.length - 1].score = value;
  }
  return acc;
}, []);

return formattedResult;
```
