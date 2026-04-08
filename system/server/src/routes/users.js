import { Router } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, requireRole } from "../middleware/auth.js";

const router = Router();
router.use(authMiddleware);
router.use(requireRole("ADMIN"));

router.get("/", async (_req, res) => {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      name: true,
      nameEn: true,
      role: true,
      branchId: true,
      branch: { select: { name: true, nameEn: true } },
      createdAt: true,
    },
  });
  res.json(users);
});

router.post("/", async (req, res) => {
  const { email, password, name, nameEn, role, branchId } = req.body || {};
  if (!email?.trim() || !password || !name?.trim()) {
    return res.status(400).json({ error: "البريد والاسم وكلمة المرور مطلوبة" });
  }
  if (!["ADMIN", "MANAGER", "CASHIER"].includes(String(role))) {
    return res.status(400).json({ error: "دور غير صالح" });
  }
  const hash = await bcrypt.hash(String(password), 10);
  const user = await prisma.user.create({
    data: {
      email: String(email).toLowerCase().trim(),
      passwordHash: hash,
      name: name.trim(),
      nameEn: nameEn?.trim() || null,
      role: String(role),
      branchId: branchId || null,
    },
    select: {
      id: true,
      email: true,
      name: true,
      nameEn: true,
      role: true,
      branchId: true,
      branch: { select: { name: true, nameEn: true } },
    },
  });
  res.status(201).json(user);
});

router.patch("/:id", async (req, res) => {
  const { name, nameEn, role, branchId, password } = req.body || {};
  const data = {};
  if (name != null) data.name = String(name).trim();
  if (nameEn !== undefined) data.nameEn = nameEn?.trim() || null;
  if (role && ["ADMIN", "MANAGER", "CASHIER"].includes(String(role))) {
    data.role = String(role);
  }
  if (branchId !== undefined) data.branchId = branchId || null;
  if (password) data.passwordHash = await bcrypt.hash(String(password), 10);

  const user = await prisma.user.update({
    where: { id: req.params.id },
    data,
    select: {
      id: true,
      email: true,
      name: true,
      nameEn: true,
      role: true,
      branchId: true,
      branch: { select: { name: true, nameEn: true } },
    },
  });
  res.json(user);
});

router.delete("/:id", async (req, res) => {
  if (req.params.id === req.user.sub) {
    return res.status(400).json({ error: "لا يمكن حذف حسابك الحالي" });
  }
  await prisma.user.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

export default router;
