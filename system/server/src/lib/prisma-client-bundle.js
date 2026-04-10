import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const mod = require("../generated/prisma/index.js");

export const PrismaClient = mod.PrismaClient;
export const Prisma = mod.Prisma;
