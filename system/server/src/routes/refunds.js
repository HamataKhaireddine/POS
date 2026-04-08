import { Router } from "express";
import { Prisma } from "@prisma/client";
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
  const rows = await prisma.refund.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: Math.min(200, Math.max(1, parseInt(String(limit), 10) || 50)),
    include: {
      items: { include: { product: { select: { id: true, name: true, sku: true } } } },
      branch: { select: { name: true } },
      user: { select: { name: true } },
      sale: { select: { id: true, total: true, createdAt: true } },
    },
  });
  res.json(rows);
});

router.post("/", requireRole("ADMIN", "MANAGER"), async (req, res) => {
  const { branchId, saleId, note, items } = req.body || {};
  const bid = branchId || req.user.branchId;
  if (!bid) return res.status(400).json({ error: "يجب اختيار الفرع" });
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "لا توجد أصناف للإرجاع" });
  }
  if (req.user.role !== "ADMIN" && req.user.branchId && req.user.branchId !== bid) {
    return res.status(403).json({ error: "لا يمكن الإرجاع لفرع آخر" });
  }

  let saleRef = null;
  if (saleId != null && String(saleId).trim()) {
    saleRef = await prisma.sale.findUnique({ where: { id: String(saleId) } });
    if (!saleRef) return res.status(400).json({ error: "فاتورة غير موجودة" });
    if (saleRef.branchId !== bid) return res.status(400).json({ error: "الفاتورة من فرع آخر" });
  }

  try {
    const refund = await prisma.$transaction(async (tx) => {
      let total = new Prisma.Decimal(0);
      const lineData = [];

      for (const line of items) {
        const productId = line.productId;
        const qty = Math.max(1, Math.floor(Number(line.quantity) || 1));
        const product = await tx.product.findUnique({ where: { id: productId } });
        if (!product) throw new Error(`منتج غير موجود: ${productId}`);
        const unitPrice = product.price;
        const subtotal = unitPrice.mul(qty);
        total = total.add(subtotal);
        lineData.push({ productId, quantity: qty, unitPrice, subtotal });
      }

      const created = await tx.refund.create({
        data: {
          branchId: bid,
          userId: req.user.sub,
          saleId: saleRef?.id ?? null,
          total,
          note: note != null && String(note).trim() ? String(note).trim() : null,
          items: {
            create: lineData.map((l) => ({
              productId: l.productId,
              quantity: l.quantity,
              unitPrice: l.unitPrice,
              subtotal: l.subtotal,
            })),
          },
        },
        include: {
          items: { include: { product: true } },
          branch: true,
          sale: true,
          user: { select: { name: true } },
        },
      });

      for (const l of lineData) {
        await tx.inventory.upsert({
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
        });
      }

      return created;
    });

    await writeAudit({
      userId: req.user.sub,
      action: "REFUND_CREATE",
      entityType: "Refund",
      entityId: refund.id,
      branchId: bid,
      summary: `Refund total ${refund.total}`,
      meta: { lines: refund.items?.length },
    });

    res.status(201).json(refund);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "فشل تسجيل الإرجاع";
    res.status(400).json({ error: msg });
  }
});

export default router;
