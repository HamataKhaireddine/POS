import { BusinessVertical } from "../generated/prisma/index.js";

const ALLOWED = new Set(Object.values(BusinessVertical));

/**
 * @returns {string | null | undefined} قيمة صالحة، أو null إذا فارغ، أو undefined إذا غير مقبولة
 */
export function normalizeBusinessVertical(raw, { required = false } = {}) {
  if (raw == null || String(raw).trim() === "") {
    return required ? undefined : null;
  }
  const v = String(raw).trim();
  if (!ALLOWED.has(v)) return undefined;
  return v;
}
