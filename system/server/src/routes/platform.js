import { Router } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";
import { findBranchInOrg } from "../lib/orgScope.js";
import {
  dbUnavailableMessage,
  isDbUnavailableError,
} from "../lib/dbErrors.js";
import { authMiddleware } from "../middleware/auth.js";
import { requirePlatformAdmin } from "../middleware/platformAdmin.js";
import { SLUG_RE, bootstrapOrganization } from "../lib/organizationBootstrap.js";
import { normalizeBusinessVertical } from "../lib/businessVertical.js";

const router = Router();

router.use(authMiddleware);
router.use((req, res, next) => {
  requirePlatformAdmin(req, res, next).catch(next);
});

router.get("/organizations", async (_req, res, next) => {
  try {
    const rows = await prisma.organization.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        slug: true,
        businessVertical: true,
        createdAt: true,
        _count: { select: { users: true, branches: true } },
      },
    });
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

router.post("/organizations", async (req, res, next) => {
  try {
    const {
      organizationName,
      organizationSlug,
      branchName,
      adminEmail,
      adminPassword,
      adminName,
      businessVertical: bvRaw,
    } = req.body || {};
    const name =
      organizationName != null ? String(organizationName).trim() : "";
    const slugRaw =
      organizationSlug != null ? String(organizationSlug).trim().toLowerCase() : "";
    if (!name) return res.status(400).json({ error: "اسم الشركة مطلوب" });
    if (!slugRaw) return res.status(400).json({ error: "رمز المؤسسة (slug) مطلوب" });
    if (!SLUG_RE.test(slugRaw)) {
      return res.status(400).json({
        error: "الرمز يجب أن يكون أحرفاً صغيرة وأرقاماً وشرطات فقط",
      });
    }
    if (!adminEmail?.trim() || !adminPassword || !adminName?.trim()) {
      return res.status(400).json({ error: "البريد واسم المدير وكلمة المرور مطلوبة" });
    }
    if (String(adminPassword).length < 6) {
      return res.status(400).json({ error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" });
    }

    const existingSlug = await prisma.organization.findUnique({
      where: { slug: slugRaw },
    });
    if (existingSlug) {
      return res.status(409).json({ error: "هذا الرمز مستخدم لمؤسسة أخرى" });
    }

    const bvNorm = normalizeBusinessVertical(bvRaw, { required: false });
    if (bvRaw != null && String(bvRaw).trim() !== "" && bvNorm === undefined) {
      return res.status(400).json({ error: "مجال النشاط غير صالح" });
    }

    const { org, branch, user } = await bootstrapOrganization(prisma, {
      organizationName: name,
      organizationSlug: slugRaw,
      branchName,
      adminEmail,
      adminPassword,
      adminName,
      ...(bvNorm ? { businessVertical: bvNorm } : {}),
    });

    res.status(201).json({
      organization: {
        id: org.id,
        name: org.name,
        slug: org.slug,
        businessVertical: org.businessVertical ?? null,
        createdAt: org.createdAt,
      },
      branch: { id: branch.id, name: branch.name },
      adminUser: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    });
  } catch (e) {
    if (e?.code === "P2002") {
      return res.status(409).json({ error: "تعارض: بريد أو رمز مكرر" });
    }
    if (isDbUnavailableError(e)) {
      console.error("[platform/organizations POST]", e.message);
      return res.status(503).json({ error: dbUnavailableMessage });
    }
    next(e);
  }
});

router.patch("/organizations/:id", async (req, res, next) => {
  try {
    const { name, slug } = req.body || {};
    const org = await prisma.organization.findUnique({
      where: { id: req.params.id },
    });
    if (!org) return res.status(404).json({ error: "المؤسسة غير موجودة" });

    const data = {};
    if (name != null) data.name = String(name).trim().slice(0, 200);
    if (slug != null) {
      const slugRaw = String(slug).trim().toLowerCase();
      if (!SLUG_RE.test(slugRaw)) {
        return res.status(400).json({ error: "رمز غير صالح" });
      }
      const clash = await prisma.organization.findFirst({
        where: { slug: slugRaw, NOT: { id: org.id } },
      });
      if (clash) return res.status(409).json({ error: "الرمز مستخدم" });
      data.slug = slugRaw;
    }
    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: "لا توجد حقول للتحديث" });
    }

    const updated = await prisma.organization.update({
      where: { id: org.id },
      data,
      select: {
        id: true,
        name: true,
        slug: true,
        createdAt: true,
        _count: { select: { users: true, branches: true } },
      },
    });
    res.json(updated);
  } catch (e) {
    if (e?.code === "P2002") {
      return res.status(409).json({ error: "تعارض في البيانات" });
    }
    next(e);
  }
});

