import { Router } from "express";
import { authMiddleware, requireRole } from "../middleware/auth.js";
import {
  getSyncConfig,
  saveSyncConfig,
  syncProductsFromWebsite,
  syncOrdersWithWebsite,
} from "../services/syncService.js";
import { syncFromSupabase } from "../services/supabaseSyncService.js";
import { syncProductsFromEzoo } from "../services/ezooSyncService.js";

const router = Router();
router.use(authMiddleware);
router.use(requireRole("ADMIN", "MANAGER"));

router.get("/settings", async (_req, res) => {
  const cfg = await getSyncConfig();
  res.json({
    websiteBaseUrl: cfg.websiteBaseUrl,
    apiKeySet: Boolean(cfg.apiKey),
    lastProductSyncAt: cfg.lastProductSyncAt,
    lastOrderSyncAt: cfg.lastOrderSyncAt,
    lastSupabaseSyncAt: cfg.lastSupabaseSyncAt,
  });
});

router.put("/settings", async (req, res) => {
  const { websiteBaseUrl, apiKey } = req.body || {};
  const cfg = await saveSyncConfig({ websiteBaseUrl, apiKey });
  res.json({
    websiteBaseUrl: cfg.websiteBaseUrl,
    apiKeySet: Boolean(cfg.apiKey),
    lastProductSyncAt: cfg.lastProductSyncAt,
    lastOrderSyncAt: cfg.lastOrderSyncAt,
    lastSupabaseSyncAt: cfg.lastSupabaseSyncAt,
  });
});

router.post("/supabase", async (_req, res) => {
  try {
    const result = await syncFromSupabase();
    res.json(result);
  } catch (e) {
    res.status(400).json({
      error: e instanceof Error ? e.message : "فشل مزامنة Supabase",
    });
  }
});

router.post("/products", async (_req, res) => {
  try {
    const result = await syncProductsFromWebsite();
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "فشل المزامنة" });
  }
});

/** منتجات من API تطبيق ezoo (ميني زو) — GET get-products?nationality_id= */
router.post("/ezoo-products", async (_req, res) => {
  try {
    const result = await syncProductsFromEzoo();
    res.json(result);
  } catch (e) {
    res.status(400).json({
      error: e instanceof Error ? e.message : "فشل مزامنة Ezoo",
    });
  }
});

router.post("/orders", async (_req, res) => {
  try {
    const result = await syncOrdersWithWebsite();
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "فشل المزامنة" });
  }
});

export default router;
