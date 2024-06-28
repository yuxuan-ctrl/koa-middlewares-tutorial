const Redis = require("ioredis");
const _redis = new Redis({
  port: 6379,
  host: "127.0.0.1",
  db: 0,
  showFriendlyErrorStack: true,
  name: "mymaster1",
});
_redis.xadd("mystream", "*", "name", "zcc", "age", "30");
