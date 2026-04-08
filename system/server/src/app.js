import express from "express";
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

const app = express();
app.set("trust proxy", 1);
app.use(helmetMiddleware);
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "2mb" }));
app.use("/api/auth/login", loginRateLimiter);
app.use("/api", apiRateLimiter);

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "petstore-pos-api" });
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
app.use("/api/refunds", refundRoutes);
app.use("/api/suppliers", supplierRoutes);
app.use("/api/purchases", purchaseRoutes);
app.use("/api/cash-sessions", cashSessionRoutes);
app.use("/api/audit-logs", auditRoutes);
app.use("/api/held-carts", heldCartRoutes);

app.use((err, _req, res, _next) => {
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    return res.status(400).json({
      error: "تعذر قراءة الطلب (JSON غير صالح أو تالف)",
    });
  }
  console.error(err);
  res.status(500).json({ error: "خطأ في الخادم" });
});

export default app;
