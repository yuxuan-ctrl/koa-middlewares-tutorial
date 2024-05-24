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
}
