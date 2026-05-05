import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, requireRole } from "../middleware/auth.js";

const router = Router();
router.use(authMiddleware);

router.get("/", async (req, res) => {
  const branches = await prisma.branch.findMany({
    where: { organizationId: req.user.organizationId },
    orderBy: { name: "asc" },
  });
  res.json(branches);
});

router.post("/", requireRole("ADMIN"), async (req, res) => {
  const { name, nameEn, address } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: "اسم الفرع مطلوب" });
  const b = await prisma.branch.create({
    data: {
      organizationId: req.user.organizationId,
      name: name.trim(),
      nameEn: nameEn?.trim() || null,
      address: address?.trim() || null,
    },
  });
  res.status(201).json(b);
});

router.patch("/:id", requireRole("ADMIN"), async (req, res) => {
  const { name, nameEn, address, supabaseId } = req.body || {};
  const existing = await prisma.branch.findFirst({
    where: { id: req.params.id, organizationId: req.user.organizationId },
  });
  if (!existing) return res.status(404).json({ error: "الفرع غير موجود" });
  const data = {
    ...(name != null && { name: String(name).trim() }),
    ...(nameEn !== undefined && { nameEn: nameEn?.trim() || null }),
    ...(address !== undefined && { address: address?.trim() || null }),
  };
  if (supabaseId !== undefined) {
    const s = supabaseId != null && String(supabaseId).trim() ? String(supabaseId).trim() : null;
    data.supabaseId = s;
  }
  const b = await prisma.branch.update({
    where: { id: existing.id },
    data,
  });
  res.json(b);
});

export default router;
