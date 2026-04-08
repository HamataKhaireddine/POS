import "./loadEnv.js";
import app from "./app.js";
import { hasPublicImageBaseConfigured } from "./lib/productImageUrl.js";

const port = Number(process.env.PORT) || 4000;
const isVercel = Boolean(process.env.VERCEL);

if (!isVercel) {
  app.listen(port, () => {
    console.log(`API يعمل على http://localhost:${port}`);
    if (hasPublicImageBaseConfigured()) {
      console.log(
        "[صور] PUBLIC_IMAGE_BASE_URL / SUPABASE_PUBLIC_IMAGE_PREFIX: مضبوط (مسارات نسبية تُكمَّل)"
      );
    } else {
      console.log(
        "[صور] لا توجد بادئة صور في .env — ضع PUBLIC_IMAGE_BASE_URL إن كانت الصور مسارات نسبية فقط"
      );
    }
  });
}
