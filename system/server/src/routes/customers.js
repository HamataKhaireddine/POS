import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, requireRole } from "../middleware/auth.js";

const router = Router();
router.use(authMiddleware);

router.get("/", async (req, res) => {
  const q = String(req.query.q || "").trim();
  const where = q
    ? {
        OR: [
          { name: { contains: q } },
          { phone: { contains: q } },
          { email: { contains: q } },
        ],
      }
    : {};
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
  try {
    const row = await prisma.customer.update({
      where: { id: req.params.id },
      data,
    });
    res.json(row);
  } catch {
    res.status(404).json({ error: "العميل غير موجود" });
  }
});

router.delete("/:id", requireRole("ADMIN"), async (req, res) => {
  try {
    await prisma.customer.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch {
    res.status(400).json({ error: "تعذر الحذف — قد تكون هناك مبيعات مرتبطة" });
  }
});

export default router;
