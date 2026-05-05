import { Router } from "express";
import { Prisma } from "../lib/prisma-client-bundle.js";
import { prisma } from "../lib/prisma.js";
import { findBranchInOrg } from "../lib/orgScope.js";
import { authMiddleware, requireRole } from "../middleware/auth.js";
import { writeAudit } from "../lib/auditLog.js";
import { scheduleInventoryWebhook } from "../lib/inventoryWebhook.js";
import { resolveStoredImageUrl } from "../lib/productImageUrl.js";
import { calendarDaysUntilExpiryUTC, DEFAULT_ALERT_DAYS } from "../lib/productExpiry.js";

const router = Router();
router.use(authMiddleware);

/** منتجات ضمن نافذة التنبيه قبل انتهاء الصلاحية (أو منتهية) */
router.get("/expiry-alerts", async (req, res) => {
  try {
    const branchId =
      req.query.branchId != null && String(req.query.branchId).trim()
        ? String(req.query.branchId).trim()
        : req.user.branchId || null;
    const orgId = req.user.organizationId;

    const products = await prisma.product.findMany({
      where: {
        organizationId: orgId,
        isActive: true,
        expiryDate: { not: null },
      },
      include: branchId
        ? { inventories: { where: { branchId } } }
        : { inventories: true },
      orderBy: { expiryDate: "asc" },
    });

    const out = [];
    for (const p of products) {
      const days = calendarDaysUntilExpiryUTC(p.expiryDate);
      if (days === null) continue;
      const windowDays = p.expiryAlertDaysBefore ?? DEFAULT_ALERT_DAYS;
      if (days > windowDays) continue;
      out.push({
        product: {
          ...p,
          imageUrl: resolveStoredImageUrl(p.imageUrl),
        },
        daysUntilExpiry: days,
        status: days < 0 ? "expired" : "soon",
        alertDays: windowDays,
      });
    }
    out.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);
    res.json(out);
  } catch (e) {
    console.error("[expiry-alerts]", e);
    res.status(500).json({ error: "تعذر جلب تنبيهات الصلاحية" });
  }
});

