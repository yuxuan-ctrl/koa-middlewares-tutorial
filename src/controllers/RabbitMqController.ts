import { Context } from "koa";
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
import amqp, { Message } from "amqplib";
import { sleep } from "../utils";
import RabbitConfig from "../config/RabbitConfig";
import { getConnection } from "../mq/ConnectionUtil";

let connection: amqp.Connection;
let channel: amqp.Channel;

(async function () {
  connection = await getConnection();
  channel = await connection.createChannel();
})();

@Controller("/rabbitmq")
export default class RabbitMqController {
  constructor() {}

  @Get("/simpleModeProvider")
  public async simpleModeProvider() {
    //添加一个队列
    channel.assertQueue(RabbitConfig.queueName, {
      durable: true,
    });

    const message = "Hello World";

    const status = channel.sendToQueue(
      RabbitConfig.queueName,
      Buffer.from(message)
    );

    return status
      ? `成功发送至${RabbitConfig.queueName}`
      : `失败发送至${RabbitConfig.queueName}`;
  }

  @Get("/simpleModeConsumer")
  public async simpleModeConsumer() {
    let message = "";
    //添加一个队列
    channel.assertQueue(RabbitConfig.queueName, {
      durable: true,
    });

    await channel.consume(
      RabbitConfig.queueName,
      (msg) => {
        message = msg?.content.toLocaleString() as string;
        global.logger.info(message);
        channel.ack(msg as Message);
      },
      { noAck: false }
    );

    channel.close();
    return message;
  }

  @Get("/workerModeProvider")
  public async workerModeProvider() {
    //添加一个队列
    channel.assertQueue(RabbitConfig.queueName, {
      durable: true,
    });

    const message = "Hello World";

    for (let i = 0; i < 50; i++) {
      const status = channel.sendToQueue(
        RabbitConfig.queueName,
        Buffer.from(message)
      );
      global.logger.info(
        status
          ? `成功发送至${RabbitConfig.queueName}`
          : `失败发送至${RabbitConfig.queueName}`
      );
    }
  }

  @Get("/workerModeConsumer")
  public async workerModeConsumer() {
    await this.getConsumer(async () => {
      await sleep(20);
      return { name: "channelWorker1" };
    });
    await this.getConsumer(() => {
      return { name: "channelWorker2" };
    });
  }

  @Get("/fanoutModeProvider")
  public async fanoutModeProvider() {
    // 声明一个交换机
    channel.assertExchange(RabbitConfig.FANOUT_EXCHANGE_NAME, "fanout", {
      durable: true,
    });

    const message = "Hello World";

    for (let i = 0; i < 50; i++) {
      channel.publish(
        RabbitConfig.FANOUT_EXCHANGE_NAME,
        "", //
        Buffer.from(message + i)
      );
    }
  }

  @Get("/fanoutModeConsumer")
  public async fanoutModeConsumer() {
    // 声明一个队列
    channel.assertQueue(RabbitConfig.FANOUT_QUEUE_NAME, {
      durable: true,
    });
    // 绑定交换机和队列的关系
    channel.bindQueue(
      RabbitConfig.FANOUT_QUEUE_NAME,
      RabbitConfig.FANOUT_EXCHANGE_NAME,
      ""
    );
    //消费
    channel.consume(
      RabbitConfig.FANOUT_QUEUE_NAME,
      (msg) => {
        const message = msg?.content.toLocaleString();
        global.logger.info(
          message + "-------------" + RabbitConfig.FANOUT_QUEUE_NAME
        );
      },
      { noAck: true }
    );
  }

  @Get("/directModeProvider")
  public async directModeProvider() {
    // 声明一个交换机
    channel.assertExchange(RabbitConfig.DIRECT_EXCHANGE_NAME, "direct", {
      durable: true,
    });

    const message = "Hello World";

    for (let i = 0; i < 50; i++) {
      channel.publish(
        RabbitConfig.DIRECT_EXCHANGE_NAME,
        RabbitConfig.routingKey, //
        Buffer.from(message + i)
      );
    }
  }

