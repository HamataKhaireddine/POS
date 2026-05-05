import { Router } from "express";
import { Prisma } from "../lib/prisma-client-bundle.js";
import { prisma } from "../lib/prisma.js";
import { findBranchInOrg } from "../lib/orgScope.js";
import { authMiddleware, requireRole } from "../middleware/auth.js";
import { writeAudit } from "../lib/auditLog.js";
import { scheduleInventoryWebhook } from "../lib/inventoryWebhook.js";

const router = Router();
router.use(authMiddleware);

function toInt(v, fallback) {
  const n = Number.parseInt(String(v), 10);
  if (!Number.isFinite(n)) return fallback;
  return n;
}

function clampInt(v, min, max, fallback) {
  const n = toInt(v, fallback);
  return Math.min(max, Math.max(min, n));
}

async function buildReorderRecommendations({
  orgId,
  branchId,
  lookbackDays,
  targetStockDays,
  minDailySales,
}) {
  const since = new Date();
  since.setDate(since.getDate() - lookbackDays);

  const [inventoryRows, salesRows] = await Promise.all([
    prisma.inventory.findMany({
      where: {
        branchId,
        branch: { organizationId: orgId },
        product: { organizationId: orgId, isActive: true },
      },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            sku: true,
            barcode: true,
            cost: true,
          },
        },
      },
    }),
    prisma.saleItem.findMany({
      where: {
        sale: {
          branchId,
          branch: { organizationId: orgId },
          createdAt: { gte: since },
        },
      },
      select: { productId: true, quantity: true },
    }),
  ]);

  const soldByProduct = new Map();
  for (const row of salesRows) {
    const prev = soldByProduct.get(row.productId) ?? 0;
    soldByProduct.set(row.productId, prev + Number(row.quantity || 0));
  }

  const out = [];
  for (const inv of inventoryRows) {
    const sold = soldByProduct.get(inv.productId) ?? 0;
    const dailySales = sold / Math.max(1, lookbackDays);
    const effectiveDailySales = Math.max(minDailySales, dailySales);
    const targetQty = Math.ceil(effectiveDailySales * targetStockDays);
    const reorderPoint = Math.max(
      Number(inv.minStockLevel || 0),
      Math.ceil(effectiveDailySales * 7),
    );
    const currentQty = Number(inv.quantity || 0);
    const needsReorder = currentQty <= reorderPoint;
    if (!needsReorder) continue;
    const suggestedQty = Math.max(1, targetQty - currentQty);
    out.push({
      productId: inv.productId,
      name: inv.product?.name ?? "",
      sku: inv.product?.sku ?? null,
      barcode: inv.product?.barcode ?? null,
      currentQty,
      minStockLevel: Number(inv.minStockLevel || 0),
      reorderPoint,
      soldInLookback: sold,
      dailySales: Number(dailySales.toFixed(3)),
      targetStockDays,
      suggestedQty,
      defaultUnitCost:
        inv.product?.cost != null ? Number(inv.product.cost) : null,
    });
  }

  out.sort((a, b) => {
    const severityA = a.currentQty - a.reorderPoint;
    const severityB = b.currentQty - b.reorderPoint;
    if (severityA !== severityB) return severityA - severityB;
    return a.name.localeCompare(b.name);
  });
  return out;
}

async function receivePurchase(req, res, payload) {
  const { branchId, supplierId, note, items, updateProductCost } = payload || {};
  const bid = branchId || req.user.branchId;
  if (!bid) return res.status(400).json({ error: "يجب اختيار الفرع" });
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "لا توجد بنود" });
  }
  if (req.user.role !== "ADMIN" && req.user.branchId && req.user.branchId !== bid) {
    return res.status(403).json({ error: "لا يمكن الاستلام لفرع آخر" });
  }
  const orgId = req.user.organizationId;
  const branchOk = await findBranchInOrg(prisma, orgId, bid);
  if (!branchOk) return res.status(400).json({ error: "فرع غير صالح" });

  let supId = null;
  if (supplierId != null && String(supplierId).trim()) {
    const s = await prisma.supplier.findFirst({
      where: { id: String(supplierId), organizationId: orgId },
    });
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
      let expiryDate = null;
      if (line.expiryDate != null && String(line.expiryDate).trim()) {
        const d = new Date(String(line.expiryDate));
        if (Number.isNaN(d.getTime())) throw new Error("تاريخ انتهاء غير صالح");
        expiryDate = d;
      }
      const product = await prisma.product.findFirst({
        where: { id: productId, organizationId: orgId },
      });
      if (!product) throw new Error(`منتج غير موجود: ${productId}`);
      const unitCost = new Prisma.Decimal(uc.toFixed(2));
      const subtotal = unitCost.mul(qty);
      total = total.add(subtotal);
      lineData.push({ productId, quantity: qty, unitCost, subtotal, expiryDate });
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
          prisma.product.updateMany({
            where: { id: l.productId, organizationId: orgId },
            data: { cost: l.unitCost },
          }),
        );
      }
      afterPurchase.push(
        prisma.inventoryLot.create({
          data: {
            organizationId: orgId,
            productId: l.productId,
            branchId: bid,
            receivedAt: new Date(),
            expiryDate: l.expiryDate ?? null,
            quantityReceived: l.quantity,
            quantityOnHand: l.quantity,
            unitCost: l.unitCost,
          },
        }),
      );
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
              expiryDate: l.expiryDate ?? null,
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

    scheduleInventoryWebhook(orgId, {
      event: "purchase.received",
      meta: { purchaseId: purchase.id, branchId: bid },
      lines: lineData.map((l) => ({
        branchId: bid,
        productId: l.productId,
        quantityDelta: l.quantity,
      })),
    });

    return res.status(201).json(purchase);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "فشل الاستلام";
    return res.status(400).json({ error: msg });
  }
}

