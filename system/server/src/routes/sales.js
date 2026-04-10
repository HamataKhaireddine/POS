import { Router } from "express";
import { Prisma } from "../lib/prisma-client-bundle.js";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../middleware/auth.js";
import { writeAudit } from "../lib/auditLog.js";

const router = Router();
router.use(authMiddleware);

const OK_PAY = new Set(["CASH", "CARD", "ONLINE"]);

function roundMoney(n) {
  return Math.round(n * 100) / 100;
}

/**
 * @param {unknown} splits
 * @param {number} expectedTotal
 */
function normalizePaymentSplits(splits, expectedTotal) {
  if (splits == null) return { useSplit: false, pm: null, normalized: null };
  if (!Array.isArray(splits) || splits.length < 2) {
    return { useSplit: false, pm: null, normalized: null };
  }
  const norm = [];
  let sum = 0;
  for (const row of splits) {
    const m = String(row?.method || "").toUpperCase();
    if (!OK_PAY.has(m)) {
      throw new Error("طريقة دفع غير صالحة في التقسيم");
    }
    const raw = String(row?.amount ?? "").replace(",", ".");
    const amt = Number.parseFloat(raw);
    if (Number.isNaN(amt) || amt <= 0) {
      throw new Error("مبلغ غير صالح في تقسيم الدفع");
    }
    const r = roundMoney(amt);
    sum = roundMoney(sum + r);
    norm.push({ method: m, amount: r });
  }
  const exp = roundMoney(expectedTotal);
  if (Math.abs(sum - exp) > 0.02) {
    throw new Error(`مجموع التقسيم (${sum}) يجب أن يساوي المستحق (${exp})`);
  }
  return { useSplit: true, pm: "SPLIT", normalized: norm };
}

