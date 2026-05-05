import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, requireRole } from "../middleware/auth.js";
import { findBranchInOrg } from "../lib/orgScope.js";

const router = Router();
router.use(authMiddleware);
router.use(requireRole("ADMIN", "MANAGER"));

function toDateOnly(v) {
  const d = v ? new Date(String(v)) : new Date();
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

function parseLatLngFromAddress(text) {
  // Optional quick format: "Some address | 25.2854,51.5310"
  const s = String(text || "");
  const m = s.match(/(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/);
  if (!m) return { lat: null, lng: null };
  return { lat: Number(m[1]), lng: Number(m[2]) };
}

function distanceSq(a, b) {
  if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) return Number.MAX_SAFE_INTEGER;
  const dx = a.lat - b.lat;
  const dy = a.lng - b.lng;
  return dx * dx + dy * dy;
}

function haversineKm(a, b) {
  if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) return 0;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  return R * c;
}

function nearestNeighborOrder(points, startPoint) {
  const pending = [...points];
  const ordered = [];
  let cursor = startPoint || { lat: null, lng: null };
  while (pending.length) {
    let idx = 0;
    let best = Number.MAX_SAFE_INTEGER;
    for (let i = 0; i < pending.length; i += 1) {
      const d = distanceSq(cursor, pending[i]);
      if (d < best) {
        best = d;
        idx = i;
      }
    }
    const pick = pending.splice(idx, 1)[0];
    ordered.push(pick);
    cursor = { lat: pick.lat, lng: pick.lng };
  }
  return ordered;
}

async function estimateTravelMinutes(a, b, avgKmh) {
  const directKm = haversineKm(a, b);
  if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) {
    return Math.max(5, Math.round((directKm || 3) / Math.max(10, avgKmh) * 60));
  }
  const mode = String(process.env.DELIVERY_DISTANCE_MODE || "").toLowerCase();
  if (mode !== "osrm") {
    return Math.max(3, Math.round((directKm || 3) / Math.max(10, avgKmh) * 60));
  }
  const base = process.env.OSRM_BASE_URL || "https://router.project-osrm.org";
  const url = `${base}/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=false`;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2500);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`OSRM ${res.status}`);
    const json = await res.json();
    const sec = Number(json?.routes?.[0]?.duration || 0);
    if (!Number.isFinite(sec) || sec <= 0) throw new Error("No duration");
    return Math.max(1, Math.round(sec / 60));
  } catch {
    return Math.max(3, Math.round((directKm || 3) / Math.max(10, avgKmh) * 60));
  }
}

function splitIntoBuckets(items, bucketCount) {
  const n = Math.max(1, bucketCount);
  const buckets = Array.from({ length: n }, () => []);
  for (let i = 0; i < items.length; i += 1) {
    buckets[i % n].push(items[i]);
  }
  return buckets;
}

router.get("/orders", async (req, res) => {
  const branchId = req.query.branchId ? String(req.query.branchId) : req.user.branchId || null;
  const date = toDateOnly(req.query.date);
  if (!date) return res.status(400).json({ error: "date غير صالح" });
  if (!branchId) return res.status(400).json({ error: "branchId مطلوب" });
  const br = await findBranchInOrg(prisma, req.user.organizationId, branchId);
  if (!br) return res.status(400).json({ error: "فرع غير صالح" });
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  const rows = await prisma.deliveryOrder.findMany({
    where: {
      organizationId: req.user.organizationId,
      branchId,
      scheduledDate: { gte: date, lte: end },
    },
    include: {
      customer: { select: { id: true, name: true, phone: true } },
      stop: { select: { id: true, routeId: true, sequence: true, status: true } },
    },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    take: 1000,
  });
  res.json(rows);
});

router.post("/orders", async (req, res) => {
  const b = req.body || {};
  const branchId = String(b.branchId || req.user.branchId || "");
  if (!branchId) return res.status(400).json({ error: "branchId مطلوب" });
  const br = await findBranchInOrg(prisma, req.user.organizationId, branchId);
  if (!br) return res.status(400).json({ error: "فرع غير صالح" });
  const addressText = String(b.addressText || "").trim();
  if (!addressText) return res.status(400).json({ error: "العنوان مطلوب" });
  const customerId = b.customerId ? String(b.customerId) : null;
  if (customerId) {
    const c = await prisma.customer.findFirst({
      where: { id: customerId, organizationId: req.user.organizationId },
    });
    if (!c) return res.status(400).json({ error: "العميل غير صالح" });
  }
  const scheduledDate = toDateOnly(b.scheduledDate);
  if (!scheduledDate) return res.status(400).json({ error: "scheduledDate غير صالح" });
  const ll = parseLatLngFromAddress(addressText);
  const row = await prisma.deliveryOrder.create({
    data: {
      organizationId: req.user.organizationId,
      branchId,
      customerId,
      sourceSaleId: b.sourceSaleId ? String(b.sourceSaleId) : null,
      addressText,
      lat: ll.lat,
      lng: ll.lng,
      priority: Math.max(0, Math.min(10, Number(b.priority) || 0)),
      windowStartMin:
        b.windowStartMin != null && b.windowStartMin !== ""
          ? Math.max(0, Math.min(1439, Number(b.windowStartMin) || 0))
          : null,
      windowEndMin:
        b.windowEndMin != null && b.windowEndMin !== ""
          ? Math.max(0, Math.min(1439, Number(b.windowEndMin) || 0))
          : null,
      status: "PENDING",
      scheduledDate,
      note: b.note ? String(b.note).trim() : null,
    },
  });
  res.status(201).json(row);
});