router.get("/", async (req, res) => {
  const { branchId, limit = "50" } = req.query;
  const where = { branch: { organizationId: req.user.organizationId } };
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

router.get("/reorder-recommendations", requireRole("ADMIN", "MANAGER"), async (req, res) => {
  const branchId = String(req.query.branchId || req.user.branchId || "");
  if (!branchId) return res.status(400).json({ error: "يجب اختيار الفرع" });
  if (
    req.user.role !== "ADMIN" &&
    req.user.branchId &&
    req.user.branchId !== branchId
  ) {
    return res.status(403).json({ error: "لا يمكن الوصول لفرع آخر" });
  }
  const orgId = req.user.organizationId;
  const branchOk = await findBranchInOrg(prisma, orgId, branchId);
  if (!branchOk) return res.status(400).json({ error: "فرع غير صالح" });

  const lookbackDays = clampInt(req.query.lookbackDays, 7, 120, 30);
  const targetStockDays = clampInt(req.query.targetStockDays, 7, 90, 21);
  const minDailySales = Math.max(
    0,
    Number.parseFloat(String(req.query.minDailySales ?? "0.05")) || 0.05,
  );

  const recommendations = await buildReorderRecommendations({
    orgId,
    branchId,
    lookbackDays,
    targetStockDays,
    minDailySales,
  });

  res.json({
    branchId,
    lookbackDays,
    targetStockDays,
    minDailySales,
    count: recommendations.length,
    recommendations,
  });
});

router.post("/reorder-recommendations/receive", requireRole("ADMIN", "MANAGER"), async (req, res) => {
  const branchId = String(req.body?.branchId || req.user.branchId || "");
  if (!branchId) return res.status(400).json({ error: "يجب اختيار الفرع" });
  if (
    req.user.role !== "ADMIN" &&
    req.user.branchId &&
    req.user.branchId !== branchId
  ) {
    return res.status(403).json({ error: "لا يمكن الاستلام لفرع آخر" });
  }
  const orgId = req.user.organizationId;
  const branchOk = await findBranchInOrg(prisma, orgId, branchId);
  if (!branchOk) return res.status(400).json({ error: "فرع غير صالح" });

  const linesRaw = Array.isArray(req.body?.items) ? req.body.items : [];
  const normalized = linesRaw
    .map((l) => ({
      productId: String(l?.productId || ""),
      quantity: Math.max(1, Math.floor(Number(l?.quantity) || 0)),
      unitCost:
        l?.unitCost != null && l?.unitCost !== ""
          ? Number(l.unitCost)
          : null,
    }))
    .filter((l) => l.productId && Number.isFinite(l.quantity) && l.quantity > 0);

  if (!normalized.length) {
    return res.status(400).json({ error: "لا توجد بنود صالحة للاستلام" });
  }

  const products = await prisma.product.findMany({
    where: {
      organizationId: orgId,
      id: { in: normalized.map((l) => l.productId) },
    },
    select: { id: true, cost: true },
  });
  const costByProduct = new Map(
    products.map((p) => [p.id, p.cost != null ? Number(p.cost) : null]),
  );

  const items = [];
  for (const line of normalized) {
    if (!costByProduct.has(line.productId)) continue;
    const fallbackCost = costByProduct.get(line.productId);
    const unitCostNum =
      line.unitCost != null && Number.isFinite(line.unitCost)
        ? line.unitCost
        : fallbackCost;
    if (unitCostNum == null || unitCostNum < 0) continue;
    items.push({
      productId: line.productId,
      quantity: line.quantity,
      unitCost: unitCostNum,
    });
  }
  if (!items.length) {
    return res
      .status(400)
      .json({ error: "يلزم تحديد تكلفة لكل البنود أو حفظ Cost للمنتجات أولاً" });
  }

  return receivePurchase(req, res, {
    branchId,
    supplierId: req.body?.supplierId || undefined,
    note:
      req.body?.note ??
      `Auto reorder • lookback=${toInt(req.body?.lookbackDays, 30)} days`,
    updateProductCost: Boolean(req.body?.updateProductCost),
    items,
  });
});

router.post("/receive", requireRole("ADMIN", "MANAGER"), async (req, res) => {
  return receivePurchase(req, res, req.body || {});
});

export default router;
