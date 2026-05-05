import { Router } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";
import {
  dbUnavailableMessage,
  isDbUnavailableError,
} from "../lib/dbErrors.js";
import { databaseUrlFingerprint } from "../lib/databaseUrlFingerprint.js";
import { signToken, authMiddleware } from "../middleware/auth.js";
import { SLUG_RE, bootstrapOrganization } from "../lib/organizationBootstrap.js";
import { isPlatformAdminEmail } from "../lib/platformAdmin.js";

const router = Router();

/**
 * إنشاء شركة (مؤسسة) جديدة + فرع رئيسي + مدير ADMIN.
 * يتطلب ORG_REGISTRATION_SECRET في الخادم ونفس القيمة في الحقل registrationSecret.
 */
router.post("/register-organization", async (req, res, next) => {
  try {
    const serverSecret = process.env.ORG_REGISTRATION_SECRET;
    if (!serverSecret || String(serverSecret).length < 8) {
      return res.status(403).json({
        error:
          "تسجيل مؤسسات جديد معطّل. اضبط ORG_REGISTRATION_SECRET في ملف .env للخادم (8 أحرف على الأقل).",
      });
    }
    const {
      registrationSecret,
      organizationName,
      organizationSlug,
      branchName,
      adminEmail,
      adminPassword,
      adminName,
    } = req.body || {};
    if (registrationSecret !== serverSecret) {
      return res.status(401).json({ error: "رمز التسجيل غير صحيح" });
    }
    const name = organizationName != null ? String(organizationName).trim() : "";
    const slugRaw =
      organizationSlug != null ? String(organizationSlug).trim().toLowerCase() : "";
    if (!name) return res.status(400).json({ error: "اسم الشركة مطلوب" });
    if (!slugRaw) return res.status(400).json({ error: "رمز المؤسسة (slug) مطلوب" });
    if (!SLUG_RE.test(slugRaw)) {
      return res.status(400).json({
        error: "الرمز يجب أن يكون أحرفاً صغيرة وأرقاماً وشرطات فقط (مثل ezoo أو my-store)",
      });
    }
    if (!adminEmail?.trim() || !adminPassword || !adminName?.trim()) {
      return res.status(400).json({ error: "البريد واسم المدير وكلمة المرور مطلوبة" });
    }
    if (String(adminPassword).length < 6) {
      return res.status(400).json({ error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" });
    }
    const emailNorm = String(adminEmail).toLowerCase().trim();

    const existingSlug = await prisma.organization.findUnique({
      where: { slug: slugRaw },
    });
    if (existingSlug) {
      return res.status(409).json({ error: "هذا الرمز مستخدم لمؤسسة أخرى. اختر اسماً مختلفاً." });
    }

    const result = await bootstrapOrganization(prisma, {
      organizationName: name,
      organizationSlug: slugRaw,
      branchName,
      adminEmail: emailNorm,
      adminPassword,
      adminName,
    });

    const token = signToken({
      sub: result.user.id,
      role: result.user.role,
      branchId: result.user.branchId,
      organizationId: result.user.organizationId,
    });

    res.status(201).json({
      token,
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
        nameEn: result.user.nameEn ?? null,
        role: result.user.role,
        branchId: result.user.branchId,
        branchName: result.branch.name,
        branchNameEn: result.branch.nameEn ?? null,
        organizationId: result.org.id,
        organizationName: result.org.name,
        organizationSlug: result.org.slug,
        isPlatformAdmin:
          result.user.role === "ADMIN" &&
          isPlatformAdminEmail(result.user.email),
      },
    });
  } catch (e) {
    if (e?.code === "P2002") {
      return res.status(409).json({
        error: "تعارض: البريد قد يكون مسجلاً في هذه المؤسسة أو الرمز مكرر.",
      });
    }
    if (isDbUnavailableError(e)) {
      console.error("[auth/register-organization] database:", e.message);
      return res.status(503).json({ error: dbUnavailableMessage, urlInfo: databaseUrlFingerprint() });
    }
    next(e);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const { email, password, organizationSlug } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: "البريد وكلمة المرور مطلوبان" });
    }
    const emailNorm = String(email).toLowerCase().trim();
    const slug =
      organizationSlug != null && String(organizationSlug).trim()
        ? String(organizationSlug).trim()
        : null;

    let user;
    if (slug) {
      user = await prisma.user.findFirst({
        where: {
          email: emailNorm,
          organization: { slug },
        },
        include: { branch: true, organization: true },
      });
    } else {
      const matches = await prisma.user.findMany({
        where: { email: emailNorm },
        include: { branch: true, organization: true },
      });
      if (matches.length === 0) user = null;
      else if (matches.length === 1) user = matches[0];
      else {
        return res.status(400).json({
          error:
            "نفس البريد مسجل في أكثر من مؤسسة — أرسل organizationSlug (الرمز) مع الطلب",
        });
      }
    }
    let passwordOk = false;
    if (user) {
      try {
        passwordOk = await bcrypt.compare(password, user.passwordHash);
      } catch {
        passwordOk = false;
      }
    }
    if (!user || !passwordOk) {
      return res.status(401).json({ error: "بيانات الدخول غير صحيحة" });
    }
    const token = signToken({
      sub: user.id,
      role: user.role,
      branchId: user.branchId,
      organizationId: user.organizationId,
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
        organizationId: user.organizationId,
        organizationName: user.organization?.name ?? null,
        organizationSlug: user.organization?.slug ?? null,
        isPlatformAdmin:
          user.role === "ADMIN" && isPlatformAdminEmail(user.email),
      },
    });
  } catch (e) {
    if (isDbUnavailableError(e)) {
      console.error("[auth/login] database:", e.message);
      return res.status(503).json({ error: dbUnavailableMessage, urlInfo: databaseUrlFingerprint() });
    }
    next(e);
  }
});

router.get("/me", authMiddleware, async (req, res, next) => {
  try {
    const user = await prisma.user.findFirst({
      where: { id: req.user.sub, organizationId: req.user.organizationId },
      include: { branch: true, organization: true },
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
      organizationId: user.organizationId,
      organizationName: user.organization?.name ?? null,
      organizationSlug: user.organization?.slug ?? null,
      isPlatformAdmin:
        user.role === "ADMIN" && isPlatformAdminEmail(user.email),
    });
  } catch (e) {
    next(e);
  }
});

export default router;
