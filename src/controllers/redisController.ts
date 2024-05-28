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
import MD5 from "../utils/md5";
import RankingListDto from "../dto/rankingListDto";
import DistributedLockDto from "../dto/distributedLockDto";
import LoginDto from "../dto/loginDto";
import { secret } from "../config/jwtConfig";

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
    // const oldUserInfo = await this._redis.client.get(
    //   "userInfo:" + loginDto.username
    // );

    // if (oldUserInfo) {
    //   return oldUserInfo;
    // }

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
    this._redis.client.zadd(
      "分数排行榜",
      ...RankingList.flatMap((ranking) => [ranking.score, ranking.name]) // 使用flatMap扁平化数组并配对分数和名字
    );

    const redisResult = await this._redis.client.zrevrange(
      "分数排行榜",
      0,
      -1,
      "WITHSCORES"
    );

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
        // 设置一个定时器，每3秒执行一次续期操作
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
}
