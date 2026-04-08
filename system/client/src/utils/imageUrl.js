function cleanViteBase(v) {
  if (v == null || v === "") return "";
  let s = String(v).trim();
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1).trim();
  }
  return s.replace(/\/$/, "");
}

/**
 * يطابق منطق الخادم: إكمال المسارات النسبية.
 * استخدم VITE_IMAGE_URL_PREFIX أو VITE_PUBLIC_IMAGE_BASE_URL (نفس قيمة PUBLIC_IMAGE_BASE_URL على السيرفر إن لزم).
 */
export function resolveImageUrlForDisplay(raw) {
  if (raw == null) return "";
  let s = String(raw).trim().replace(/\\/g, "/");
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith("//")) return `https:${s}`;
  if (s.startsWith("data:") || s.startsWith("blob:")) return s;
  const prefix =
    cleanViteBase(import.meta.env.VITE_IMAGE_URL_PREFIX) ||
    cleanViteBase(import.meta.env.VITE_PUBLIC_IMAGE_BASE_URL);
  if (prefix) return `${prefix}/${s.replace(/^\/+/, "")}`;
  return s;
}
