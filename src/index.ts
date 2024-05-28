import Koa from "koa";
import { useKoaServer, Action } from "routing-controllers";
import "reflect-metadata";
import session from "koa-session";
import redisStore from "koa-redis";
import path from "path";
import log4j, { Logger } from "log4js";
import { RunConfig, log4jsConfig } from "./config/index";
import Redis from "./redis";

declare var global: typeof MyGlobal;

declare global {
  namespace MyGlobal {
    var logger: Logger;
  }
}

const app = new Koa();
const _redis = new Redis();

// sessions
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

//logger
log4j.configure(log4jsConfig);
global.logger = log4j.getLogger(); // 在Node.js中使用global

useKoaServer(app, {
  cors: {
    origin: "*",
    maxAge: 2592000,
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "Accept"],
    exposeHeaders: ["WWW-Authenticate", "Server-Authorization"],
  },
  defaults: {
    nullResultCode: 404,
    undefinedResultCode: 204,
  },
  routePrefix: "/api",
  controllers: [path.join(__dirname, "/controllers/**/*.ts")],
  middlewares: [path.join(__dirname, "/middlewares/**/*.ts")],
  defaultErrorHandler: false,
  authorizationChecker: async (action: Action, roles?: string[]) => {
    return true;
  },
});

app.listen(RunConfig.port, () => {
  console.log(`http://${RunConfig.host}:${RunConfig.port} is started`);
});
