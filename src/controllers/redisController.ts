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
import Logger from "log4js";
import RankingListDto from "../dto/rankingListDto";
import DistributedLockDto from "../dto/distributedLockDto";

@Controller("/redis")
export default class RedisController {
  _redis = new Redis();

  // 实现Session存储
  @Get("/setSession")
  public async setSession(
    @QueryParam("name") name: string,
    @Ctx() ctx: Context
  ) {
    global.logger.info(ctx.session);
    ctx.session!.name = name as string;

    return ctx.session!.name;
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

  @Post("/setDistributedLock")
  public async setDistributedLock(
    @Body() distributedLockDto: DistributedLockDto
  ) {
    const { key_resource_id, expire, client_id } = distributedLockDto;

    const isLocked = await this._redis.client.set(
      key_resource_id,
      client_id,
      "EX",
      expire,
      "NX"
    );

    new Promise((resolve: any, reject: any) => {
      return setTimeout(() => resolve(), 3000);
    }).then(async () => {
      const delScript = `
          if redis.call("GET", KEYS[1]) then
            return redis.call("DEL", KEYS[1])
          else
            return 0
          end
        `;
      const result = await this._redis.client.eval(
        delScript,
        1,
        key_resource_id
      );
      global.logger.info("result", result);
    });

    global.logger.info("isLocked", isLocked);
    if (isLocked === "OK") {
      return "成功加锁";
    } else {
      return "加锁失败";
    }
  }
}
