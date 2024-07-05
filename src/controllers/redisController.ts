import { Context } from "koa";
import Redis from "../redis";
import {
  Controller,
  Param,
  Body,
  Get,
  Post,
  Put,
  Delete,
  QueryParam,
  Ctx,
} from "routing-controllers";
import jwt from "jsonwebtoken";
import IoRedis from "ioredis";
import MD5 from "../utils/md5";
import RankingListDto from "../dto/rankingListDto";
import DistributedLockDto from "../dto/distributedLockDto";
import LoginDto from "../dto/loginDto";
import { secret } from "../config/jwtConfig";
import TrafficLimitDto from "../dto/trafficLimitDto";
import { Worker } from "worker_threads";

const userInfo = {
  userName: "testuser",
  password: MD5("testpassword"),
};

@Controller("/redis")
export default class RedisController {
  _redis = new Redis();

  // 实现Session存储
  @Post("/login")
  public async login(@Body() loginDto: LoginDto, @Ctx() ctx: Context) {
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
  }

  // 实现Jwt存储
  @Post("/loginUseJwt")
  public async loginUseJwt(@Body() loginDto: LoginDto, @Ctx() ctx: Context) {
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
  }

  @Post("/setRankingList")
  public async setRankingList(@Body() RankingList: RankingListDto[]) {
    console.log(
      RankingList.flatMap((ranking) => [ranking.score, ranking.name])
    );
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
    // ['lyx1', '21', 'lyx', '20', 'lyx3', '4', 'lyx2', '3']
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
  }

  @Get("/usePubSub")
  public async usePubSub() {
    const sub = new IoRedis();
    const pub = new IoRedis();

    sub.subscribe("my-channel-1", (err, count) => {
      if (err) {
        // Just like other commands, subscribe() can fail for some reasons,
        // ex network issues.
        console.error("Failed to subscribe: %s", err.message);
      } else {
        // `count` represents the number of channels this client are currently subscribed to.
        console.log(
          `Subscribed successfully! This client is currently subscribed to ${count} channels.`
        );
      }
    }); // From now, `sub` enters the subscriber mode.

    sub.on("message", (channel, message) => {
      console.log(`Received ${message} from ${channel}`);
    });

    setTimeout(() => {
      // `pub` can be used to publish messages, or send other regular commands (e.g. `hgetall`)
      // because it's not in the subscriber mode.
      pub.publish("my-channel-1", "testMessage");
    }, 1000);
  }

  @Get("/usePipeLine")
  public async usePipeLine() {
    // `exec` also returns a Promise:
    const promise = this._redis.client
      .pipeline()
      .set("foo", "bar")
      .get("foo")
      .exec();
    promise.then((result) => {
      console.log("🚀 ~ RedisController ~ promise.then ~ result:", result);
      //🚀 ~ RedisController ~ promise.then ~ result: [ [ null, 'OK' ], [ null, 'bar' ] ]
    });
  }

  @Get("/useTransation")
  public async useTransation() {
    // `exec` also returns a Promise:
    const promise = this._redis.client
      .multi()
      .set("foo", "bar")
      .get("foo")
      .exec();
    promise.then((result) => {
      console.log("🚀 ~ RedisController ~ promise.then ~ result:", result);
      //🚀 ~ RedisController ~ promise.then ~ result: [ [ null, 'OK' ], [ null, 'bar' ] ]
    });
  }

  @Get("/useMonitor")
  public async useMonitor() {
    const monitor = await this._redis.client.monitor();
    monitor.on("monitor", console.log);
    setTimeout(() => {
      // 这里可以执行其他任务
      monitor.disconnect(); // 当需要停止监控时，调用disconnect
    }, 10000);
  }

  @Get("/useMessageQueue")
  public async useMessageQueue() {
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
        console.log("No messages available within the blocking period.");
        return [];
      }
    } catch (error) {
      console.error("Error reading from stream:", error);
      throw error;
    }
  }

  /**
   * 创建一个分布式锁并自动续期，最终释放锁
   * @Post decorator 定义了这是一个HTTP POST请求的处理函数
   * @param distributedLockDto 请求体携带的分布式锁参数
   */
  @Post("/setDistributedLock")
  public async setDistributedLock(
    @Body() distributedLockDto: DistributedLockDto
  ) {
    // 解构请求体中的参数
    const { key_resource_id, expire, client_id } = distributedLockDto;

    try {
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
    } catch (error) {
      // 异常处理，例如清除定时器、记录错误日志等
      global.logger.error("An error occurred during lock handling:", error);
      throw error; // 或者根据实际情况处理错误，如返回错误信息
    }
  }

  @Post("/setTrafficLimitUseZset")
  public async setTrafficLimit(@Body() trafficLimitDto: TrafficLimitDto) {
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
  }

  @Post("/setTrafficLimitUseTokenBucket")
  public async setTrafficLimitUseTokenBucket(
    @Body() trafficLimitDto: TrafficLimitDto
  ) {
    const self = this;
    async function initTokenBucket(initialTokens: number) {
      for (let i = 0; i < initialTokens; i++) {
        await self._redis.client.rpush("tokens_bucket", "token"); // 这里用"token"代表一个令牌，实际应用中可以根据需要存储令牌的标识
      }
    }

    // 初始化时设置10个令牌（代表空桶）或设置100个令牌
    const hasTokenBucket = await self._redis.client.exists("tokens_bucket");
    if (hasTokenBucket === 0) {
      initTokenBucket(0); // 或者 initToken(10);
    }

    const locked = await self._redis.client.exists("hasOpenBucket");
    if (locked == 0) {
      self._redis.client.set("hasOpenBucket", "true", "NX");
      setInterval(() => {
        self._redis.client.rpush("tokens_bucket", new Date().getTime());
      }, trafficLimitDto.timeWindow);
    }
  }

  @Get("/getTokens")
  public async getTokens() {
    const token = await this._redis.client.lpop("tokens_bucket");
    const length = (await this._redis.client.lrange("tokens_bucket", 0, -1)!)
      .length;
    if (length <= 0) {
      return "限流了...请稍后再试";
    } else {
      return "没限流，通过了";
    }
  }
}
