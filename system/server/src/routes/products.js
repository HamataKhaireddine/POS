import { Router } from "express";
import multer from "multer";
import { Prisma } from "../lib/prisma-client-bundle.js";
import { prisma } from "../lib/prisma.js";
import { resolveStoredImageUrl } from "../lib/productImageUrl.js";
import { findBranchInOrg } from "../lib/orgScope.js";
import {
  buildProductsExcelBuffer,
  readFirstSheetRows,
  parseYesNo,
  parsePetType,
  parseNumber,
  parseExpiryCell,
} from "../lib/productsExcel.js";
import { DEFAULT_ALERT_DAYS } from "../lib/productExpiry.js";
import {
  allocateUniqueBarcode,
  assertBarcodeAvailable,
} from "../lib/productBarcode.js";
import { scheduleInventoryWebhook } from "../lib/inventoryWebhook.js";
import { authMiddleware, requireRole } from "../middleware/auth.js";

const router = Router();
router.use(authMiddleware);

const uploadExcel = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/\.(xlsx|xls)$/i.test(file.originalname)) cb(null, true);
    else cb(new Error("يُقبل ملف Excel فقط (.xlsx أو .xls)"));
  },
});

function withResolvedImageUrl(product) {
  if (!product) return product;
  return {
    ...product,
    imageUrl: resolveStoredImageUrl(product.imageUrl),
  };
}

const isSqlite = () => {
  const u = process.env.DATABASE_URL || "";
  return u.startsWith("file:") || u.includes("sqlite");
};

router.get("/", async (req, res) => {
  const { search, petType, branchId, page, pageSize, includeInactive } = req.query;
  const where = { organizationId: req.user.organizationId };
  const showInactive = includeInactive === "1" || includeInactive === "true";
  if (!showInactive) where.isActive = true;
  const ins = isSqlite() ? {} : { mode: "insensitive" };
  if (search) {
    const q = String(search);
    where.OR = [
      { name: { contains: q, ...ins } },
      { nameEn: { contains: q, ...ins } },
      { sku: { contains: q, ...ins } },
      { barcode: { contains: q, ...ins } },
    ];
  }
  if (petType && ["CAT", "DOG", "OTHER"].includes(String(petType))) {
    where.petType = String(petType);
  }
  const include = {
    inventories: branchId
      ? { where: { branchId: String(branchId) } }
      : true,
    brand: { select: { id: true, name: true, nameEn: true } },
    productCategory: { select: { id: true, name: true, nameEn: true } },
  };
  const orderBy = { name: "asc" };

  const paginate =
    page !== undefined ||
    pageSize !== undefined ||
    req.query.paginate === "1" ||
    req.query.paginate === "true";
  if (paginate) {
    const p = Math.max(1, parseInt(String(page), 10) || 1);
    const ps = Math.min(100, Math.max(1, parseInt(String(pageSize), 10) || 50));
    const [items, total] = await Promise.all([
      prisma.product.findMany({
        where,
        orderBy,
        skip: (p - 1) * ps,
        take: ps,
        include,
      }),
      prisma.product.count({ where }),
    ]);
    return res.json({
      items: items.map(withResolvedImageUrl),
      total,
      page: p,
      pageSize: ps,
    });
  }

  const products = await prisma.product.findMany({
    where,
    orderBy,
    include,
  });
  res.json(products.map(withResolvedImageUrl));
});

/** توليد باركود رقمي غير مكرر ضمن المؤسسة (للمنتج الجديد أو عند تعبئة باركود لأول مرة) */
router.get("/generate-barcode", requireRole("ADMIN", "MANAGER"), async (req, res, next) => {
  try {
    const exclude =
      req.query.excludeProductId != null && String(req.query.excludeProductId).trim()
        ? String(req.query.excludeProductId).trim()
        : undefined;
    const barcode = await allocateUniqueBarcode(prisma, req.user.organizationId, {
      excludeProductId: exclude,
    });
    res.json({ barcode });
  } catch (e) {
    next(e);
  }
});

