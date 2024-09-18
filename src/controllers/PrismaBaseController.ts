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
import prisma from "../config/prisma.config";
import { randomUUID } from "crypto";
import UserDto from "../dto/userDto";

@Controller("/prismabase")
export default class PrismaBaseController {
  @Post("/createUser")
  public async createUser(@Body() user: UserDto) {
    try {
      const res = await prisma.$transaction([
        prisma.user.create({
          data: user,
        }),
      ]);
      const newUser = res[0];
      return newUser;
    } catch (err) {
      global.logger.error(err);
      return err;
    }
  }

  @Get("/getUsers")
  public async getUsers() {
    try {
      const users = await prisma.user.findMany({
        select: {
          name: true,
          email: true,
          id: true,
        },
        where: {
          name: {
            // equals: "lyx",
          },
        },
        orderBy: {
          id: "asc",
        },
      });
      return users;
    } catch (error) {
      global.logger.error(error);
      return error;
    }
  }

  @Get("/getUserPageList")
  public async getUserPageList() {
    try {
      const users = await prisma.user.findMany({
        select: {
          name: true,
          email: true,
          id: true,
        },
        where: {
          name: {
            // equals: "lyx",
          },
        },
        skip: 1,
        take: 10,
        orderBy: {
          id: "asc",
        },
      });
      return users;
    } catch (error) {
      global.logger.error(error);
      return error;
    }
  }
}
