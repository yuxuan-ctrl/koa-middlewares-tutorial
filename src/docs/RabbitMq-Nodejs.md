# Nodejs(Koa)-Rabbit 集成及基础使用

Nodejs 框架使用 Koa，使用 amqplib 库连接 RabbitMq。本文主要介绍 Nodejs 如何连接 RabbitMq，同时实现其基础功能，例如其简单模式、工作者模式、Fanout 广播模式、Direct 直连模式、Topic 模式.....

### 1、连接 Mq 的配置类

用于连接 RabbitMq，返回 getConnection 方法。RabbitMq 有几个概念我们可以事先了解一下：

- **Connection（连接）**：Connection 指的是客户端与 RabbitMQ 服务器之间建立的 TCP 连接。这个连接是物理层面的，它构成了客户端与消息代理之间通信的基础管道。每个连接的建立都需要经过 TCP 握手等网络协议过程，因此创建连接是一个相对重量级的操作。
- **Channel（信道）**：Channel 是在已建立的 Connection 内部的一个轻量级的虚拟连接。它是一个逻辑上的概念，允许在同一个物理连接上进行多路复用通信。每个 Channel 都有自己的唯一的 ID，并且能够独立地执行 AMQP 协议的操作。

- **Exchange（交换器）**：Exchange 是 RabbitMQ 内部用来路由消息的组件。消息发布到 Exchange 上时，会根据 Exchange 的类型（如 direct、fanout、topic 等）和 Routing Key 规则，决定消息应该被投递到哪些 Queue 中。
- **Queue（队列）**：Queue 是消息的实际容器，用于存储未被消费者消费的消息。每个 Queue 都有一个唯一的名称，并且可以被多个消费者订阅。消息会被持久化或者非持久化地存储在 Queue 中，直到被消费。
- **Binding（绑定）**：绑定是 Exchange 和 Queue 之间的关联关系。它定义了 Exchange 如何将消息路由到特定的 Queue，通常基于 Routing Key。
- **Routing Key（路由键）**：发布消息时指定的字符串，用于在 Exchange 决定消息流向时匹配 Queue 的绑定规则。
- **Virtual Host（虚拟主机）**：RabbitMQ 中一个逻辑上的分隔单元，允许将单一的 RabbitMQ 实例分割为多个独立的、权限隔离的区域。每个 Virtual Host 有自己独立的队列、交换器、绑定等资源。
- **Message（消息）**：最基本的数据单元，由消息头（包含属性如 Routing Key、消息优先级等）和消息体（实际的数据）组成。
- **Publisher（生产者）**：生产者是创建并发送消息的应用程序组件。
- **Consumer（消费者）**：消费者是从 Queue 中接收并处理消息的应用程序组件。

```typescript
const { mqHost, mqPort, mqUsername, mqPassword, mqProtocol } = RabbitConfig;

const getConnection = async () => {
  const connection = await amqp.connect({
    protocol: mqProtocol,
    hostname: mqHost,
    port: mqPort as number,
    username: mqUsername,
    password: mqPassword,
  });
  return connection;
};
```

### 2、RabbitMqController

首先新建一个可复用的 Connection 和 Channel

```typescript
(async function () {
  connection = await getConnection();
  channel = await connection.createChannel();
})();
```

该 Controller 写了 RabbitMq 的基础示例，包括其几种模式的示例。

##### ①：SimpleMode 简单模式

![image-20211125221123994](C:\Users\Digital\Desktop\notes\koa\assets\8a28bbb8828b943846a9de6a14a4b6d6.png)

Producer

```typescript
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
```

Consumer：

```typescript
let message = "";
//添加一个队列
channel.assertQueue(RabbitConfig.queueName, {
  durable: true,
});
// 消费RabbitConfig.queueName队列内的数据
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
```

##### ②：工作者模式

是工作队列模式，也就是一个生产者、多个消费者、一个队列

![image-20211125223948667](C:\Users\Digital\Desktop\notes\koa\assets\b576b084a273203222ec43d3b0154d3e.png)

Producer：

```typescript
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
}
```

Consumer：

这里可以注意一个 prefetch 方法，这个是打开了 RabbitMq 的多能力多劳的模式，哪个 Consumer 能消费的快，他就会收到多一点。

还有一个无需自动 Ack 的配置，ACK 即告诉 Mq 你已经完成消息的接收，然后你可以在 consume 方法配置｛noAck:true｝打开自动 ACK，也可以配置为 FALSE，手动 ACK。接受的参数是，consume 方法的参数 Message。

```typescript
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
      },
      { noAck: false }
    );

    return { channel, count };
  }

 await this.getConsumer(async () => {
      await sleep(20);
      return { name: "channelWorker1" };
    });
    await this.getConsumer(() => {
      return { name: "channelWorker2" };
    });
```

