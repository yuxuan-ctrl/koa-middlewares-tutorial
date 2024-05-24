import Router from "@koa/router"; // 引入路由函数，注意ESM中使用import
import swaggerJSDoc from "swagger-jsdoc"; // ESM中使用import代替require
import path from "path"; // 导入path模块保持不变

const swaggerDefinition = {
  info: {
    title: "blog项目访问地址",
    version: "1.0.0",
    description: "API",
  },
  host: "localhost:8888", // 可按需调整
  basePath: "/", // Base path (optional)
};

const options = {
  swaggerDefinition,
  apis: [path.join(__dirname, "../controllers/**/*.ts")], // 通过path.join指定注解文件路径
};

const swaggerSpec = swaggerJSDoc(options);

// 创建路由实例
const router = new Router();

// 通过路由获取生成的Swagger JSON定义
router.get(
  "/swagger.json",
  async (ctx: { set: (arg0: string, arg1: string) => void; body: object }) => {
    ctx.set("Content-Type", "application/json");
    ctx.body = swaggerSpec;
  }
);

export default router; // 使用export default导出