router.get("/branches", async (req, res, next) => {
  try {
    const oid = req.query.organizationId;
    if (!oid || !String(oid).trim()) {
      return res.status(400).json({ error: "organizationId مطلوب" });
    }
    const org = await prisma.organization.findUnique({
      where: { id: String(oid).trim() },
    });
    if (!org) return res.status(404).json({ error: "مؤسسة غير موجودة" });
    const branches = await prisma.branch.findMany({
      where: { organizationId: org.id },
      orderBy: { name: "asc" },
      select: { id: true, name: true, nameEn: true },
    });
    res.json(branches);
  } catch (e) {
    next(e);
  }
});

router.get("/users", async (req, res, next) => {
  try {
    const orgFilter = req.query.organizationId;
    const where =
      orgFilter && String(orgFilter).trim()
        ? { organizationId: String(orgFilter).trim() }
        : {};

    const users = await prisma.user.findMany({
      where,
      orderBy: [{ organizationId: "asc" }, { createdAt: "desc" }],
      select: {
        id: true,
        email: true,
        name: true,
        nameEn: true,
        role: true,
        branchId: true,
        organizationId: true,
        createdAt: true,
        branch: { select: { name: true, nameEn: true } },
        organization: { select: { id: true, name: true, slug: true } },
      },
    });
    res.json(users);
  } catch (e) {
    next(e);
  }
});

router.post("/users", async (req, res, next) => {
  try {
    const { organizationId, email, password, name, nameEn, role, branchId } = req.body || {};
    if (!organizationId?.trim() || !email?.trim() || !password || !name?.trim()) {
      return res.status(400).json({ error: "المؤسسة والبريد والاسم وكلمة المرور مطلوبة" });
    }
    if (!["ADMIN", "MANAGER", "CASHIER"].includes(String(role))) {
      return res.status(400).json({ error: "دور غير صالح" });
    }

    const org = await prisma.organization.findUnique({
      where: { id: String(organizationId).trim() },
    });
    if (!org) return res.status(400).json({ error: "مؤسسة غير موجودة" });

    if (branchId) {
      const b = await findBranchInOrg(prisma, org.id, branchId);
      if (!b) return res.status(400).json({ error: "فرع غير صالح" });
    }

    const hash = await bcrypt.hash(String(password), 10);
    const user = await prisma.user.create({
      data: {
        organizationId: org.id,
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
        organizationId: true,
        branch: { select: { name: true, nameEn: true } },
        organization: { select: { id: true, name: true, slug: true } },
      },
    });
    res.status(201).json(user);
  } catch (e) {
    if (e?.code === "P2002") {
      return res.status(409).json({ error: "البريد مسجّل في هذه المؤسسة" });
    }
    next(e);
  }
});

router.patch("/users/:id", async (req, res, next) => {
  try {
    const { name, nameEn, role, branchId, password } = req.body || {};
    const target = await prisma.user.findUnique({
      where: { id: req.params.id },
    });
    if (!target) return res.status(404).json({ error: "غير موجود" });

    if (branchId) {
      const b = await findBranchInOrg(prisma, target.organizationId, branchId);
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

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: "لا توجد حقول للتحديث" });
    }

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
        organizationId: true,
        branch: { select: { name: true, nameEn: true } },
        organization: { select: { id: true, name: true, slug: true } },
      },
    });
    res.json(user);
  } catch (e) {
    next(e);
  }
});

router.delete("/users/:id", async (req, res, next) => {
  try {
    if (req.params.id === req.user.sub) {
      return res.status(400).json({ error: "لا يمكن حذف حسابك الحالي" });
    }
    const target = await prisma.user.findUnique({
      where: { id: req.params.id },
    });
    if (!target) return res.status(404).json({ error: "غير موجود" });
    await prisma.user.delete({ where: { id: target.id } });
    res.status(204).send();
  } catch (e) {
    next(e);
  }
});

export default router;
