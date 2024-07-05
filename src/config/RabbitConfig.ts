const { MQ_HOST, HOST, MQ_PORT } = process.env;
const mqHost = MQ_HOST || HOST || "127.0.0.1";
const mqPort = MQ_PORT || 5672;
const mqUsername = "guest";
const mqPassword = "guest";
const mqProtocol = "amqp";
const exchangeName = "exchange"; //交换机
const queueName = "queue_direct_saas";
const routingKey = "saasIsolution"; //路由key
const FANOUT_EXCHANGE_NAME = "fanoutExchange";
const DIRECT_EXCHANGE_NAME = "directExchange";
const TOPIC_EXCHANGE_NAME = "topicExchange";
const HEADERS_EXCHANGE_NAME = "headersExchange";
const FANOUT_QUEUE_NAME = "fanoutQueue1";
const DIRECT_QUEUE_NAME = "directQueue1";
const TOPIC_QUEUE_NAME1 = "topicQueue1";
const TOPIC_QUEUE_NAME2 = "topicQueue2";
const HEADERS_QUEUE_NAME2 = "headersQueue";
const TOPIC_ROUTERKEY1 = "#.com";
const TOPIC_ROUTERKEY2 = "www.*";
const RPC_EXCHANGE_NAME = "rpcExchange";
const RPC_MSG_EXCHANGE_NAME = "rpcMsgExchange";
const RPC_REPLY_EXCHANGE_NAME = "rpcReplyExchange";
const RPC_MSG_QUEUE_NAME = "recMsgQueue";
const RPC_REPLY_QUEUE_NAME = "recReplyQueue";
const RPC_ROUTER_KEY = "rpcRouterKey";
const NORMAL_QUEUE_NAME = "normalQueue";
const DEAD_LETTER_EXCHANGE_NAME = "deadLettersExchange";
const DEAD_LETTER_QUEUE_NAME = "deadLettersQueue";
const DEAD_LETTER_ROUTER_KEY = "deadLettersRouterKey";
const config = {
  mqHost,
  mqPort,
  mqUsername,
  mqPassword,
  mqProtocol,
  exchangeName,
  queueName,
  routingKey,
  FANOUT_QUEUE_NAME,
  DIRECT_QUEUE_NAME,
  FANOUT_EXCHANGE_NAME,
  DIRECT_EXCHANGE_NAME,
  TOPIC_QUEUE_NAME1,
  TOPIC_QUEUE_NAME2,
  TOPIC_EXCHANGE_NAME,
  TOPIC_ROUTERKEY1,
  TOPIC_ROUTERKEY2,
  HEADERS_EXCHANGE_NAME,
  HEADERS_QUEUE_NAME2,
  RPC_MSG_EXCHANGE_NAME,
  RPC_REPLY_EXCHANGE_NAME,
  RPC_MSG_QUEUE_NAME,
  RPC_REPLY_QUEUE_NAME,
  RPC_ROUTER_KEY,
  RPC_EXCHANGE_NAME,
  DEAD_LETTER_EXCHANGE_NAME,
  DEAD_LETTER_QUEUE_NAME,
  DEAD_LETTER_ROUTER_KEY,
  NORMAL_QUEUE_NAME,
};

export default config;
