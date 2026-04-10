/**
 * يولّد pwa-192.png و pwa-512.png من public/pwa-icon-source.svg
 * تشغيل: npm run icons
 */
import { readFileSync, copyFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const svgPath = join(root, "public", "pwa-icon-source.svg");

if (!existsSync(svgPath)) {
  console.error("Missing", svgPath);
  process.exit(1);
}

const svg = readFileSync(svgPath);

for (const size of [192, 512]) {
  const out = join(root, "public", `pwa-${size}.png`);
  await sharp(svg).resize(size, size).png({ compressionLevel: 9 }).toFile(out);
  console.log("Wrote", out);
}

try {
  copyFileSync(join(root, "public", "pwa-192.png"), join(root, "public", "favicon.png"));
  console.log("Wrote public/favicon.png (copy of 192px)");
} catch (e) {
  console.warn(e.message);
}
