import { Router } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";
import { findBranchInOrg } from "../lib/orgScope.js";
import { authMiddleware, requireRole } from "../middleware/auth.js";

const router = Router();
router.use(authMiddleware);
router.use(requireRole("ADMIN"));

router.get("/", async (req, res) => {
  const users = await prisma.user.findMany({
    where: { organizationId: req.user.organizationId },
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
  if (branchId) {
    const b = await findBranchInOrg(prisma, req.user.organizationId, branchId);
    if (!b) return res.status(400).json({ error: "فرع غير صالح" });
  }
  const hash = await bcrypt.hash(String(password), 10);
  const user = await prisma.user.create({
    data: {
      organizationId: req.user.organizationId,
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
  const target = await prisma.user.findFirst({
    where: { id: req.params.id, organizationId: req.user.organizationId },
  });
  if (!target) return res.status(404).json({ error: "غير موجود" });
  if (branchId) {
    const b = await findBranchInOrg(prisma, req.user.organizationId, branchId);
    if (!b) return res.status(400).json({ error: "فرع غير صالح" });
  }
  const data = {};
  if (name != null) data.name = String(name).trim();
  if (nameEn !== undefined) data.nameEn = nameEn?.trim() || null;
  if (role && ["ADMIN", "MANAGER", "CASHIER"].includes(String(role))) {
    data.role = String(role);
  }
  if (branchId !== undefined) data.branchId = branchId || null;
  if (password) data.passwordHash = await bcrypt.hash(String(password), 10);

  const user = await prisma.user.update({
    where: { id: target.id },
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
  const target = await prisma.user.findFirst({
    where: { id: req.params.id, organizationId: req.user.organizationId },
  });
  if (!target) return res.status(404).json({ error: "غير موجود" });
  await prisma.user.delete({ where: { id: target.id } });
  res.status(204).send();
});

export default router;
