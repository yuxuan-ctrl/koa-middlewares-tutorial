import { Middleware, KoaMiddlewareInterface } from "routing-controllers";
import { ResponseReturn } from "./public/responseReturn";
import Redis from "../redis";
import { secret, whiteList } from "../config/jwtConfig";
import Jwt from "jsonwebtoken";
import LoginDto from "../dto/loginDto";
import { Context } from "koa";
@Middleware({ type: "before" })
export default class SessionHandler implements KoaMiddlewareInterface {
  _redis = new Redis();
  use(context: Context, next: (err?: any) => Promise<any>): Promise<any> {
    if (whiteList.includes(context.url)) {
      return next();
    } else {
      if (context.header?.authorization) {
        const authorization = context.header.authorization.replace(
          "Bearer ",
          ""
        );
        const decode = Jwt.verify(
          authorization,
          Buffer.from(secret)
        ) as LoginDto;
        global.logger.info(decode);
        this._redis.client.set(
          "userInfo:" + decode.username,
          JSON.stringify(decode),
          "EX",
          20000
        );
        return next();
      } else {
        context.status = 401;
        const reponse: ResponseReturn = {
          code: 401,
          data: "用户未登录",
          message: "UnAuthorized" || "Success",
        };
        context.type = "json";
        context.body = reponse;
        return Promise.resolve();
      }
    }
  }
}
