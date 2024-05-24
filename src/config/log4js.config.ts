// log4js.config.js
export const log4jsConfig = {
  // 定义日志输出目的地（appenders）
  appenders: {
    // 控制台输出
    console: { type: "console" },

    // 文件输出，每天生成一个新文件
    dailyFile: {
      type: "dateFile",
      filename: "logs/app",
      pattern: "-yyyy-MM-dd.log",
      alwaysIncludePattern: true,
    },

    // 错误日志单独记录
    errors: {
      type: "file",
      filename: "logs/errors.log",
      maxLogSize: 10485760, // 10MB
      backups: 3, // 保留最近3个文件
    },
  },

  // 定义日志类别与级别
  categories: {
    default: { appenders: ["console", "dailyFile"], level: "info" }, // 默认日志级别为info，同时输出到控制台和按天分割的日志文件
    errors: { appenders: ["errors"], level: "error" }, // 错误日志仅记录到errors.log
  },

  // 全局日志级别（可选，如果未在categories中指定，则使用此级别）
  pm2: true, // 如果使用PM2，这个配置可以让PM2重载配置更改
  replaceConsole: true, // 替换默认的console.log等方法
};
