import React, { useEffect, useState } from "react";
import { api } from "../api/client.js";
import {
  getStoredSyncApiKey,
  setStoredSyncApiKey,
  clearStoredSyncApiKey,
} from "../lib/syncApiKeySession.js";
import { useI18n } from "../context/LanguageContext.jsx";

export default function Sync() {
  const { t, locale } = useI18n();
  const [settings, setSettings] = useState(null);
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [inventoryWebhookUrl, setInventoryWebhookUrl] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [generatedKey, setGeneratedKey] = useState("");
  const [copyHint, setCopyHint] = useState("");

  const loc = locale === "en" ? "en-US" : "ar-SA";

  const applyCachedApiKeyToFields = () => {
    const cached = getStoredSyncApiKey();
    if (cached) {
      setApiKey(cached);
      setGeneratedKey(cached);
    } else {
      setApiKey("");
      setGeneratedKey("");
    }
  };

  const load = async () => {
    const s = await api("/api/sync/settings");
    setSettings(s);
    setBaseUrl(s.websiteBaseUrl || "");
    setInventoryWebhookUrl(s.inventoryWebhookUrl || "");
    applyCachedApiKeyToFields();
  };

  useEffect(() => {
    load().catch(() => {});
  }, []);

  const generateApiKey = async () => {
    if (!confirm(t("sync.generateApiKeyConfirm"))) return;
    setLoading(true);
    setMsg("");
    setCopyHint("");
    try {
      const r = await api("/api/sync/generate-api-key", { method: "POST" });
      const plain = r.apiKey || "";
      setStoredSyncApiKey(plain);
      setGeneratedKey(plain);
      setApiKey(plain);
      setSettings((prev) =>
        prev ? { ...prev, apiKeySet: true } : { apiKeySet: true }
      );
      setMsg("");
    } catch (x) {
      setMsg(x.message || t("sync.saveFailed"));
      setGeneratedKey("");
    } finally {
      setLoading(false);
    }
  };

  const copyGeneratedKey = async () => {
    const text = generatedKey || apiKey;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopyHint(t("sync.copied"));
      setTimeout(() => setCopyHint(""), 2000);
    } catch {
      setCopyHint("");
    }
  };

  const save = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMsg("");
    try {
      const body = {
        websiteBaseUrl: baseUrl,
        inventoryWebhookUrl: inventoryWebhookUrl.trim() || null,
      };
      if (apiKey.trim()) body.apiKey = apiKey.trim();
      const s = await api("/api/sync/settings", { method: "PUT", body });
      setSettings(s);
      if (body.apiKey) setStoredSyncApiKey(body.apiKey);
      applyCachedApiKeyToFields();
      setMsg(t("sync.saved"));
    } catch (x) {
      setMsg(x.message || t("sync.saveFailed"));
    } finally {
      setLoading(false);
    }
  };

  const syncProducts = async () => {
    setLoading(true);
    setMsg("");
    try {
      const r = await api("/api/sync/products", { method: "POST" });
      setMsg(t("sync.msgProducts", { n: r.upserted, at: r.at }));
      await load();
    } catch (x) {
      setMsg(x.message || t("sync.syncFailed"));
    } finally {
      setLoading(false);
    }
  };

  const syncOrders = async () => {
    setLoading(true);
    setMsg("");
    try {
      const r = await api("/api/sync/orders", { method: "POST" });
      setMsg(`${r.message} — ${r.at}`);
      await load();
    } catch (x) {
      setMsg(x.message || t("sync.syncFailed"));
    } finally {
      setLoading(false);
    }
  };

  const fmt = (d) => (d ? new Date(d).toLocaleString(loc) : t("sync.never"));

  const syncEzoo = async () => {
    setLoading(true);
    setMsg("");
    try {
      const r = await api("/api/sync/ezoo-products", { method: "POST" });
      setMsg(
        t("sync.msgEzoo", {
          n: r.upserted,
          t: r.totalRemote ?? r.upserted,
          at: new Date(r.at).toLocaleString(loc),
        })
      );
      await load();
    } catch (x) {
      setMsg(x.message || t("sync.syncFailed"));
    } finally {
      setLoading(false);
    }
  };

  const syncSupabase = async () => {
    setLoading(true);
    setMsg("");
    try {
      const r = await api("/api/sync/supabase", { method: "POST" });
      setMsg(
        t("sync.msgSupabase", {
          b: r.brands,
          c: r.categories,
          p: r.products,
          i: r.inventory,
          s: r.inventorySkipped ?? 0,
          at: new Date(r.at).toLocaleString(loc),
        })
      );
      await load();
    } catch (x) {
      setMsg(x.message || t("sync.syncFailed"));
    } finally {
      setLoading(false);
    }
  };

  const msgIsError = (m) =>
    m &&
    (m.includes("فشل") ||
      m.toLowerCase().includes("fail") ||
      m.toLowerCase().includes("error"));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 720 }}>
      <h1 style={{ margin: 0 }}>{t("sync.title")}</h1>
      <p style={{ color: "var(--muted)", margin: 0 }}>
        {t("sync.intro")}{" "}
        <code style={{ color: "var(--accent)" }}>/api/products</code> {locale === "ar" ? "و" : "&"}{" "}
        <code style={{ color: "var(--accent)" }}>/api/orders/pending</code> {t("sync.introEnd")}
      </p>

      <form className="card" onSubmit={save}>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
          <span>{t("sync.baseUrl")}</span>
          <input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://example.com"
            style={inp}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
          <span>{t("sync.apiKey")}</span>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>{t("sync.apiKeySessionHint")}</span>
          <input
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            type="password"
            placeholder={settings?.apiKeySet && !apiKey ? "••••••••" : ""}
            autoComplete="off"
            style={inp}
          />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginTop: 8 }}>
            <button
              type="button"
              disabled={loading}
              className="btn-touch"
              onClick={generateApiKey}
              style={{ background: "var(--surface2)", color: "var(--text)" }}
            >
              {t("sync.generateApiKey")}
            </button>
          </div>
          {apiKey || generatedKey ? (
            <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
              <span style={{ fontSize: 12, color: "var(--muted)" }}>{t("sync.generateApiKeyDone")}</span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "stretch" }}>
                <input readOnly value={generatedKey || apiKey} style={{ ...inp, flex: "1 1 240px", fontFamily: "monospace", fontSize: 13 }} />
                <button
                  type="button"
                  className="btn-touch"
                  onClick={copyGeneratedKey}
                  style={{ background: "var(--accent)", color: "#fff" }}
                >
                  {copyHint || t("sync.copyApiKey")}
                </button>
              </div>
            </div>
          ) : null}
          {apiKey || generatedKey ? (
            <button
              type="button"
              className="btn-touch"
              onClick={() => {
                clearStoredSyncApiKey();
                setApiKey("");
                setGeneratedKey("");
              }}
              style={{ marginTop: 8, background: "transparent", color: "var(--muted)", fontSize: 13 }}
            >
              {t("sync.clearApiKeySession")}
            </button>
          ) : null}
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
          <span>{t("sync.inventoryWebhookUrl")}</span>
          <input
            value={inventoryWebhookUrl}
            onChange={(e) => setInventoryWebhookUrl(e.target.value)}
            placeholder="https://your-site.com/api/pos/inventory-webhook"
            style={inp}
          />
          <span style={{ fontSize: 12, color: "var(--muted)" }}>{t("sync.inventoryWebhookHint")}</span>
        </label>
        {settings ? (
          <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 12 }}>
            <div>
              {t("sync.lastProducts")} {fmt(settings.lastProductSyncAt)}
            </div>
            <div>
              {t("sync.lastOrders")} {fmt(settings.lastOrderSyncAt)}
            </div>
            <div>
              {t("sync.lastSupabase")} {fmt(settings.lastSupabaseSyncAt)}
            </div>
          </div>
        ) : null}
        {msg ? (
          <div style={{ marginBottom: 12, color: msgIsError(msg) ? "var(--danger)" : "var(--success)" }}>{msg}</div>
        ) : null}
        <button type="submit" disabled={loading} className="btn-touch" style={{ background: "var(--accent)", color: "#fff" }}>
          {t("sync.saveSettings")}
        </button>
      </form>

      <div className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <strong>{t("sync.ezooTitle")}</strong>
        <p style={{ margin: 0, fontSize: 14, color: "var(--muted)" }}>{t("sync.ezooIntro")}</p>
        <button
          type="button"
          disabled={loading}
          className="btn-touch"
          style={{ background: "var(--accent2)", color: "#fff", maxWidth: 320 }}
          onClick={syncEzoo}
        >
          {t("sync.btnEzoo")}
        </button>
      </div>

      <div className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <strong>{t("sync.supabaseTitle")}</strong>
        <p style={{ margin: 0, fontSize: 14, color: "var(--muted)" }}>{t("sync.supabaseIntro")}</p>
        <button
          type="button"
          disabled={loading}
          className="btn-touch"
          style={{ background: "var(--accent)", color: "#fff", maxWidth: 320 }}
          onClick={syncSupabase}
        >
          {t("sync.btnSupabase")}
        </button>
      </div>

      <div className="card" style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        <button type="button" disabled={loading} className="btn-touch" style={{ background: "var(--surface2)" }} onClick={syncProducts}>
          {t("sync.btnProducts")}
        </button>
        <button type="button" disabled={loading} className="btn-touch" style={{ background: "var(--surface2)" }} onClick={syncOrders}>
          {t("sync.btnOrders")}
        </button>
      </div>
    </div>
  );
}

const inp = {
  padding: 12,
  borderRadius: 0,
  border: "1px solid var(--border)",
  background: "var(--bg)",
  color: "var(--text)",
};