router.get("/export/excel", requireRole("ADMIN", "MANAGER"), async (req, res, next) => {
  try {
    const orgId = req.user.organizationId;
    const branchId = req.query.branchId != null && String(req.query.branchId).trim()
      ? String(req.query.branchId).trim()
      : null;
    if (branchId) {
      const br = await findBranchInOrg(prisma, orgId, branchId);
      if (!br) return res.status(400).json({ error: "فرع غير صالح" });
    }

    const products = await prisma.product.findMany({
      where: { organizationId: orgId },
      orderBy: { name: "asc" },
      ...(branchId
        ? { include: { inventories: { where: { branchId } } } }
        : {}),
    });

    const inventoryByProductId = new Map();
    if (branchId) {
      for (const p of products) {
        const inv = p.inventories?.[0];
        if (inv) inventoryByProductId.set(p.id, inv);
      }
    }

    const buffer = buildProductsExcelBuffer(products, inventoryByProductId);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", 'attachment; filename="products-export.xlsx"');
    res.send(buffer);
  } catch (e) {
    next(e);
  }
});

router.post(
  "/import/excel",
  requireRole("ADMIN", "MANAGER"),
  (req, res, next) => {
    uploadExcel.single("file")(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message || "رفع الملف فشل" });
      next();
    });
  },
  async (req, res, next) => {
    try {
      const orgId = req.user.organizationId;
      const branchId =
        req.query.branchId != null && String(req.query.branchId).trim()
          ? String(req.query.branchId).trim()
          : null;
      if (!branchId) {
        return res.status(400).json({ error: "حدّد فرعاً (branchId) لتطبيق المخزون" });
      }
      const br = await findBranchInOrg(prisma, orgId, branchId);
      if (!br) return res.status(400).json({ error: "فرع غير صالح" });
      if (!req.file?.buffer) {
        return res.status(400).json({ error: "لم يُرفع ملف" });
      }

      let rows;
      try {
        rows = readFirstSheetRows(req.file.buffer);
      } catch (e) {
        return res.status(400).json({ error: e?.message || "تعذر قراءة الملف" });
      }

      const errors = [];
      let created = 0;
      let updated = 0;
      const touchedProductIds = new Set();

      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const rowNum = i + 2;
        const name = String(r.name ?? "").trim();
        if (!name) continue;

        const priceNum = parseNumber(r.price);
        if (priceNum === null || priceNum < 0) {
          errors.push({ row: rowNum, message: "سعر غير صالح" });
          continue;
        }

        const costRaw = parseNumber(r.cost);
        const wholesaleRaw = parseNumber(r.wholesalePrice);
        const sku = r.sku != null && String(r.sku).trim() ? String(r.sku).trim() : null;
        const barcode = r.barcode != null && String(r.barcode).trim() ? String(r.barcode).trim() : null;
        const petType = parsePetType(r.petType);
        const isActive = parseYesNo(r.isActive);
        const stockQty = Math.max(0, Math.floor(parseNumber(r.stockQty) ?? 0));
        const minStock = Math.max(0, Math.floor(parseNumber(r.minStock) ?? 5));
        const expDate = parseExpiryCell(r.expiryDate);
        const expAlertRaw = parseNumber(r.expiryAlertDaysBefore);

        const baseData = {
          name,
          nameEn: r.nameEn != null && String(r.nameEn).trim() ? String(r.nameEn).trim() : null,
          description:
            r.description != null && String(r.description).trim()
              ? String(r.description).trim()
              : null,
          sku,
          barcode,
          price: new Prisma.Decimal(priceNum),
          wholesalePrice:
            wholesaleRaw != null && wholesaleRaw >= 0 ? new Prisma.Decimal(wholesaleRaw) : null,
          cost:
            costRaw != null && costRaw >= 0 ? new Prisma.Decimal(costRaw) : null,
          petType,
          category: r.category != null && String(r.category).trim() ? String(r.category).trim() : null,
          imageUrl: r.imageUrl != null && String(r.imageUrl).trim() ? String(r.imageUrl).trim() : null,
          isActive,
          expiryDate: expDate,
          expiryAlertDaysBefore: expDate
            ? expAlertRaw != null && expAlertRaw >= 0
              ? Math.min(Math.floor(expAlertRaw), 3650)
              : DEFAULT_ALERT_DAYS
            : null,
        };

        let existing = null;
        const idStr = r.id != null && String(r.id).trim() ? String(r.id).trim() : null;
        if (idStr) {
          existing = await prisma.product.findFirst({
            where: { id: idStr, organizationId: orgId },
          });
        }
        if (!existing && barcode) {
          existing = await prisma.product.findFirst({
            where: { organizationId: orgId, barcode },
          });
        }
        if (!existing && sku) {
          existing = await prisma.product.findFirst({
            where: { organizationId: orgId, sku },
          });
        }

        try {
          if (baseData.barcode) {
            await assertBarcodeAvailable(prisma, orgId, baseData.barcode, existing?.id ?? null);
          }
        } catch (e) {
          errors.push({
            row: rowNum,
            message: e?.message || "باركود مكرر",
          });
          continue;
        }

        let productId;
        try {
          if (existing) {
            const p = await prisma.product.update({
              where: { id: existing.id },
              data: baseData,
            });
            productId = p.id;
            updated += 1;
          } else {
            const p = await prisma.product.create({
              data: {
                organizationId: orgId,
                ...baseData,
              },
            });
            productId = p.id;
            created += 1;
          }

          await prisma.inventory.upsert({
            where: {
              productId_branchId: { productId, branchId },
            },
            create: {
              productId,
              branchId,
              quantity: stockQty,
              minStockLevel: minStock,
            },
            update: {
              quantity: stockQty,
              minStockLevel: minStock,
            },
          });
          touchedProductIds.add(productId);
        } catch (e) {
          if (e?.code === "P2002") {
            errors.push({ row: rowNum, message: "تعارض SKU أو بيانات فريدة" });
          } else {
            errors.push({ row: rowNum, message: e?.message || "خطأ حفظ" });
          }
        }
      }

      if (touchedProductIds.size > 0) {
        scheduleInventoryWebhook(orgId, {
          event: "products.import",
          meta: { branchId, created, updated },
          lines: [...touchedProductIds].map((productId) => ({
            branchId,
            productId,
            quantityDelta: 0,
          })),
        });
      }

      res.json({ ok: true, created, updated, errors, errorCount: errors.length });
    } catch (e) {
      next(e);
    }
  }
);

