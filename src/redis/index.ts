import redisStore from "koa-redis";
import Redisdb from "ioredis";

export default class Redis {
  config: { port: number; host: string; db: number };
  client: any;
  options: { client: any; db: number };
  store: any;
  lockLeaseTime: any;
  lockTimeout: any;
  expireMode: any;
  setMode: any;
  constructor(options: any = {}) {
    this.config = {
      port: 6379,
      host: "127.0.0.1",
      db: 0,
    };
    this.client = new Redisdb(this.config);

    this.options = { client: this.client, db: 0 };
    this.store = redisStore(this.options);

    this.lockLeaseTime = options.lockLeaseTime || 2; // 默认锁过期时间 2 秒
    this.lockTimeout = options.lockTimeout || 5; // 默认锁超时时间 5 秒
    this.expireMode = options.expireMode || "EX";
    this.setMode = options.setMode || "NX";
  }

  async storeClient() {
    return this.store.client;
  }

  async set(key: string, value: any, expiryMode: any, time: any) {
    return this.client.set(key, value, expiryMode, time);
  }

  async get(key: string) {
    return this.client.get(key);
  }

  async hmset(key: string, data: any) {
    return this.client.hmset(key, data);
  }

  async expire(key: string, time: number) {
    return this.client.expire(key, time);
  }

  async hmget(key: string) {
    return this.client.hgetall(key);
  }

  async getAllKey() {
    return this.client.keys("*");
  }

  async lock(key: string, value: any, expire: number) {
    console.log("进来了！！！！！！！！！");
    const start = Date.now();
    const self = this;

    (async function () {
      try {
        console.log(11111111111111111);
        const result = await self.set(key, value, self.expireMode, expire);
        console.log("--------------------------------");
        console.log(result);
      } catch (err) {}
    })();
  }
}
