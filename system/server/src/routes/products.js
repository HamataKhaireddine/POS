import { Router } from "express";
import { Prisma } from "../lib/prisma-client-bundle.js";
import { prisma } from "../lib/prisma.js";
import { resolveStoredImageUrl } from "../lib/productImageUrl.js";
import { authMiddleware, requireRole } from "../middleware/auth.js";

const router = Router();
router.use(authMiddleware);

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
  const where = {};
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

router.get("/:id", async (req, res) => {
  const p = await prisma.product.findUnique({
    where: { id: req.params.id },
    include: {
      inventories: true,
      brand: { select: { id: true, name: true, nameEn: true } },
      productCategory: { select: { id: true, name: true, nameEn: true } },
    },
  });
  if (!p) return res.status(404).json({ error: "المنتج غير موجود" });
  res.json(withResolvedImageUrl(p));
});

router.post("/", requireRole("ADMIN", "MANAGER"), async (req, res) => {
  const {
    name,
    nameEn,
    description,
    sku,
    barcode,
    price,
    cost,
    petType,
    category,
    imageUrl,
    branchId,
    initialStock,
    minStockLevel,
  } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: "اسم المنتج مطلوب" });
  const priceNum = Number(price);
  if (Number.isNaN(priceNum) || priceNum < 0) {
    return res.status(400).json({ error: "سعر غير صالح" });
  }
  const bid = branchId || req.user.branchId;
  if (!bid) return res.status(400).json({ error: "يجب تحديد الفرع للمخزون الأولي" });

  const product = await prisma.$transaction(async (tx) => {
    const p = await tx.product.create({
      data: {
        name: name.trim(),
        nameEn: nameEn?.trim() || null,
        description: description?.trim() || null,
        sku: sku?.trim() || null,
        barcode: barcode?.trim() || null,
        price: new Prisma.Decimal(priceNum),
        cost:
          cost != null && cost !== ""
            ? new Prisma.Decimal(Number(cost))
            : null,
        petType: ["CAT", "DOG", "OTHER"].includes(String(petType))
          ? String(petType)
          : "OTHER",
        category: category != null && String(category).trim() ? String(category).trim() : null,
        imageUrl: imageUrl?.trim() || null,
      },
    });
    await tx.inventory.upsert({
      where: {
        productId_branchId: { productId: p.id, branchId: bid },
      },
      create: {
        productId: p.id,
        branchId: bid,
        quantity: Math.max(0, Number(initialStock) || 0),
        minStockLevel: Math.max(0, Number(minStockLevel) || 5),
      },
      update: {
        quantity: { increment: Math.max(0, Number(initialStock) || 0) },
      },
    });
    return tx.product.findUnique({
      where: { id: p.id },
      include: { inventories: true },
    });
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
  if (data.petType && ["CAT", "DOG", "OTHER"].includes(String(data.petType))) {
    update.petType = String(data.petType);
  }
  if (data.imageUrl !== undefined) update.imageUrl = data.imageUrl?.trim() || null;
  if (data.externalId !== undefined) update.externalId = data.externalId?.trim() || null;
  if (data.category !== undefined) update.category = data.category?.trim() || null;
  if (data.brandId !== undefined) update.brandId = data.brandId || null;
  if (data.categoryId !== undefined) update.categoryId = data.categoryId || null;
  if (data.isActive !== undefined) update.isActive = Boolean(data.isActive);

  const p = await prisma.product.update({
    where: { id: req.params.id },
    data: update,
    include: { inventories: true },
  });
  res.json(withResolvedImageUrl(p));
});

router.delete("/:id", requireRole("ADMIN"), async (req, res) => {
  try {
    await prisma.product.delete({ where: { id: req.params.id } });
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
