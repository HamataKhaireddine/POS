import { Router } from "express";
import { Prisma } from "../lib/prisma-client-bundle.js";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, requireRole } from "../middleware/auth.js";
import { writeAudit } from "../lib/auditLog.js";

const router = Router();
router.use(authMiddleware);

router.get("/", async (req, res) => {
  const { branchId, limit = "50" } = req.query;
  const where = {};
  const bid = branchId || (req.user.role === "ADMIN" ? undefined : req.user.branchId);
  if (bid) where.branchId = String(bid);
  const rows = await prisma.purchase.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: Math.min(200, Math.max(1, parseInt(String(limit), 10) || 50)),
    include: {
      items: { include: { product: { select: { id: true, name: true, sku: true } } } },
      branch: { select: { name: true } },
      supplier: { select: { id: true, name: true } },
      user: { select: { name: true } },
    },
  });
  res.json(rows);
});

router.post("/receive", requireRole("ADMIN", "MANAGER"), async (req, res) => {
  const { branchId, supplierId, note, items, updateProductCost } = req.body || {};
  const bid = branchId || req.user.branchId;
  if (!bid) return res.status(400).json({ error: "يجب اختيار الفرع" });
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "لا توجد بنود" });
  }
  if (req.user.role !== "ADMIN" && req.user.branchId && req.user.branchId !== bid) {
    return res.status(403).json({ error: "لا يمكن الاستلام لفرع آخر" });
  }

  let supId = null;
  if (supplierId != null && String(supplierId).trim()) {
    const s = await prisma.supplier.findUnique({ where: { id: String(supplierId) } });
    if (!s) return res.status(400).json({ error: "مورد غير موجود" });
    supId = s.id;
  }

  const applyCost = Boolean(updateProductCost);

  try {
    let total = new Prisma.Decimal(0);
    const lineData = [];

    for (const line of items) {
      const productId = line.productId;
      const qty = Math.max(1, Math.floor(Number(line.quantity) || 1));
      const uc = Number(line.unitCost);
      if (Number.isNaN(uc) || uc < 0) throw new Error("تكلفة الوحدة غير صالحة");
      const product = await prisma.product.findUnique({ where: { id: productId } });
      if (!product) throw new Error(`منتج غير موجود: ${productId}`);
      const unitCost = new Prisma.Decimal(uc.toFixed(2));
      const subtotal = unitCost.mul(qty);
      total = total.add(subtotal);
      lineData.push({ productId, quantity: qty, unitCost, subtotal });
    }

    const afterPurchase = [];
    for (const l of lineData) {
      afterPurchase.push(
        prisma.inventory.upsert({
          where: {
            productId_branchId: { productId: l.productId, branchId: bid },
          },
          create: {
            productId: l.productId,
            branchId: bid,
            quantity: l.quantity,
            minStockLevel: 5,
          },
          update: {
            quantity: { increment: l.quantity },
          },
        }),
      );
      if (applyCost) {
        afterPurchase.push(
          prisma.product.update({
            where: { id: l.productId },
            data: { cost: l.unitCost },
          }),
        );
      }
    }

    const purchaseResults = await prisma.$transaction([
      prisma.purchase.create({
        data: {
          supplierId: supId,
          branchId: bid,
          userId: req.user.sub,
          note: note != null && String(note).trim() ? String(note).trim() : null,
          items: {
            create: lineData.map((l) => ({
              productId: l.productId,
              quantity: l.quantity,
              unitCost: l.unitCost,
              subtotal: l.subtotal,
            })),
          },
        },
        include: {
          items: { include: { product: true } },
          branch: true,
          supplier: true,
          user: { select: { name: true } },
        },
      }),
      ...afterPurchase,
    ]);

    const purchase = purchaseResults[0];

    await writeAudit({
      userId: req.user.sub,
      action: "PURCHASE_RECEIVE",
      entityType: "Purchase",
      entityId: purchase.id,
      branchId: bid,
      summary: `Purchase lines ${purchase.items?.length}`,
    });

    res.status(201).json(purchase);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "فشل الاستلام";
    res.status(400).json({ error: msg });
  }
});

export default router;