![image-20240705103841678](C:\Users\Digital\Desktop\notes\koa\assets\image-20240705103841678.png)

最后结果如上图，channelWorker2 因为没有 sleep(20)的限制，一共 50 条的数据，他消费了 42 条，worker1 仅仅抢到了 8 条。

##### ③：Exchange 介绍

交换机介绍：交换机工作的内容非常简单，一方面它接收来自生产者的消息，另一方面将它们推入队列。交换机必须确切知道如何处理收到的消息。是应该把这些消息放到特定队列还是说把他们到许多队列中还是说应该丢弃它们。这就的由交换机的类型来决定。

![image-20211126152108121](C:\Users\Digital\Desktop\notes\koa\assets\012795e38655da09d2efd65ef205be8b.png)

注意：在我实际开发过程中，遇到一个比较坑的问题，就是我们得知道，有一个交换机叫默认交换机，它有一个特殊的属性使得它对于简单应用特别有用处:那就是每个新建队列(queue)都会自动绑定到默认交换机上，绑定的路由键(routing key)名称与队列名称相同。

举个例子：就是我 Assert 一个 Queue，但是他没有 Bind 任何 Exchange，这时绑定的是默认的 Exchange，同时 Exchange 和 Queue 之间的 RouterKey 就是 Queue 的名字。

##### ④：Fanout(广播模式)

Fanout 模式是最简单的发布订阅模式，没有什么限制，就是发布和订阅的过程，Producer 发送消息到 Exchange（交换机），Consumer 订阅一个绑定了 Exchange 的 Queue，从这个 Queue 获取消息。
![image-20211126183130247](C:\Users\Digital\Desktop\notes\koa\assets\bd4847ce999e2a93ad849304dfb650ba.png)

Producer：

```typescript
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
```

Consumer:

```typescript
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
```

##### ⑤：Direct 模式

direct 类型的工作方式是：消息只去到它绑定的 routingKey 队列中去。即，哪些队列绑定了 Exchange 的同时，还能匹配上 RouterKey。这样队列才会收到这条消息。

![img](C:\Users\Digital\Desktop\notes\koa\assets\3d7c96c1569ca173ad7522b8f1444e9a.png)

主要代码如下，Publish 的时候比 Fanout 模式多了一个 routerkey

```json
// 声明一个Direct交换机
    channel.assertExchange(RabbitConfig.DIRECT_EXCHANGE_NAME, "direct", {
      durable: true,
    });

	 channel.publish(
        RabbitConfig.DIRECT_EXCHANGE_NAME,
        RabbitConfig.routingKey, //
        Buffer.from(message + i)
      );
```

Consumer:

在队列和 Exchange 绑定时，多了一个 Routerkey,其他与 Fanout 模式并无太大差别

```typescript
// 绑定交换机和队列的关系 需要绑定的Router key 与交换机的相同
channel.bindQueue(
  RabbitConfig.DIRECT_QUEUE_NAME,
  RabbitConfig.DIRECT_EXCHANGE_NAME,
  RabbitConfig.routingKey
);
```

##### ⑥：Topic 模式

Topic 与 Direct 的本质区别就是针对于 RouterKey，Direct 是一对一匹配的，而 Topic 是有匹配规则的，比如匹配任意以.com 结尾的 RouterKey，也可以匹配任意开头的。

- 星号`*`可以代替一个单词
- 井号`#`可以替代零个或多个单词

此外，当队列绑定关系是下列情况时需要引起注意：

- 当一个队列绑定键是`#`,那么这个队列将接收所有数据，就有点像 **fanout**
- 如果队列绑定键当中没有`#`和`*`出现，那么该队列绑定类型就是 **direct**

![image-20211128131626208](C:\Users\Digital\Desktop\notes\koa\assets\d80ee93f43bb81c1c46ba3375b1903eb.png)

这里我做了两个实验，首先定义了两个 RouterKey,然后在 Producer 发送以下代码集中数据

const TOPIC_ROUTERKEY1 = "#.com";

const TOPIC_ROUTERKEY2 = "www.\*";

```typescript
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
```

Consumer:

然后在 Consumer 对这两个进行消费。效果如下图

```typescript
//消费
channel.consume(
  RabbitConfig.TOPIC_QUEUE_NAME1,
  (msg) => {
    const message = msg?.content.toLocaleString();
    global.logger.info(
      message +
        "-------------" +
        RabbitConfig.TOPIC_ROUTERKEY1 +
        "-------------" +
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
        "-------------" +
        RabbitConfig.TOPIC_ROUTERKEY2 +
        "-------------" +
        RabbitConfig.TOPIC_QUEUE_NAME2
    );
  },
  { noAck: true }
);
```