  @Get("/directModeConsumer")
  public async directModeConsumer() {
    // 声明一个队列
    channel.assertQueue(RabbitConfig.DIRECT_QUEUE_NAME, {
      durable: true,
    });
    // 绑定交换机和队列的关系 需要绑定的Router key 与交换机的相同
    channel.bindQueue(
      RabbitConfig.DIRECT_QUEUE_NAME,
      RabbitConfig.DIRECT_EXCHANGE_NAME,
      RabbitConfig.routingKey
    );
    //消费
    channel.consume(
      RabbitConfig.DIRECT_QUEUE_NAME,
      (msg) => {
        const message = msg?.content.toLocaleString();
        global.logger.info(
          message + "-------------" + RabbitConfig.DIRECT_QUEUE_NAME
        );
      },
      { noAck: true }
    );
  }

  @Get("/topicModeProvider")
  public async topicModeProvider() {
    // 声明一个交换机
    channel.assertExchange(RabbitConfig.TOPIC_EXCHANGE_NAME, "topic", {
      durable: true,
    });

    channel.publish(
      RabbitConfig.TOPIC_EXCHANGE_NAME,
      "www.abc.com", //
      Buffer.from("www.abc.com" + "----------------")
    );
    channel.publish(
      RabbitConfig.TOPIC_EXCHANGE_NAME,
      "www.efg", //
      Buffer.from("www.efg" + "----------------")
    );
    channel.publish(
      RabbitConfig.TOPIC_EXCHANGE_NAME,
      "hij.com", //
      Buffer.from("hij.com" + "----------------")
    );
    channel.publish(
      RabbitConfig.TOPIC_EXCHANGE_NAME,
      "klm", //
      Buffer.from("klm" + "----------------")
    );
  }

  @Get("/topicModeConsumer")
  public async topicModeConsumer() {
    // 声明多个队列匹配TOPIC
    channel.assertQueue(RabbitConfig.TOPIC_QUEUE_NAME1, {
      durable: true,
    });
    channel.assertQueue(RabbitConfig.TOPIC_QUEUE_NAME2, {
      durable: true,
    });

    // 绑定交换机和队列的关系 需要绑定的Router key 与交换机的相同
    channel.bindQueue(
      RabbitConfig.TOPIC_QUEUE_NAME1,
      RabbitConfig.TOPIC_EXCHANGE_NAME,
      RabbitConfig.TOPIC_ROUTERKEY1
    );
    channel.bindQueue(
      RabbitConfig.TOPIC_QUEUE_NAME2,
      RabbitConfig.TOPIC_EXCHANGE_NAME,
      RabbitConfig.TOPIC_ROUTERKEY2
    );

    //消费
    channel.consume(
      RabbitConfig.TOPIC_QUEUE_NAME1,
      (msg) => {
        const message = msg?.content.toLocaleString();
        global.logger.info(
          message +
            "-------" +
            RabbitConfig.TOPIC_ROUTERKEY1 +
            "-------" +
            RabbitConfig.TOPIC_QUEUE_NAME1
        );
      },
      { noAck: true }
    );
    channel.consume(
      RabbitConfig.TOPIC_QUEUE_NAME2,
      (msg) => {
        const message = msg?.content.toLocaleString();
        global.logger.info(
          message +
            "-----" +
            RabbitConfig.TOPIC_ROUTERKEY2 +
            "------" +
            RabbitConfig.TOPIC_QUEUE_NAME2
        );
      },
      { noAck: true }
    );
  }

  @Get("/headersModeProvider")
  public async headersModeProvider() {
    // 声明一个交换机
    channel.assertExchange(RabbitConfig.HEADERS_EXCHANGE_NAME, "headers", {
      durable: true,
    });

    for (let i = 0; i < 3; i++) {
      channel.publish(
        RabbitConfig.HEADERS_EXCHANGE_NAME,
        "", //
        Buffer.from("www.abc.com" + "----------------" + i),
        {
          headers: {
            data: "test",
          },
        }
      );
    }
  }

  @Get("/headersModeConsumer")
  public async headersModeConsumer() {
    channel.assertQueue(RabbitConfig.HEADERS_QUEUE_NAME2, {
      durable: true,
    });

    channel.bindQueue(
      RabbitConfig.HEADERS_QUEUE_NAME2,
      RabbitConfig.HEADERS_EXCHANGE_NAME,
      "",
      {
        data: "test1", // 只要data字段匹配上即可，值不重要
      }
    );

    //消费
    channel.consume(
      RabbitConfig.HEADERS_QUEUE_NAME2,
      (msg) => {
        const message = msg?.content.toLocaleString();
        global.logger.info(
          message + "-------------" + RabbitConfig.HEADERS_QUEUE_NAME2
        );
      },
      { noAck: true }
    );
  }

