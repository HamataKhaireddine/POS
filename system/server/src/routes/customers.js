import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, requireRole } from "../middleware/auth.js";

const router = Router();
router.use(authMiddleware);

router.get("/", async (req, res) => {
  const q = String(req.query.q || "").trim();
  const where = {
    organizationId: req.user.organizationId,
    ...(q
      ? {
          OR: [
            { name: { contains: q } },
            { phone: { contains: q } },
            { email: { contains: q } },
          ],
        }
      : {}),
  };
  const list = await prisma.customer.findMany({
    where,
    orderBy: { name: "asc" },
    take: 200,
  });
  res.json(list);
});

router.post("/", async (req, res) => {
  const { name, phone, email, notes } = req.body || {};
  const n = String(name || "").trim();
  if (!n) return res.status(400).json({ error: "الاسم مطلوب" });
  const row = await prisma.customer.create({
    data: {
      organizationId: req.user.organizationId,
      name: n,
      phone: phone != null && String(phone).trim() ? String(phone).trim() : null,
      email: email != null && String(email).trim() ? String(email).trim() : null,
      notes: notes != null && String(notes).trim() ? String(notes).trim() : null,
    },
  });
  res.status(201).json(row);
});

router.patch("/:id", requireRole("ADMIN", "MANAGER"), async (req, res) => {
  const { name, phone, email, notes } = req.body || {};
  const data = {};
  if (name != null) {
    const n = String(name).trim();
    if (!n) return res.status(400).json({ error: "الاسم مطلوب" });
    data.name = n;
  }
  if (phone !== undefined) data.phone = phone ? String(phone).trim() : null;
  if (email !== undefined) data.email = email ? String(email).trim() : null;
  if (notes !== undefined) data.notes = notes ? String(notes).trim() : null;
  const existing = await prisma.customer.findFirst({
    where: { id: req.params.id, organizationId: req.user.organizationId },
  });
  if (!existing) return res.status(404).json({ error: "العميل غير موجود" });
  try {
    const row = await prisma.customer.update({
      where: { id: existing.id },
      data,
    });
    res.json(row);
  } catch {
    res.status(404).json({ error: "العميل غير موجود" });
  }
});

router.delete("/:id", requireRole("ADMIN"), async (req, res) => {
  const row = await prisma.customer.findFirst({
    where: { id: req.params.id, organizationId: req.user.organizationId },
  });
  if (!row) return res.status(404).end();
  try {
    await prisma.customer.delete({ where: { id: row.id } });
    res.status(204).end();
  } catch {
    res.status(400).json({ error: "تعذر الحذف — قد تكون هناك مبيعات مرتبطة" });
  }
});

export default router;
