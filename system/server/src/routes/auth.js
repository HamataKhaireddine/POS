import { Router } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";
import { signToken, authMiddleware } from "../middleware/auth.js";

const router = Router();

router.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: "البريد وكلمة المرور مطلوبان" });
    }
    const user = await prisma.user.findUnique({
      where: { email: String(email).toLowerCase().trim() },
      include: { branch: true },
    });
    let passwordOk = false;
    try {
      passwordOk = await bcrypt.compare(password, user.passwordHash);
    } catch {
      passwordOk = false;
    }
    if (!user || !passwordOk) {
      return res.status(401).json({ error: "بيانات الدخول غير صحيحة" });
    }
    const token = signToken({
      sub: user.id,
      role: user.role,
      branchId: user.branchId,
    });
    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        nameEn: user.nameEn ?? null,
        role: user.role,
        branchId: user.branchId,
        branchName: user.branch?.name ?? null,
        branchNameEn: user.branch?.nameEn ?? null,
      },
    });
  } catch (e) {
    next(e);
  }
});

router.get("/me", authMiddleware, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.sub },
      include: { branch: true },
    });
    if (!user) return res.status(404).json({ error: "المستخدم غير موجود" });
    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      nameEn: user.nameEn ?? null,
      role: user.role,
      branchId: user.branchId,
      branchName: user.branch?.name ?? null,
      branchNameEn: user.branch?.nameEn ?? null,
    });
  } catch (e) {
    next(e);
  }
});

export default router;
