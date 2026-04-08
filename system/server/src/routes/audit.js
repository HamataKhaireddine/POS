import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, requireRole } from "../middleware/auth.js";

const router = Router();
router.use(authMiddleware);
router.use(requireRole("ADMIN", "MANAGER"));

router.get("/", async (req, res) => {
  const { branchId, limit = "100", action } = req.query;
  const where = {};
  if (req.user.role !== "ADMIN") {
    if (!req.user.branchId) return res.json([]);
    where.branchId = req.user.branchId;
  } else if (branchId) {
    where.branchId = String(branchId);
  }
  if (action) where.action = String(action);
  const rows = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: Math.min(500, Math.max(1, parseInt(String(limit), 10) || 100)),
    include: {
      user: { select: { id: true, name: true, email: true } },
      branch: { select: { id: true, name: true } },
    },
  });
  res.json(rows);
});

export default router;
