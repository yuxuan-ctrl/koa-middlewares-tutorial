import { PrismaClient } from "@prisma/client";
import prisma from "../config/prisma.config";

export interface Context {
  prisma: PrismaClient;
}

export const createContext = async () => ({
  prisma: prisma,
});
