import { Prisma } from "../lib/prisma-client-bundle.js";
import { prisma } from "../lib/prisma.js";
import { resolveStoredImageUrl } from "../lib/productImageUrl.js";
import { getSyncConfig } from "./syncService.js";

const DEFAULT_EZOO_URL = "https://api.ezoo-app.com/api/get-products";

function ezooImageUrl(item) {
  const first = Array.isArray(item.images) ? item.images[0] : null;
  if (first && typeof first === "object" && first.image != null) {
    const u = String(first.image).trim();
    if (u) return resolveStoredImageUrl(u);
  }
  return null;
}

/**
 * جلب المنتجات من API تطبيق ezoo (ميني زو).
 * يتطلب nationality_id — الافتراضي 1 (قطر). اضبط EZOO_NATIONALITY_ID في server/.env إن لزم.
 */
export async function syncProductsFromEzoo(organizationId) {
  const nationalityId = String(process.env.EZOO_NATIONALITY_ID ?? "1").trim() || "1";
  const endpoint = (process.env.EZOO_GET_PRODUCTS_URL || DEFAULT_EZOO_URL).trim();
  const u = new URL(endpoint);
  if (!u.searchParams.has("nationality_id")) {
    u.searchParams.set("nationality_id", nationalityId);
  }

  const res = await fetch(u.toString(), {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Ezoo get-products: HTTP ${res.status} — ${t.slice(0, 280)}`);
  }

  const data = await res.json();
  const err = data?.Error;
  if (err && err.code && Number(err.code) >= 400) {
    throw new Error(
      `Ezoo API: ${err.validation || err.desc || "خطأ"} (code ${err.code})`
    );
  }

  const list = data?.Response;
  if (!Array.isArray(list)) {
    throw new Error("Ezoo API: الحقل Response ليس مصفوفة منتجات");
  }

  let upserted = 0;
  for (const item of list) {
    const extId = item.id != null ? String(item.id) : "";
    if (!extId) continue;

    const priceNum = Number(item.priceAfterDiscount ?? item.price ?? 0);
    const priceDec = new Prisma.Decimal(
      Number.isFinite(priceNum) ? String(priceNum) : "0"
    );
    const imageUrl = ezooImageUrl(item);
    const desc =
      item.description != null ? String(item.description) : null;
    const barcode =
      item.barcode != null && String(item.barcode).trim()
        ? String(item.barcode).trim().slice(0, 200)
        : null;

    const base = {
      name: String(item.name || "منتج").slice(0, 500),
      nameEn: null,
      description: desc,
      sku: null,
      barcode,
      price: priceDec,
      cost: null,
      petType: "OTHER",
      imageUrl,
      externalId: extId,
    };

    const existing = await prisma.product.findFirst({
      where: { organizationId, externalId: extId },
    });

    try {
      if (existing) {
        await prisma.product.update({
          where: { id: existing.id },
          data: {
            name: base.name,
            description: base.description,
            barcode: base.barcode,
            price: base.price,
            imageUrl: base.imageUrl,
          },
        });
      } else {
        await prisma.product.create({
          data: { ...base, organizationId },
        });
      }
      upserted++;
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      ) {
        continue;
      }
      throw e;
    }
  }

  await getSyncConfig(organizationId);
  await prisma.syncSettings.update({
    where: { organizationId },
    data: { lastProductSyncAt: new Date() },
  });

  return {
    source: "ezoo-app.com",
    upserted,
    totalRemote: list.length,
    at: new Date().toISOString(),
  };
}
