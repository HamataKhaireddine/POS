import { Prisma } from "./prisma-client-bundle.js";

const KNOWN_DB_CODES = [
  "P1000",
  "P1001",
  "P1002",
  "P1003",
  "P1010",
  "P1017",
];

/** أخطاء اتصال/تهيئة شائعة على Vercel عند غياب أو خطأ DATABASE_URL */
export function isDbUnavailableError(e) {
  if (!e || typeof e !== "object") return false;
  if (e instanceof Prisma.PrismaClientInitializationError) return true;
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    return KNOWN_DB_CODES.includes(e.code);
  }
  const msg = String(e.message || "");
  if (
    /P1001|P1000|P1017|Can't reach database server|connection (refused|timed out|closed)|Server has closed the connection|database server is running/i.test(
      msg
    )
  ) {
    return true;
  }
  return false;
}

export const dbUnavailableMessage =
  "قاعدة البيانات غير متاحة. تحقق من DATABASE_URL في إعدادات Vercel (Production).";
