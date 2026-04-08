import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis;

/** عميل واحد لكل عملية (مفيد على Vercel عند إعادة استخدام الدالة الدافئة) */
if (!globalForPrisma.prisma) {
  globalForPrisma.prisma = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma;
