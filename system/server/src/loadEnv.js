import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

/** يحمّل دائماً `server/.env` بغض النظر عن مجلد التشغيل (حل مشاكل PUBLIC_* على ويندوز) */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "..", ".env");
const result = dotenv.config({ path: envPath });
if (
  result.error &&
  process.env.NODE_ENV !== "test" &&
  !process.env.DATABASE_URL
) {
  console.warn(
    "[loadEnv] لم يُعثر على .env في",
    envPath,
    "— المتغيرات الافتراضية من النظام فقط"
  );
}