  @Get("/rpcModeProvider")
  public async rpcModeProvider() {
    await this.initRpc();

    channel.bindQueue(
      RabbitConfig.RPC_MSG_QUEUE_NAME,
      RabbitConfig.RPC_EXCHANGE_NAME,
      RabbitConfig.RPC_ROUTER_KEY
    );

    channel.consume(
      RabbitConfig.RPC_REPLY_QUEUE_NAME,
      (msg) => {
        global.logger.info("收到SERVER数据" + msg?.content.toLocaleString());
      },
      {
        noAck: true,
      }
    );
    for (let i = 0; i < 3; i++) {
      channel.publish(
        RabbitConfig.RPC_EXCHANGE_NAME,
        RabbitConfig.RPC_ROUTER_KEY,
        Buffer.from("发送至Server"),
        {
          correlationId: "RPC" + Math.random(),
          replyTo: RabbitConfig.RPC_REPLY_QUEUE_NAME,
        }
      );
    }
  }

  @Get("/rpcModeConsumer")
  public async rpcModeConsumer() {
    await this.initRpc();

    channel.consume(
      RabbitConfig.RPC_MSG_QUEUE_NAME,
      async (msg) => {
        global.logger.info("收到Client数据" + msg?.content.toLocaleString());
        // 模拟业务处理
        await sleep(2000);

        channel.sendToQueue(
          msg?.properties.replyTo,
          Buffer.from("发送至Client"),
          { correlationId: msg!.properties.correlationId }
        );
      },
      {
        noAck: true,
      }
    );
  }

  @Get("/deadletterProvider")
  public async deadletterProvider() {
    channel.assertExchange(RabbitConfig.DEAD_LETTER_EXCHANGE_NAME, "direct", {
      durable: true,
    });
    channel.assertQueue(RabbitConfig.DEAD_LETTER_QUEUE_NAME, { durable: true });
    channel.assertQueue(RabbitConfig.NORMAL_QUEUE_NAME, {
      durable: true,
      arguments: {
        "x-dead-letter-exchange": "",
        "x-dead-letter-routing-key": RabbitConfig.DEAD_LETTER_QUEUE_NAME,
      },
    });
    for (let i = 0; i < 11; i++) {
      channel.sendToQueue(
        RabbitConfig.NORMAL_QUEUE_NAME,
        Buffer.from(i.toString())
      );
    }
    channel.consume(
      RabbitConfig.DEAD_LETTER_QUEUE_NAME,
      (msg) => {
        global.logger.info(msg?.content.toLocaleString());
      },
      { noAck: true }
    );
  }

  @Get("/deadletterConsumer")
  public async deadletterConsumer() {
    channel.consume(
      RabbitConfig.NORMAL_QUEUE_NAME,
      (msg) => {
        const content = msg!.content.toString();
        console.log(`Received: ${content}`);
        try {
          // 模拟处理逻辑，这里假设偶数消息处理失败
          if (Number(content) % 2 === 0) throw new Error("Processing failed");
          channel.ack(msg!);
        } catch (error: any) {
          console.error(`Failed to process message: ${error.message}`);
          channel.nack(msg!, false, false); // 不重新入队列
        }
      },
      { noAck: false }
    );
  }

  async initRpc() {
    await channel.assertExchange(RabbitConfig.RPC_EXCHANGE_NAME, "topic", {
      durable: true,
    });
    await channel.assertQueue(RabbitConfig.RPC_MSG_QUEUE_NAME, {
      durable: true,
    });
    await channel.assertQueue(RabbitConfig.RPC_REPLY_QUEUE_NAME, {
      durable: true,
    });
  }

  async getConsumer(func: Function) {
    let count = 0;
    const channel = await connection.createChannel();
    let message = "";
    //添加一个队列
    channel.assertQueue(RabbitConfig.queueName, {
      durable: true,
    });
    // 表示RabbitMQ每次只会给消费者推送一条消息，直到这条消息被确认（acknowledged）后，才会推送下一条。这样可以避免单一消费者因处理速度较慢而导致的消息积压。
    await channel.prefetch(1, false);
    // 消费回调函数
    await channel.consume(
      RabbitConfig.queueName,
      async (msg) => {
        const { name } = await func();
        message = msg?.content.toLocaleString() as string;
        channel.ack(msg as Message);
        count = count + 1;
        global.logger.info(count + "---------------" + name);
      },
      { noAck: false }
    );

    return { channel, count };
  }
}
