import React, { useEffect, useState } from "react";
import { api } from "../api/client.js";
import { useI18n } from "../context/LanguageContext.jsx";

export default function Sync() {
  const { t, locale } = useI18n();
  const [settings, setSettings] = useState(null);
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const loc = locale === "en" ? "en-US" : "ar-SA";

  const load = async () => {
    const s = await api("/api/sync/settings");
    setSettings(s);
    setBaseUrl(s.websiteBaseUrl || "");
    setApiKey("");
  };

  useEffect(() => {
    load().catch(() => {});
  }, []);

  const save = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMsg("");
    try {
      const body = { websiteBaseUrl: baseUrl };
      if (apiKey.trim()) body.apiKey = apiKey.trim();
      const s = await api("/api/sync/settings", { method: "PUT", body });
      setSettings(s);
      setApiKey("");
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
          <input
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            type="password"
            placeholder={settings?.apiKeySet ? "••••••••" : ""}
            style={inp}
          />
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
  borderRadius: 10,
  border: "1px solid var(--border)",
  background: "var(--bg)",
  color: "var(--text)",
};