router.get("/:id", async (req, res) => {
  const p = await prisma.product.findFirst({
    where: { id: req.params.id, organizationId: req.user.organizationId },
    include: {
      inventories: true,
      brand: { select: { id: true, name: true, nameEn: true } },
      productCategory: { select: { id: true, name: true, nameEn: true } },
    },
  });
  if (!p) return res.status(404).json({ error: "المنتج غير موجود" });
  res.json(withResolvedImageUrl(p));
});

router.get("/:id/lots", async (req, res) => {
  const branchId =
    req.query.branchId != null && String(req.query.branchId).trim()
      ? String(req.query.branchId).trim()
      : req.user.branchId;
  if (!branchId) return res.status(400).json({ error: "يجب تحديد الفرع" });
  if (req.user.role !== "ADMIN" && req.user.branchId && req.user.branchId !== branchId) {
    return res.status(403).json({ error: "لا يمكن الوصول لفرع آخر" });
  }
  const orgId = req.user.organizationId;
  const product = await prisma.product.findFirst({
    where: { id: req.params.id, organizationId: orgId },
    select: { id: true, name: true },
  });
  if (!product) return res.status(404).json({ error: "المنتج غير موجود" });
  const branchOk = await findBranchInOrg(prisma, orgId, branchId);
  if (!branchOk) return res.status(400).json({ error: "فرع غير صالح" });

  const lots = await prisma.inventoryLot.findMany({
    where: {
      organizationId: orgId,
      productId: product.id,
      branchId,
    },
    orderBy: [{ expiryDate: "asc" }, { receivedAt: "asc" }],
    select: {
      id: true,
      receivedAt: true,
      expiryDate: true,
      quantityReceived: true,
      quantityOnHand: true,
      unitCost: true,
      note: true,
    },
  });
  res.json({ product, branchId, lots });
});