![image-20240705141135172](C:\Users\Digital\Desktop\notes\koa\assets\image-20240705141135172.png)

我们可以看到中间是他们的 RouterKey 匹配规则，对应匹配上的数据。而 klm 什么都匹配不上就没有打印出来。

##### ⑦：headers 模式

headers 模式不常用，它主要就是在 channel.publish 的时候，待上一个叫 headers 的参数，内部放你自定义的内容，然后在 Consumer 那边也配置同样 headers 的内容，就可以达到用 headers 参数作为映射匹配的过程。

注意，在我的测试中，在 headers 仅需 Key 匹配上即可，Value 不需要匹配上，比如我在 Producer 写 data:"test"，

在 Consumer 写 data:"test1"也可以匹配上

Producer

```typescript
channel.publish(
        RabbitConfig.HEADERS_EXCHANGE_NAME,
        "", //
        Buffer.from("www.abc.com" + "----------------" + i),
        {
          headers: {
            data: "test",
          },
        }
```

Consumer:

```typescript
channel.bindQueue(
  RabbitConfig.HEADERS_QUEUE_NAME2,
  RabbitConfig.HEADERS_EXCHANGE_NAME,
  "",
  {
    data: "test1", // 只要data字段匹配上即可，值不重要
  }
);
```

⑧：Rpc 模式

RabbitMq 的 RPC 模式并不是实现了 RPC 通信，而是将两个服务通信的过程解耦了开来，我们现在明确两个概念，Request 和 Server 端，Request 端和 Server 端均拥有一个队列 Queue 去存储双方的消息，当 Request 端发消息去 Request-Queue 的时候，Server 端会从这个队列里面取消息，完成自己的内部逻辑之后，再发送到 Server-Queue，Request 会去读取这个队列，最终完成一个服务调用的闭环。

![在这里插入图片描述](C:\Users\Digital\Desktop\notes\koa\assets\234b2d7d13894b3da11d2c56b7bda3dd.png)

注意在代码的实现过程中，我们需要在 Request 的 publish 时带上两个参数，一个是 reply_to,一个是 correlation_id。分别用来告诉 Server 端，在完成数据处理时发送到哪个队列和保证消息的唯一 id。

Request：

```typescript
channel.publish(
  RabbitConfig.RPC_EXCHANGE_NAME,
  RabbitConfig.RPC_ROUTER_KEY,
  Buffer.from("发送至Server"),
  {
    correlationId: "RPC" + Math.random(),
    replyTo: RabbitConfig.RPC_REPLY_QUEUE_NAME,
  }
);
```

Consumer:

```typescript
channel.consume(
  RabbitConfig.RPC_MSG_QUEUE_NAME,
  async (msg) => {
    global.logger.info("收到Client数据" + msg?.content.toLocaleString());
    // 模拟业务处理
    await sleep(2000);

    channel.sendToQueue(msg?.properties.replyTo, Buffer.from("发送至Client"), {
      correlationId: msg!.properties.correlationId,
    });
  },
  {
    noAck: true,
  }
);
```

##### ⑧：Dead Letter Queue（死信队列）

死信就是无法被消费的消息。一般来说，producer 将消息投递到 broker 或者直接到 queue 中，consumer 从 queue 取出消息进行消费，但某些时候由于特定的原因导致 queue 中的某些消息无法被消费，这样的消息如果没有后续的处理，就变成了死信，有死信自然就有了死信队列。

接下来模拟一下死信发生的情况，同时如何配置死信队列。

Producer:

首先我定义了死信交换机 DEAD_LETTER_EXCHANGE_NAME 和死信队列 DEAD_LETTER_QUEUE_NAME，再配置了一个普通的队列 NORMAL_QUEUE_NAME，注意这个普通的队列带上了 arguments 参数。

- "x-dead-letter-exchange"：指定死信发生时交换机的名称，这里我们发到了默认交换机
- "x-dead-letter-routing-key"：指定死信发生时 RouterKey 的名称，这里我们由于指定了默认交换机，所以我们这里的 router-key 就会指定了我们发送的队列，具体可以看第三点 Exchange 对默认交换机的介绍。

之后我发送消息到普通队列，这里面是偶数的话，在 Consumer 端报错，并 channel.nack 返回给 Producer 端。

```javascript
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
```

Consumer：

```typescript
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
```

![image-20240705174611419](C:\Users\Digital\Desktop\notes\koa\assets\image-20240705174611419.png)

最后结果如下，我们可以看到 11 条数据里面，有 5 条成功，另外 6 条进入了死信队列。与我们的是一致的
