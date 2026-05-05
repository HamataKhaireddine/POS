/**
 * خدمة مزامنة الموقع الخارجي
 * — تستبدل طلبات fetch الفعلية بعنوان الموقع + API Key من SyncSettings
 * — جاهزة لتوسيعها لتطابق مسارات API لموقعك الحالي
 */

import { Prisma } from "../lib/prisma-client-bundle.js";
import { prisma } from "../lib/prisma.js";
import { decryptSecret, encryptSecret } from "../lib/secretCrypto.js";

export async function getSyncConfig(organizationId) {
  let row = await prisma.syncSettings.findUnique({
    where: { organizationId },
  });
  if (!row) {
    row = await prisma.syncSettings.create({ data: { organizationId } });
  }
  return row;
}

/** مفتاح API نصي للاستخدام في fetch فقط — لا يُرسل للعميل */
export function getPlainSyncApiKey(row) {
  if (!row?.apiKey) return null;
  try {
    return decryptSecret(row.apiKey);
  } catch {
    return null;
  }
}

export async function saveSyncConfig(organizationId, {
  websiteBaseUrl,
  apiKey,
  inventoryWebhookUrl,
}) {
  const existing = await prisma.syncSettings.findUnique({
    where: { organizationId },
  });
  let storedKey;
  if (apiKey !== undefined) {
    const t = apiKey?.trim();
    storedKey = t ? encryptSecret(t) : null;
  }
  if (existing) {
    return prisma.syncSettings.update({
      where: { organizationId },
      data: {
        ...(websiteBaseUrl !== undefined && {
          websiteBaseUrl: websiteBaseUrl?.trim() || null,
        }),
        ...(apiKey !== undefined && { apiKey: storedKey }),
        ...(inventoryWebhookUrl !== undefined && {
          inventoryWebhookUrl: inventoryWebhookUrl?.trim() || null,
        }),
      },
    });
  }
  return prisma.syncSettings.create({
    data: {
      organizationId,
      websiteBaseUrl: websiteBaseUrl?.trim() || null,
      apiKey: storedKey ?? null,
      inventoryWebhookUrl: inventoryWebhookUrl?.trim() || null,
    },
  });
}

/**
 * سحب المنتجات من الموقع (مثال: GET /api/products)
 * عدّل المسار والتنسيق حسب API الموقع الفعلي
 */
export async function syncProductsFromWebsite(organizationId) {
  const cfg = await getSyncConfig(organizationId);
  const key = getPlainSyncApiKey(cfg);
  if (!cfg.websiteBaseUrl || !key) {
    throw new Error("يجب حفظ عنوان الموقع و API Key أولاً");
  }
  const url = `${cfg.websiteBaseUrl.replace(/\/$/, "")}/api/products`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    let detail = "";
    try {
      detail = (await res.text()).trim().slice(0, 400);
    } catch {
      /* ignore */
    }
    const err = new Error(
      res.status === 401
        ? "الموقع رفض المفتاح (401). انسخ مفتاح API من زر «توليد» أو احفظ المفتاح يدوياً ثم ضع نفس القيمة بالضبط في متغير البيئة بالمتجر (مثل POS_SYNC_API_KEY) بدون مسافات إضافية، وأعد تشغيل خادم المتجر."
        : res.status === 404
          ? `المسار غير موجود (404): ${url} — تأكد أن خادم المتجر يعرض GET /api/products على هذا العنوان.`
          : `فشل جلب المنتجات: HTTP ${res.status}${detail ? ` — ${detail}` : ""}`
    );
    err.statusCode = res.status;
    throw err;
  }
  const data = await res.json();
  const list = Array.isArray(data) ? data : data.products || data.data || [];
  let upserted = 0;
  for (const item of list) {
    const extId = String(item.id ?? item.externalId ?? "");
    if (!extId) continue;
    const existing = await prisma.product.findFirst({
      where: { organizationId, externalId: extId },
    });
    const priceDec = new Prisma.Decimal(String(item.price ?? "0"));
    const costDec =
      item.cost != null && item.cost !== ""
        ? new Prisma.Decimal(String(item.cost))
        : null;
    const nameEnRaw =
      item.nameEn != null && item.nameEn !== ""
        ? String(item.nameEn)
        : item.name_en != null && item.name_en !== ""
          ? String(item.name_en)
          : null;
    const base = {
      name: String(item.name || "منتج"),
      nameEn: nameEnRaw?.trim() || null,
      description: item.description ? String(item.description) : null,
      sku: item.sku ? String(item.sku) : null,
      barcode: item.barcode ? String(item.barcode) : null,
      price: priceDec,
      cost: costDec,
      petType: mapPetType(item.category || item.petType),
      imageUrl: extractProductImageUrl(item),
      externalId: extId,
    };
    if (existing) {
      await prisma.product.update({
        where: { id: existing.id },
        data: {
          name: base.name,
          nameEn: base.nameEn,
          description: base.description,
          sku: base.sku,
          barcode: base.barcode,
          price: base.price,
          cost: base.cost,
          petType: base.petType,
          imageUrl: base.imageUrl,
        },
      });
    } else {
      await prisma.product.create({
        data: { ...base, organizationId },
      });
    }
    upserted++;
  }
  await prisma.syncSettings.update({
    where: { organizationId },
    data: { lastProductSyncAt: new Date() },
  });
  return { upserted, at: new Date().toISOString() };
}

