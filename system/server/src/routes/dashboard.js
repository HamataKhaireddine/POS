import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../middleware/auth.js";

const router = Router();
router.use(authMiddleware);

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfMonth() {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** فلتر فرع ضمن المؤسسة */
function branchScope(req, branchId) {
  const orgId = req.user.organizationId;
  if (branchId) {
    return {
      branchId: String(branchId),
      branch: { organizationId: orgId },
    };
  }
  return { branch: { organizationId: orgId } };
}

router.get("/summary", async (req, res) => {
  const branchId = req.query.branchId || (req.user.role === "ADMIN" ? null : req.user.branchId);
  const branchFilter = branchScope(req, branchId);

  const todaySales = await prisma.sale.aggregate({
    where: { ...branchFilter, createdAt: { gte: startOfToday() } },
    _count: true,
    _sum: { total: true },
  });

  const monthSales = await prisma.sale.aggregate({
    where: { ...branchFilter, createdAt: { gte: startOfMonth() } },
    _sum: { total: true },
  });

  const wholesaleMonth = await prisma.sale.aggregate({
    where: {
      ...branchFilter,
      channel: "WHOLESALE",
      createdAt: { gte: startOfMonth() },
    },
    _sum: { total: true },
  });

  const lowStock = await prisma.inventory.findMany({
    where: branchId
      ? {
          branchId: String(branchId),
          branch: { organizationId: req.user.organizationId },
          product: { organizationId: req.user.organizationId },
        }
      : {
          branch: { organizationId: req.user.organizationId },
          product: { organizationId: req.user.organizationId },
        },
    include: { product: true, branch: true },
  });
  const lowStockCount = lowStock.filter((r) => r.quantity <= r.minStockLevel).length;

  const monthSalesRows = await prisma.sale.findMany({
    where: { ...branchFilter, createdAt: { gte: startOfMonth() } },
    select: { total: true, taxAmount: true },
  });
  const revenueMonth = monthSalesRows.reduce(
    (s, r) => s + Number(r.total) - Number(r.taxAmount ?? 0),
    0
  );

  const itemsMonth = await prisma.saleItem.findMany({
    where: {
      sale: { ...branchFilter, createdAt: { gte: startOfMonth() } },
    },
    include: { product: { select: { id: true, name: true } } },
  });
  const costMonth = itemsMonth.reduce((acc, it) => {
    const c = it.product && "cost" in it.product ? Number(it.product.cost || 0) * it.quantity : 0;
    return acc + c;
  }, 0);

  res.json({
    salesTodayCount: todaySales._count,
    salesTodayTotal: todaySales._sum.total?.toString() ?? "0",
    salesMonthTotal: monthSales._sum.total?.toString() ?? "0",
    wholesaleMonthTotal: wholesaleMonth._sum.total?.toString() ?? "0",
    estimatedProfitMonth: (revenueMonth - costMonth).toFixed(2),
    lowStockAlerts: lowStockCount,
  });
});

router.get("/sales-by-product", async (req, res) => {
  const branchId = req.query.branchId || (req.user.role === "ADMIN" ? null : req.user.branchId);
  const from = req.query.from ? new Date(String(req.query.from)) : startOfMonth();
  const to = req.query.to ? new Date(String(req.query.to)) : new Date();
  const bf = branchScope(req, branchId);

  const items = await prisma.saleItem.findMany({
    where: {
      sale: {
        ...bf,
        createdAt: { gte: from, lte: to },
      },
    },
    include: { product: { select: { name: true } } },
  });

  const map = new Map();
  for (const it of items) {
    const name = it.product?.name || "—";
    map.set(name, (map.get(name) || 0) + Number(it.subtotal));
  }
  const chart = [...map.entries()].map(([name, value]) => ({ name, value }));
  chart.sort((a, b) => b.value - a.value);
  res.json(chart.slice(0, 20));
});

router.get("/sales-by-branch", async (req, res) => {
  if (req.user.role !== "ADMIN") {
    return res.status(403).json({ error: "للمدراء فقط" });
  }
  const from = req.query.from ? new Date(String(req.query.from)) : startOfMonth();
  const to = req.query.to ? new Date(String(req.query.to)) : new Date();

  const sales = await prisma.sale.groupBy({
    by: ["branchId"],
    where: {
      createdAt: { gte: from, lte: to },
      branch: { organizationId: req.user.organizationId },
    },
    _sum: { total: true },
  });
  const branches = await prisma.branch.findMany({
    where: {
      id: { in: sales.map((s) => s.branchId) },
      organizationId: req.user.organizationId,
    },
  });
  const nameById = Object.fromEntries(branches.map((b) => [b.id, b.name]));
  res.json(
    sales.map((s) => ({
      name: nameById[s.branchId] || s.branchId,
      value: Number(s._sum.total || 0),
    }))
  );
});

router.get("/monthly-profit", async (req, res) => {
  const branchId = req.query.branchId || (req.user.role === "ADMIN" ? null : req.user.branchId);
  const months = 6;
  const out = [];
  const now = new Date();
  const bf = branchScope(req, branchId);
  for (let i = months - 1; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);
    const salesInMonth = await prisma.sale.findMany({
      where: {
        ...bf,
        createdAt: { gte: start, lte: end },
      },
      select: { id: true, total: true, taxAmount: true },
    });
    let revenue = salesInMonth.reduce(
      (s, x) => s + Number(x.total) - Number(x.taxAmount ?? 0),
      0
    );
    const saleIds = salesInMonth.map((s) => s.id);
    const items = saleIds.length
      ? await prisma.saleItem.findMany({
          where: { saleId: { in: saleIds } },
          include: { product: true },
        })
      : [];
    let cost = 0;
    for (const it of items) {
      const c = it.product?.cost != null ? Number(it.product.cost) : 0;
      cost += c * it.quantity;
    }
    out.push({
      label: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`,
      profit: revenue - cost,
    });
  }
  res.json(out);
});

export default router;