router.get("/low-stock", async (req, res) => {
  const branchId = req.query.branchId || req.user.branchId;
  const orgId = req.user.organizationId;
  const rows = await prisma.inventory.findMany({
    where: branchId
      ? {
          branchId: String(branchId),
          branch: { organizationId: orgId },
          product: { organizationId: orgId },
        }
      : {
          branch: { organizationId: orgId },
          product: { organizationId: orgId },
        },
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
  const br = await findBranchInOrg(prisma, req.user.organizationId, bid);
  if (!br) return res.status(400).json({ error: "فرع غير صالح" });
  for (const line of lines) {
    const pr = await prisma.product.findFirst({
      where: { id: line.productId, organizationId: req.user.organizationId },
    });
    if (!pr) return res.status(400).json({ error: `منتج غير صالح: ${line.productId}` });
  }

  try {
    await prisma.$transaction(
      lines.map((line) => {
        const productId = line.productId;
        const q = Math.max(0, Math.floor(Number(line.quantity) || 0));
        return prisma.inventory.upsert({
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
      }),
    );
    await writeAudit({
      userId: req.user.sub,
      action: "INVENTORY_RECONCILE",
      entityType: "Inventory",
      entityId: bid,
      branchId: bid,
      summary: `Reconcile ${lines.length} lines`,
    });
    scheduleInventoryWebhook(req.user.organizationId, {
      event: "inventory.reconcile",
      meta: { branchId: bid, lineCount: lines.length },
      lines: lines.map((line) => ({
        branchId: bid,
        productId: line.productId,
        quantityDelta: 0,
      })),
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
  const orgId = req.user.organizationId;
  const bFrom = await findBranchInOrg(prisma, orgId, from);
  const bTo = await findBranchInOrg(prisma, orgId, to);
  if (!bFrom || !bTo) return res.status(400).json({ error: "فرع غير صالح" });

  try {
    const prep = [];
    for (const line of items) {
      const productId = line.productId;
      const qty = Math.max(1, Math.floor(Number(line.quantity) || 1));
      const src = await prisma.inventory.findUnique({
        where: { productId_branchId: { productId, branchId: from } },
      });
      if (!src || src.quantity < qty) {
        const p = await prisma.product.findFirst({
          where: { id: productId, organizationId: orgId },
        });
        return res.status(400).json({ error: `كمية غير كافية: ${p?.name || productId}` });
      }
      prep.push({ productId, qty });
    }
    await prisma.$transaction(
      prep.flatMap(({ productId, qty }) => [
        prisma.inventory.update({
          where: { productId_branchId: { productId, branchId: from } },
          data: { quantity: { decrement: qty } },
        }),
        prisma.inventory.upsert({
          where: { productId_branchId: { productId, branchId: to } },
          create: {
            productId,
            branchId: to,
            quantity: qty,
            minStockLevel: 5,
          },
          update: { quantity: { increment: qty } },
        }),
      ]),
    );
    await writeAudit({
      userId: req.user.sub,
      action: "INVENTORY_TRANSFER",
      entityType: "Branch",
      entityId: `${from}->${to}`,
      branchId: from,
      summary: `Transfer ${items.length} lines to branch ${to}`,
    });
    scheduleInventoryWebhook(orgId, {
      event: "inventory.transfer",
      meta: { fromBranchId: from, toBranchId: to, lineCount: prep.length },
      lines: prep.flatMap(({ productId, qty }) => [
        { branchId: from, productId, quantityDelta: -qty },
        { branchId: to, productId, quantityDelta: qty },
      ]),
    });
    res.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "فشل التحويل";
    res.status(400).json({ error: msg });
  }
});

/** تعديل مخزون مع idempotency للمزامنة بعد العمل دون اتصال */
router.post("/offline-upsert", requireRole("ADMIN", "MANAGER"), async (req, res) => {
  const {
    clientMutationId: cmRaw,
    productId,
    branchId,
    quantity,
    minStockLevel,
    deviceId: _deviceId,
  } = req.body || {};
  const cmid = cmRaw != null && String(cmRaw).trim() ? String(cmRaw).trim() : null;
  if (!cmid) return res.status(400).json({ error: "clientMutationId مطلوب" });
  if (!productId || !branchId) {
    return res.status(400).json({ error: "productId و branchId مطلوبان" });
  }
  const bid = String(branchId);
  if (req.user.role !== "ADMIN" && req.user.branchId && req.user.branchId !== bid) {
    return res.status(403).json({ error: "لا يمكن التعديل لفروع أخرى" });
  }

  const cached = await prisma.offlineInventoryReceipt.findFirst({
    where: { clientMutationId: cmid, organizationId: req.user.organizationId },
  });
  if (cached) {
    return res.status(200).json(cached.payload);
  }

  const br = await findBranchInOrg(prisma, req.user.organizationId, bid);
  if (!br) return res.status(400).json({ error: "فرع غير صالح" });
  const prodOk = await prisma.product.findFirst({
    where: { id: String(productId), organizationId: req.user.organizationId },
  });
  if (!prodOk) return res.status(400).json({ error: "منتج غير صالح" });

  try {
    const inv = await prisma.inventory.upsert({
      where: {
        productId_branchId: {
          productId: String(productId),
          branchId: bid,
        },
      },
      create: {
        productId: String(productId),
        branchId: bid,
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
    const payload = JSON.parse(JSON.stringify(inv));
    try {
      await prisma.offlineInventoryReceipt.create({
        data: {
          clientMutationId: cmid,
          organizationId: req.user.organizationId,
          payload,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        const again = await prisma.offlineInventoryReceipt.findFirst({
          where: { clientMutationId: cmid, organizationId: req.user.organizationId },
        });
        if (again) return res.status(200).json(again.payload);
      }
      throw e;
    }
    scheduleInventoryWebhook(req.user.organizationId, {
      event: "inventory.offline_upsert",
      meta: { branchId: bid, productId: String(productId) },
      lines: [
        {
          branchId: bid,
          productId: String(productId),
          quantityDelta: 0,
        },
      ],
    });
    res.status(201).json(payload);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "فشل التحديث";
    res.status(400).json({ error: msg });
  }
});

router.patch("/:productId/:branchId", requireRole("ADMIN", "MANAGER"), async (req, res) => {
  const { quantity, minStockLevel } = req.body || {};
  const orgId = req.user.organizationId;
  const br = await findBranchInOrg(prisma, orgId, req.params.branchId);
  if (!br) return res.status(404).json({ error: "غير موجود" });
  const pr = await prisma.product.findFirst({
    where: { id: req.params.productId, organizationId: orgId },
  });
  if (!pr) return res.status(404).json({ error: "غير موجود" });
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
  scheduleInventoryWebhook(orgId, {
    event: "inventory.patch",
    meta: {
      branchId: req.params.branchId,
      productId: req.params.productId,
    },
    lines: [
      {
        branchId: req.params.branchId,
        productId: req.params.productId,
        quantityDelta: 0,
      },
    ],
  });
  res.json(inv);
});

export default router;