router.post("/", requireRole("ADMIN", "MANAGER"), async (req, res) => {
  const {
    name,
    nameEn,
    description,
    sku,
    barcode,
    price,
    wholesalePrice,
    cost,
    petType,
    category,
    imageUrl,
    branchId,
    initialStock,
    minStockLevel,
    expiryDate: expiryDateRaw,
    expiryAlertDaysBefore: expiryAlertRaw,
  } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: "اسم المنتج مطلوب" });
  const priceNum = Number(price);
  if (Number.isNaN(priceNum) || priceNum < 0) {
    return res.status(400).json({ error: "سعر غير صالح" });
  }
  const bid = branchId || req.user.branchId;
  if (!bid) return res.status(400).json({ error: "يجب تحديد الفرع للمخزون الأولي" });
  const br = await findBranchInOrg(prisma, req.user.organizationId, bid);
  if (!br) return res.status(400).json({ error: "فرع غير صالح" });

  let expiryDate = null;
  if (expiryDateRaw != null && String(expiryDateRaw).trim()) {
    const d = new Date(String(expiryDateRaw));
    if (Number.isNaN(d.getTime())) {
      return res.status(400).json({ error: "تاريخ انتهاء الصلاحية غير صالح" });
    }
    expiryDate = d;
  }
  let expiryAlertDaysBefore = null;
  if (expiryDate) {
    if (expiryAlertRaw != null && String(expiryAlertRaw).trim() !== "") {
      const n = Math.floor(Number(expiryAlertRaw));
      if (!Number.isFinite(n) || n < 0) {
        return res.status(400).json({ error: "فترة التنبيه قبل الانتهاء غير صالحة" });
      }
      expiryAlertDaysBefore = Math.min(n, 3650);
    } else {
      expiryAlertDaysBefore = DEFAULT_ALERT_DAYS;
    }
  }

  const barcodeTrim = barcode?.trim() || null;
  try {
    await assertBarcodeAvailable(prisma, req.user.organizationId, barcodeTrim, null);
  } catch (e) {
    if (e?.status === 400) return res.status(400).json({ error: e.message });
    throw e;
  }

  let product;
  try {
    product = await prisma.product.create({
    data: {
      organizationId: req.user.organizationId,
      name: name.trim(),
      nameEn: nameEn?.trim() || null,
      description: description?.trim() || null,
      sku: sku?.trim() || null,
      barcode: barcodeTrim,
      price: new Prisma.Decimal(priceNum),
      wholesalePrice:
        wholesalePrice != null && wholesalePrice !== ""
          ? new Prisma.Decimal(Number(wholesalePrice))
          : null,
      cost:
        cost != null && cost !== ""
          ? new Prisma.Decimal(Number(cost))
          : null,
      petType: ["CAT", "DOG", "OTHER"].includes(String(petType))
        ? String(petType)
        : "OTHER",
      category: category != null && String(category).trim() ? String(category).trim() : null,
      imageUrl: imageUrl?.trim() || null,
      expiryDate,
      expiryAlertDaysBefore,
      inventories: {
        create: {
          branchId: bid,
          quantity: Math.max(0, Number(initialStock) || 0),
          minStockLevel: Math.max(0, Number(minStockLevel) || 5),
        },
      },
    },
    include: { inventories: true },
  });
  } catch (e) {
    if (e?.code === "P2002") {
      return res.status(400).json({
        error: "تعارض بيانات فريدة (SKU أو باركود أو معرّف خارجي)",
      });
    }
    throw e;
  }
  scheduleInventoryWebhook(req.user.organizationId, {
    event: "product.created",
    meta: { productId: product.id, branchId: bid },
    lines: [
      {
        branchId: bid,
        productId: product.id,
        quantityDelta: Math.max(0, Number(initialStock) || 0),
      },
    ],
  });
  res.status(201).json(withResolvedImageUrl(product));
});

