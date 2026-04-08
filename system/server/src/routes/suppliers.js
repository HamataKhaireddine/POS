import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, requireRole } from "../middleware/auth.js";

const router = Router();
router.use(authMiddleware);

router.get("/", async (_req, res) => {
  const rows = await prisma.supplier.findMany({ orderBy: { name: "asc" } });
  res.json(rows);
});

router.post("/", requireRole("ADMIN", "MANAGER"), async (req, res) => {
  const { name, phone, note } = req.body || {};
  const n = String(name || "").trim();
  if (!n) return res.status(400).json({ error: "اسم المورد مطلوب" });
  const row = await prisma.supplier.create({
    data: {
      name: n,
      phone: phone != null && String(phone).trim() ? String(phone).trim() : null,
      note: note != null && String(note).trim() ? String(note).trim() : null,
    },
  });
  res.status(201).json(row);
});

router.patch("/:id", requireRole("ADMIN", "MANAGER"), async (req, res) => {
  const { name, phone, note } = req.body || {};
  const data = {};
  if (name != null) {
    const n = String(name).trim();
    if (!n) return res.status(400).json({ error: "اسم المورد مطلوب" });
    data.name = n;
  }
  if (phone !== undefined) data.phone = phone ? String(phone).trim() : null;
  if (note !== undefined) data.note = note ? String(note).trim() : null;
  try {
    const row = await prisma.supplier.update({ where: { id: req.params.id }, data });
    res.json(row);
  } catch {
    res.status(404).json({ error: "غير موجود" });
  }
});

router.delete("/:id", requireRole("ADMIN"), async (req, res) => {
  try {
    await prisma.supplier.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch {
    res.status(400).json({ error: "تعذر الحذف" });
  }
});

export default router;