router.post("/routes/build", async (req, res) => {
  const b = req.body || {};
  const branchId = String(b.branchId || req.user.branchId || "");
  if (!branchId) return res.status(400).json({ error: "branchId مطلوب" });
  const br = await findBranchInOrg(prisma, req.user.organizationId, branchId);
  if (!br) return res.status(400).json({ error: "فرع غير صالح" });
  const routeDate = toDateOnly(b.routeDate);
  if (!routeDate) return res.status(400).json({ error: "routeDate غير صالح" });
  const end = new Date(routeDate);
  end.setHours(23, 59, 59, 999);

  const candidates = await prisma.deliveryOrder.findMany({
    where: {
      organizationId: req.user.organizationId,
      branchId,
      scheduledDate: { gte: routeDate, lte: end },
      status: { in: ["PENDING", "ROUTED"] },
    },
    include: { customer: { select: { id: true, name: true } } },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    take: 1000,
  });
  if (!candidates.length) return res.status(400).json({ error: "لا توجد طلبات توصيل لليوم" });

  const driverCount = Math.max(1, Math.min(10, Number(b.driverCount) || 1));
  const baseLat = b.baseLat != null && b.baseLat !== "" ? Number(b.baseLat) : null;
  const baseLng = b.baseLng != null && b.baseLng !== "" ? Number(b.baseLng) : null;
  const avgKmh = Math.max(10, Math.min(80, Number(b.avgKmh) || 35));
  const stopServiceMin = Math.max(0, Math.min(60, Number(b.stopServiceMin) || 5));
  const departAt = b.departAt ? new Date(String(b.departAt)) : new Date(routeDate);
  if (Number.isNaN(departAt.getTime())) {
    return res.status(400).json({ error: "departAt غير صالح" });
  }

  // Sort by priority first then distribute across drivers for load balance.
  const byPriority = [...candidates].sort((a, b2) => {
    const wa = a.windowStartMin ?? 0;
    const wb = b2.windowStartMin ?? 0;
    if (wa !== wb) return wa - wb;
    if (a.priority !== b2.priority) return b2.priority - a.priority;
    return new Date(a.createdAt).getTime() - new Date(b2.createdAt).getTime();
  });
  const buckets = splitIntoBuckets(byPriority, driverCount);

  const createdRouteIds = [];
  await prisma.$transaction(async (tx) => {
    for (let rIdx = 0; rIdx < buckets.length; rIdx += 1) {
      const bucket = buckets[rIdx];
      if (!bucket.length) continue;
      const ordered = nearestNeighborOrder(bucket, { lat: baseLat, lng: baseLng });
      const route = await tx.deliveryRoute.create({
        data: {
          organizationId: req.user.organizationId,
          branchId,
          routeDate,
          driverName:
            b.driverNames && Array.isArray(b.driverNames) && b.driverNames[rIdx]
              ? String(b.driverNames[rIdx]).trim()
              : b.driverName
                ? String(b.driverName).trim()
                : `Driver ${rIdx + 1}`,
          vehicleName: b.vehicleName ? String(b.vehicleName).trim() : null,
          status: "ROUTED",
          totalStops: ordered.length,
        },
      });
      createdRouteIds.push(route.id);

      let cursor = { lat: baseLat, lng: baseLng };
      let eta = new Date(departAt);
      for (let i = 0; i < ordered.length; i += 1) {
        const ord = ordered[i];
        const driveMinutes = await estimateTravelMinutes(cursor, ord, avgKmh);
        eta = new Date(eta.getTime() + driveMinutes * 60 * 1000);
        const etaMinutes = eta.getHours() * 60 + eta.getMinutes();
        if (ord.windowStartMin != null && etaMinutes < ord.windowStartMin) {
          const wait = ord.windowStartMin - etaMinutes;
          eta = new Date(eta.getTime() + wait * 60 * 1000);
        }
        await tx.deliveryStop.create({
          data: {
            organizationId: req.user.organizationId,
            routeId: route.id,
            deliveryOrderId: ord.id,
            branchId,
            customerId: ord.customerId,
            sequence: i + 1,
            etaAt: new Date(eta),
            status: "ROUTED",
          },
        });
        eta = new Date(eta.getTime() + stopServiceMin * 60 * 1000);
        cursor = { lat: ord.lat, lng: ord.lng };
        await tx.deliveryOrder.update({
          where: { id: ord.id },
          data: { status: "ROUTED" },
        });
      }
    }
  });

  const full = await prisma.deliveryRoute.findMany({
    where: { id: { in: createdRouteIds } },
    include: {
      stops: {
        orderBy: { sequence: "asc" },
        include: {
          deliveryOrder: true,
          customer: { select: { id: true, name: true, phone: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });
  res.json({ routes: full, routeCount: full.length, stopCount: full.reduce((s, r) => s + r.stops.length, 0) });
});

router.post("/routes/:id/reoptimize", async (req, res) => {
  const existing = await prisma.deliveryRoute.findFirst({
    where: { id: req.params.id, organizationId: req.user.organizationId },
    include: {
      stops: {
        include: { deliveryOrder: true },
        orderBy: { sequence: "asc" },
      },
    },
  });
  if (!existing) return res.status(404).json({ error: "المسار غير موجود" });
  const remaining = existing.stops.filter((s) =>
    ["ROUTED", "OUT_FOR_DELIVERY", "FAILED"].includes(s.status),
  );
  if (!remaining.length) return res.json({ ok: true, updatedStops: 0 });

  const failedStop = remaining.find((s) => s.status === "FAILED");
  const start = failedStop
    ? { lat: failedStop.deliveryOrder?.lat ?? null, lng: failedStop.deliveryOrder?.lng ?? null }
    : { lat: null, lng: null };
  const reordered = nearestNeighborOrder(
    remaining.map((s) => ({
      ...s,
      lat: s.deliveryOrder?.lat ?? null,
      lng: s.deliveryOrder?.lng ?? null,
      windowStartMin: s.deliveryOrder?.windowStartMin ?? null,
    })),
    start,
  );
  await prisma.$transaction(
    reordered.map((s, idx) =>
      prisma.deliveryStop.update({
        where: { id: s.id },
        data: {
          sequence: idx + 1,
          status: s.status === "FAILED" ? "ROUTED" : s.status,
        },
      }),
    ),
  );
  const route = await prisma.deliveryRoute.findFirst({
    where: { id: existing.id },
    include: {
      stops: {
        orderBy: { sequence: "asc" },
        include: { deliveryOrder: true, customer: { select: { id: true, name: true, phone: true } } },
      },
    },
  });
  res.json({ ok: true, route });
});

router.get("/routes", async (req, res) => {
  const branchId = req.query.branchId ? String(req.query.branchId) : req.user.branchId || null;
  const routeDate = toDateOnly(req.query.routeDate);
  if (!branchId) return res.status(400).json({ error: "branchId مطلوب" });
  const br = await findBranchInOrg(prisma, req.user.organizationId, branchId);
  if (!br) return res.status(400).json({ error: "فرع غير صالح" });
  const where = {
    organizationId: req.user.organizationId,
    branchId,
    ...(routeDate
      ? {
          routeDate: {
            gte: routeDate,
            lte: new Date(new Date(routeDate).setHours(23, 59, 59, 999)),
          },
        }
      : {}),
  };
  const rows = await prisma.deliveryRoute.findMany({
    where,
    include: {
      stops: {
        orderBy: { sequence: "asc" },
        include: {
          deliveryOrder: true,
          customer: { select: { id: true, name: true, phone: true } },
        },
      },
    },
    orderBy: [{ routeDate: "desc" }, { createdAt: "desc" }],
    take: 100,
  });
  res.json(rows);
});

router.patch("/routes/:id/driver-location", async (req, res) => {
  const route = await prisma.deliveryRoute.findFirst({
    where: { id: req.params.id, organizationId: req.user.organizationId },
  });
  if (!route) return res.status(404).json({ error: "المسار غير موجود" });
  const lat = Number(req.body?.lat);
  const lng = Number(req.body?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ error: "lat/lng غير صالحين" });
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return res.status(400).json({ error: "إحداثيات خارج النطاق" });
  }
  const row = await prisma.deliveryRoute.update({
    where: { id: route.id },
    data: {
      lastDriverLat: lat,
      lastDriverLng: lng,
      lastDriverAt: new Date(),
      status:
        route.status === "ROUTED" || route.status === "OUT_FOR_DELIVERY"
          ? "OUT_FOR_DELIVERY"
          : route.status,
    },
  });
  res.json(row);
});

router.patch("/stops/:id", async (req, res) => {
  const b = req.body || {};
  const stop = await prisma.deliveryStop.findFirst({
    where: { id: req.params.id, organizationId: req.user.organizationId },
    include: { deliveryOrder: true },
  });
  if (!stop) return res.status(404).json({ error: "الوقفة غير موجودة" });
  const nextStatus = String(b.status || "").toUpperCase();
  if (!["OUT_FOR_DELIVERY", "DELIVERED", "FAILED", "ROUTED"].includes(nextStatus)) {
    return res.status(400).json({ error: "status غير صالح" });
  }
  const updated = await prisma.$transaction(async (tx) => {
    const s = await tx.deliveryStop.update({
      where: { id: stop.id },
      data: {
        status: nextStatus,
        deliveredAt: nextStatus === "DELIVERED" ? new Date() : null,
      },
    });
    await tx.deliveryOrder.update({
      where: { id: stop.deliveryOrderId },
      data: { status: nextStatus },
    });
    return s;
  });
  res.json(updated);
});

export default router;