router.patch("/:id", requireRole("ADMIN", "MANAGER"), async (req, res) => {
  const data = req.body || {};
  const update = {};
  if (data.name != null) update.name = String(data.name).trim();
  if (data.nameEn !== undefined) update.nameEn = data.nameEn?.trim() || null;
  if (data.description !== undefined) update.description = data.description?.trim() || null;
  if (data.sku !== undefined) update.sku = data.sku?.trim() || null;
  if (data.barcode !== undefined) update.barcode = data.barcode?.trim() || null;
  if (data.price != null) update.price = new Prisma.Decimal(Number(data.price));
  if (data.cost !== undefined) {
    update.cost =
      data.cost != null && data.cost !== ""
        ? new Prisma.Decimal(Number(data.cost))
        : null;
  }
  if (data.wholesalePrice !== undefined) {
    update.wholesalePrice =
      data.wholesalePrice != null && data.wholesalePrice !== ""
        ? new Prisma.Decimal(Number(data.wholesalePrice))
        : null;
  }
  if (data.petType && ["CAT", "DOG", "OTHER"].includes(String(data.petType))) {
    update.petType = String(data.petType);
  }
  if (data.imageUrl !== undefined) update.imageUrl = data.imageUrl?.trim() || null;
  if (data.externalId !== undefined) update.externalId = data.externalId?.trim() || null;
  if (data.category !== undefined) update.category = data.category?.trim() || null;
  if (data.brandId !== undefined) update.brandId = data.brandId || null;
  if (data.categoryId !== undefined) update.categoryId = data.categoryId || null;
  if (data.isActive !== undefined) update.isActive = Boolean(data.isActive);

  const existing = await prisma.product.findFirst({
    where: { id: req.params.id, organizationId: req.user.organizationId },
  });
  if (!existing) return res.status(404).json({ error: "المنتج غير موجود" });

  if (data.barcode !== undefined) {
    try {
      await assertBarcodeAvailable(
        prisma,
        req.user.organizationId,
        update.barcode ?? null,
        existing.id
      );
    } catch (e) {
      if (e?.status === 400) return res.status(400).json({ error: e.message });
      throw e;
    }
  }

  if (data.expiryDate !== undefined) {
    if (data.expiryDate === null || data.expiryDate === "") {
      update.expiryDate = null;
      update.expiryAlertDaysBefore = null;
    } else {
      const d = new Date(String(data.expiryDate));
      if (Number.isNaN(d.getTime())) {
        return res.status(400).json({ error: "تاريخ انتهاء الصلاحية غير صالح" });
      }
      update.expiryDate = d;
      if (data.expiryAlertDaysBefore !== undefined) {
        if (data.expiryAlertDaysBefore === null || data.expiryAlertDaysBefore === "") {
          update.expiryAlertDaysBefore = DEFAULT_ALERT_DAYS;
        } else {
          const n = Math.floor(Number(data.expiryAlertDaysBefore));
          if (!Number.isFinite(n) || n < 0) {
            return res.status(400).json({ error: "فترة التنبيه قبل الانتهاء غير صالحة" });
          }
          update.expiryAlertDaysBefore = Math.min(n, 3650);
        }
      } else {
        update.expiryAlertDaysBefore = existing.expiryAlertDaysBefore ?? DEFAULT_ALERT_DAYS;
      }
    }
  } else if (data.expiryAlertDaysBefore !== undefined) {
    if (!existing.expiryDate) {
      return res.status(400).json({ error: "حدّد تاريخ انتهاء الصلاحية أولاً أو امسح التنبيه" });
    }
    if (data.expiryAlertDaysBefore === null || data.expiryAlertDaysBefore === "") {
      update.expiryAlertDaysBefore = DEFAULT_ALERT_DAYS;
    } else {
      const n = Math.floor(Number(data.expiryAlertDaysBefore));
      if (!Number.isFinite(n) || n < 0) {
        return res.status(400).json({ error: "فترة التنبيه قبل الانتهاء غير صالحة" });
      }
      update.expiryAlertDaysBefore = Math.min(n, 3650);
    }
  }

  try {
    const p = await prisma.product.update({
      where: { id: existing.id },
      data: update,
      include: { inventories: true },
    });
    res.json(withResolvedImageUrl(p));
  } catch (e) {
    if (e?.code === "P2002") {
      return res.status(400).json({
        error: "تعارض بيانات فريدة (SKU أو باركود أو معرّف خارجي)",
      });
    }
    throw e;
  }
});

router.delete("/:id", requireRole("ADMIN"), async (req, res) => {
  try {
    const existing = await prisma.product.findFirst({
      where: { id: req.params.id, organizationId: req.user.organizationId },
    });
    if (!existing) return res.status(404).json({ error: "المنتج غير موجود" });
    await prisma.product.delete({ where: { id: existing.id } });
    res.status(204).send();
  } catch (e) {
    if (e?.code === "P2003") {
      return res.status(400).json({
        error: "لا يمكن حذف المنتج لأنه مرتبط بمبيعات/مرتجعات/مشتريات",
      });
    }
    throw e;
  }
});

export default router;