router.post("/checkout", async (req, res) => {
  const {
    branchId,
    items,
    paymentMethod,
    paymentSplits,
    customerId,
    discountAmount: discountRaw,
    taxPercent: taxPercentRaw,
    clientMutationId: clientMutationIdRaw,
    deviceId: _deviceId,
  } = req.body || {};
  const bid = branchId || req.user.branchId;
  if (!bid) return res.status(400).json({ error: "يجب اختيار الفرع" });
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "السلة فارغة" });
  }
  const pmSingle = OK_PAY.has(String(paymentMethod).toUpperCase())
    ? String(paymentMethod).toUpperCase()
    : "CASH";

  if (req.user.role !== "ADMIN" && req.user.branchId && req.user.branchId !== bid) {
    return res.status(403).json({ error: "لا يمكن البيع لفرع آخر" });
  }

  const clientMutationId =
    clientMutationIdRaw != null && String(clientMutationIdRaw).trim()
      ? String(clientMutationIdRaw).trim()
      : null;

  if (clientMutationId) {
    const existing = await prisma.sale.findUnique({
      where: { clientMutationId },
      include: {
        items: { include: { product: true } },
        branch: true,
        customer: true,
        user: { select: { id: true, name: true } },
      },
    });
    if (existing) {
      if (existing.branchId !== bid || existing.userId !== req.user.sub) {
        return res.status(409).json({ error: "تعارض معرف المزامنة" });
      }
      return res.status(200).json(existing);
    }
  }

  let custId = null;
  if (customerId != null && String(customerId).trim()) {
    const c = await prisma.customer.findUnique({ where: { id: String(customerId) } });
    if (!c) return res.status(400).json({ error: "عميل غير موجود" });
    custId = c.id;
  }

  try {
    const sale = await prisma.$transaction(async (tx) => {
      let total = new Prisma.Decimal(0);
      const lineData = [];

      for (const line of items) {
        const productId = line.productId;
        const qty = Math.max(1, Math.floor(Number(line.quantity) || 1));
        const product = await tx.product.findUnique({ where: { id: productId } });
        if (!product) throw new Error(`منتج غير موجود: ${productId}`);
        const inv = await tx.inventory.findUnique({
          where: {
            productId_branchId: { productId, branchId: bid },
          },
        });
        if (!inv || inv.quantity < qty) {
          throw new Error(`كمية غير كافية: ${product.name}`);
        }
        const unitPrice = product.price;
        const subtotal = unitPrice.mul(qty);
        total = total.add(subtotal);
        lineData.push({ productId, quantity: qty, unitPrice, subtotal });
      }

      const subtotalDec = total;
      let discountDec = new Prisma.Decimal(0);
      const d = Number(discountRaw);
      if (!Number.isNaN(d) && d > 0) {
        const cap = Number(subtotalDec);
        const applied = Math.min(d, cap);
        discountDec = new Prisma.Decimal(applied.toFixed(2));
      }
      const afterDiscount = subtotalDec.sub(discountDec);
      let taxDec = new Prisma.Decimal(0);
      const tp = Number(taxPercentRaw);
      if (!Number.isNaN(tp) && tp > 0) {
        const rate = Math.min(100, tp);
        taxDec = afterDiscount.mul(new Prisma.Decimal(rate)).div(100);
      }
      const grandTotal = afterDiscount.add(taxDec);
      const grandNum = roundMoney(Number(grandTotal.toString()));

      const splitInfo = normalizePaymentSplits(paymentSplits, grandNum);
      const pm = splitInfo.useSplit ? "SPLIT" : pmSingle;

      const openSession = await tx.cashSession.findFirst({
        where: { branchId: bid, closedAt: null },
        select: { id: true },
      });

      const created = await tx.sale.create({
        data: {
          branchId: bid,
          userId: req.user.sub,
          customerId: custId,
          ...(clientMutationId ? { clientMutationId } : {}),
          total: grandTotal,
          discountAmount: discountDec,
          taxAmount: taxDec,
          paymentMethod: pm,
          ...(splitInfo.useSplit ? { paymentSplits: splitInfo.normalized } : {}),
          cashSessionId: openSession?.id ?? null,
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
          customer: true,
          user: { select: { id: true, name: true } },
        },
      });

      for (const l of lineData) {
        await tx.inventory.update({
          where: {
            productId_branchId: { productId: l.productId, branchId: bid },
          },
          data: { quantity: { decrement: l.quantity } },
        });
      }

      return created;
    });

    await writeAudit({
      userId: req.user.sub,
      action: "SALE_CHECKOUT",
      entityType: "Sale",
      entityId: sale.id,
      branchId: bid,
      summary: `Total ${sale.total} ${sale.paymentMethod}`,
      meta: {
        paymentMethod: sale.paymentMethod,
        lines: items.length,
        split: sale.paymentMethod === "SPLIT",
      },
    });

    res.status(201).json(sale);
  } catch (e) {
    if (
      clientMutationId &&
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      const replay = await prisma.sale.findUnique({
        where: { clientMutationId },
        include: {
          items: { include: { product: true } },
          branch: true,
          customer: true,
          user: { select: { id: true, name: true } },
        },
      });
      if (replay) {
        return res.status(200).json(replay);
      }
    }
    const msg = e instanceof Error ? e.message : "فشل إتمام البيع";
    res.status(400).json({ error: msg });
  }
});

router.get("/", async (req, res) => {
  const { branchId, from, to, limit = "50" } = req.query;
  const where = {};
  const bid = branchId || (req.user.role === "ADMIN" ? undefined : req.user.branchId);
  if (bid) where.branchId = String(bid);
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(String(from));
    if (to) where.createdAt.lte = new Date(String(to));
  }
  const sales = await prisma.sale.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: Math.min(200, Math.max(1, parseInt(String(limit), 10) || 50)),
    include: {
      items: { include: { product: { select: { name: true, sku: true } } } },
      branch: { select: { name: true } },
      customer: { select: { id: true, name: true, phone: true } },
      user: { select: { name: true } },
    },
  });
  res.json(sales);
});

router.get("/:id", async (req, res) => {
  const sale = await prisma.sale.findUnique({
    where: { id: req.params.id },
    include: {
      items: { include: { product: true } },
      branch: true,
      customer: true,
      user: { select: { id: true, name: true, email: true } },
    },
  });
  if (!sale) return res.status(404).json({ error: "الفاتورة غير موجودة" });
  if (req.user.role !== "ADMIN" && req.user.branchId && sale.branchId !== req.user.branchId) {
    return res.status(403).json({ error: "غير مصرح" });
  }
  res.json(sale);
});

export default router;