/** رابط صورة من JSON الموقع — ليس رفع ملفات، فقط نسخ URL */
function extractProductImageUrl(item) {
  if (!item || typeof item !== "object") return null;
  const direct =
    item.imageUrl ??
    item.image_url ??
    item.image ??
    item.featured_image ??
    item.featuredImage ??
    item.thumbnail ??
    item.thumbnail_url ??
    item.coverImage ??
    item.coverImageUrl ??
    item.primaryImageUrl ??
    item.heroImage ??
    item.photo;
  if (direct != null && String(direct).trim() !== "") {
    return String(direct).trim().slice(0, 2000);
  }
  const fromArray = Array.isArray(item.images) ? item.images[0] : null;
  const fromNested =
    fromArray && typeof fromArray === "object"
      ? fromArray.src ??
        fromArray.url ??
        fromArray.source_url ??
        fromArray.image
      : null;
  if (fromNested != null && String(fromNested).trim() !== "") {
    return String(fromNested).trim().slice(0, 2000);
  }
  if (typeof item.images === "string" && item.images.trim()) {
    return String(item.images).trim().slice(0, 2000);
  }
  const media0 = Array.isArray(item.media) ? item.media[0] : null;
  if (media0 && typeof media0 === "object") {
    const u = media0.url ?? media0.src ?? media0.path;
    if (u != null && String(u).trim() !== "") return String(u).trim().slice(0, 2000);
  }
  return null;
}

function mapPetType(raw) {
  const s = String(raw || "").toLowerCase();
  if (s.includes("cat") || s.includes("قط")) return "CAT";
  if (s.includes("dog") || s.includes("كلب")) return "DOG";
  return "OTHER";
}

/**
 * دفع الطلبات المحلية للموقع أو سحب طلبات جديدة — حسب تصميم API لديك
 */
export async function syncOrdersWithWebsite(organizationId) {
  const cfg = await getSyncConfig(organizationId);
  const key = getPlainSyncApiKey(cfg);
  if (!cfg.websiteBaseUrl || !key) {
    throw new Error("يجب حفظ عنوان الموقع و API Key أولاً");
  }
  const url = `${cfg.websiteBaseUrl.replace(/\/$/, "")}/api/orders/pending`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(`فشل مزامنة الطلبات: HTTP ${res.status}`);
  }
  await prisma.syncSettings.update({
    where: { organizationId },
    data: { lastOrderSyncAt: new Date() },
  });
  return { message: "تم تسجيل وقت المزامنة (عدّل المنطق حسب API الموقع)", at: new Date().toISOString() };
}
