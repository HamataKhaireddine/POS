import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, requireRole } from "../middleware/auth.js";
import { writeAudit } from "../lib/auditLog.js";

const router = Router();
router.use(authMiddleware);

router.get("/low-stock", async (req, res) => {
  const branchId = req.query.branchId || req.user.branchId;
  const rows = await prisma.inventory.findMany({
    where: branchId ? { branchId: String(branchId) } : {},
    include: { product: true, branch: true },
  });
  const low = rows.filter((r) => r.quantity <= r.minStockLevel);
  res.json(low);
});

router.post("/reconcile", requireRole("ADMIN", "MANAGER"), async (req, res) => {
  const { branchId, lines } = req.body || {};
  const bid = branchId || req.user.branchId;
  if (!bid) return res.status(400).json({ error: "يجب اختيار الفرع" });
  if (!Array.isArray(lines) || !lines.length) {
    return res.status(400).json({ error: "لا توجد بنود" });
  }
  if (req.user.role !== "ADMIN" && req.user.branchId && req.user.branchId !== bid) {
    return res.status(403).json({ error: "لا يمكن الجرد لفرع آخر" });
  }

  try {
    await prisma.$transaction(async (tx) => {
      for (const line of lines) {
        const productId = line.productId;
        const q = Math.max(0, Math.floor(Number(line.quantity) || 0));
        await tx.inventory.upsert({
          where: {
            productId_branchId: { productId, branchId: bid },
          },
          create: {
            productId,
            branchId: bid,
            quantity: q,
            minStockLevel: 5,
          },
          update: { quantity: q },
        });
      }
    });
    await writeAudit({
      userId: req.user.sub,
      action: "INVENTORY_RECONCILE",
      entityType: "Inventory",
      entityId: bid,
      branchId: bid,
      summary: `Reconcile ${lines.length} lines`,
    });
    res.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "فشل الجرد";
    res.status(400).json({ error: msg });
  }
});

router.post("/transfer", requireRole("ADMIN", "MANAGER"), async (req, res) => {
  const { fromBranchId, toBranchId, items } = req.body || {};
  const from = String(fromBranchId || "");
  const to = String(toBranchId || "");
  if (!from || !to || from === to) {
    return res.status(400).json({ error: "فرع المصدر والوجهة غير صالحين" });
  }
  if (!Array.isArray(items) || !items.length) {
    return res.status(400).json({ error: "لا توجد بنود" });
  }
  if (req.user.role !== "ADMIN" && req.user.branchId && req.user.branchId !== from) {
    return res.status(403).json({ error: "لا يمكن التحويل من فرع آخر" });
  }

  try {
    await prisma.$transaction(async (tx) => {
      for (const line of items) {
        const productId = line.productId;
        const qty = Math.max(1, Math.floor(Number(line.quantity) || 1));
        const src = await tx.inventory.findUnique({
          where: { productId_branchId: { productId, branchId: from } },
        });
        if (!src || src.quantity < qty) {
          const p = await tx.product.findUnique({ where: { id: productId } });
          throw new Error(`كمية غير كافية: ${p?.name || productId}`);
        }
        await tx.inventory.update({
          where: { productId_branchId: { productId, branchId: from } },
          data: { quantity: { decrement: qty } },
        });
        await tx.inventory.upsert({
          where: { productId_branchId: { productId, branchId: to } },
          create: {
            productId,
            branchId: to,
            quantity: qty,
            minStockLevel: 5,
          },
          update: { quantity: { increment: qty } },
        });
      }
    });
    await writeAudit({
      userId: req.user.sub,
      action: "INVENTORY_TRANSFER",
      entityType: "Branch",
      entityId: `${from}->${to}`,
      branchId: from,
      summary: `Transfer ${items.length} lines to branch ${to}`,
    });
    res.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "فشل التحويل";
    res.status(400).json({ error: msg });
  }
});

router.patch("/:productId/:branchId", requireRole("ADMIN", "MANAGER"), async (req, res) => {
  const { quantity, minStockLevel } = req.body || {};
  const inv = await prisma.inventory.upsert({
    where: {
      productId_branchId: {
        productId: req.params.productId,
        branchId: req.params.branchId,
      },
    },
    create: {
      productId: req.params.productId,
      branchId: req.params.branchId,
      quantity: Math.max(0, Number(quantity) || 0),
      minStockLevel: Math.max(0, Number(minStockLevel) || 5),
    },
    update: {
      ...(quantity != null && { quantity: Math.max(0, Number(quantity)) }),
      ...(minStockLevel != null && {
        minStockLevel: Math.max(0, Number(minStockLevel)),
      }),
    },
    include: { product: true, branch: true },
  });
  res.json(inv);
});

export default router;
