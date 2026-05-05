import express from "express";
import "express-async-errors";
import cors from "cors";
import {
  apiRateLimiter,
  helmetMiddleware,
  loginRateLimiter,
} from "./middleware/security.js";
import authRoutes from "./routes/auth.js";
import branchRoutes from "./routes/branches.js";
import productRoutes from "./routes/products.js";
import inventoryRoutes from "./routes/inventory.js";
import saleRoutes from "./routes/sales.js";
import dashboardRoutes from "./routes/dashboard.js";
import userRoutes from "./routes/users.js";
import syncRoutes from "./routes/sync.js";
import customerRoutes from "./routes/customers.js";
import refundRoutes from "./routes/refunds.js";
import supplierRoutes from "./routes/suppliers.js";
import purchaseRoutes from "./routes/purchases.js";
import cashSessionRoutes from "./routes/cashSessions.js";
import auditRoutes from "./routes/audit.js";
import heldCartRoutes from "./routes/heldCarts.js";
import platformRoutes from "./routes/platform.js";
import notificationRoutes from "./routes/notifications.js";
import loyaltySettingsRoutes from "./routes/loyaltySettings.js";
import couponsRoutes from "./routes/coupons.js";
import employeesRoutes from "./routes/employees.js";
import payrollRoutes from "./routes/payroll.js";
import employeeLoansRoutes from "./routes/employeeLoans.js";
import customerAccountsRoutes from "./routes/customerAccounts.js";
import zakatRoutes from "./routes/zakat.js";
import expensesRoutes from "./routes/expenses.js";
import reportsRoutes from "./routes/reports.js";
import appointmentsRoutes from "./routes/appointments.js";
import accountingRoutes from "./routes/accounting.js";
import automationsRoutes from "./routes/automations.js";
import commissionsRoutes from "./routes/commissions.js";
import deliveryRoutes from "./routes/delivery.js";
import { prisma } from "./lib/prisma.js";
import {
  dbUnavailableMessage,
  isDbUnavailableError,
  isSchemaDriftError,
  schemaDriftMessage,
} from "./lib/dbErrors.js";
import { databaseUrlFingerprint } from "./lib/databaseUrlFingerprint.js";

const app = express();
app.set("trust proxy", 1);
app.use(helmetMiddleware);
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "2mb" }));
app.use("/api/auth/login", loginRateLimiter);
app.use("/api/auth/register-organization", loginRateLimiter);
app.use("/api", apiRateLimiter);

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "petstore-pos-api" });
});

/** فحص اتصال قاعدة البيانات + بصمة آمنة لـ DATABASE_URL (بدون أسرار) */
app.get("/api/health/db", async (_req, res) => {
  const urlInfo = databaseUrlFingerprint();
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true, db: true, urlInfo });
  } catch (e) {
    console.error("[health/db]", e);
    const body = {
      ok: false,
      db: false,
      error: "تعذر الاتصال بقاعدة البيانات",
      urlInfo,
      prismaCode: e?.code ?? undefined,
    };
    if (e?.message && typeof e.message === "string") {
      const safe = e.message.replace(/postgresql:\/\/[^@\s]+@/gi, "postgresql://***@");
      body.prismaMessage = safe.slice(0, 280);
    }
    res.status(503).json(body);
  }
});

app.use("/api/auth", authRoutes);
app.use("/api/branches", branchRoutes);
app.use("/api/products", productRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/sales", saleRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/users", userRoutes);
app.use("/api/sync", syncRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/customer-accounts", customerAccountsRoutes);
app.use("/api/zakat", zakatRoutes);
app.use("/api/expenses", expensesRoutes);
app.use("/api/reports", reportsRoutes);
app.use("/api/appointments", appointmentsRoutes);
app.use("/api/accounting", accountingRoutes);
app.use("/api/automations", automationsRoutes);
app.use("/api/commissions", commissionsRoutes);
app.use("/api/delivery", deliveryRoutes);
app.use("/api/refunds", refundRoutes);
app.use("/api/suppliers", supplierRoutes);
app.use("/api/purchases", purchaseRoutes);
app.use("/api/cash-sessions", cashSessionRoutes);
app.use("/api/audit-logs", auditRoutes);
app.use("/api/held-carts", heldCartRoutes);
app.use("/api/platform", platformRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/loyalty-settings", loyaltySettingsRoutes);
app.use("/api/coupons", couponsRoutes);
app.use("/api/employees", employeesRoutes);
app.use("/api/payroll", payrollRoutes);
app.use("/api/employee-loans", employeeLoansRoutes);

app.use((err, _req, res, _next) => {
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    return res.status(400).json({
      error: "تعذر قراءة الطلب (JSON غير صالح أو تالف)",
    });
  }
  if (isDbUnavailableError(err)) {
    console.error("[db]", err.message);
    return res.status(503).json({ error: dbUnavailableMessage });
  }
  if (isSchemaDriftError(err)) {
    console.error("[schema]", err.code, err.meta ?? "");
    return res.status(503).json({
      error: schemaDriftMessage,
      prismaCode: err.code,
    });
  }
  console.error(err);
  res.status(500).json({ error: "خطأ في الخادم" });
});

export default app;
