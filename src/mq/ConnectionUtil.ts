import amqp from "amqplib";
import RabbitConfig from "../config/RabbitConfig";

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

export { getConnection };
