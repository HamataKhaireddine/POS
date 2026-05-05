import React, { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { useTheme } from "../context/ThemeContext.jsx";
import { useI18n } from "../context/LanguageContext.jsx";

export default function Login() {
  const { login, user, loading } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { t, locale, setLocale } = useI18n();
  const nav = useNavigate();
  const [email, setEmail] = useState("admin@petstore.local");
  const [password, setPassword] = useState("admin123");
  const [organizationSlug, setOrganizationSlug] = useState("");
  const [err, setErr] = useState("");
  /** بصمة آمنة من السيرفر عند فشل اتصال قاعدة البيانات (503) */
  const [dbUrlInfo, setDbUrlInfo] = useState(null);

  if (loading) {
    return (
      <div style={{ padding: 24, textAlign: "center" }}>
        {t("common.loading")}
      </div>
    );
  }
  if (user) {
    return (
      <Navigate to={user.isPlatformAdmin ? "/platform/organizations" : "/pos"} replace />
    );
  }

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    setDbUrlInfo(null);
    try {
      const loggedIn = await login(
        email,
        password,
        organizationSlug.trim() ? organizationSlug.trim() : undefined
      );
      nav(loggedIn?.isPlatformAdmin ? "/platform/organizations" : "/pos", { replace: true });
    } catch (x) {
      setErr(x.message || t("login.failed"));
      const info = x?.data?.urlInfo;
      setDbUrlInfo(info && typeof info === "object" ? info : null);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 16,
        background: "var(--login-gradient)",
        position: "relative",
      }}
    >
      <div style={{ position: "absolute", top: 16, insetInlineEnd: 16, display: "flex", gap: 8 }}>
        <button
          type="button"
          className="btn-touch"
          onClick={() => setLocale(locale === "ar" ? "en" : "ar")}
          style={{
            background: "var(--surface)",
            color: "var(--text)",
            border: "1px solid var(--border)",
            minHeight: 44,
          }}
        >
          {locale === "ar" ? t("lang.en") : t("lang.ar")}
        </button>
        <button
          type="button"
          className="btn-touch"
          onClick={toggleTheme}
          style={{
            background: "var(--surface)",
            color: "var(--text)",
            border: "1px solid var(--border)",
            minHeight: 44,
          }}
        >
          {theme === "dark" ? t("theme.lightShort") : t("theme.darkShort")}
        </button>
      </div>
      <form className="card" onSubmit={submit} style={{ width: "100%", maxWidth: 400 }}>
        <h1 style={{ marginTop: 0 }}>{t("login.title")}</h1>
        <label style={{ display: "block", marginBottom: 12 }}>
          <span style={{ display: "block", marginBottom: 6, color: "var(--muted)" }}>{t("login.email")}</span>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            required
            autoComplete="username"
            style={{
              width: "100%",
              padding: 12,
              borderRadius: 0,
              border: "1px solid var(--border)",
              background: "var(--bg)",
              color: "var(--text)",
            }}
          />
        </label>
        <label style={{ display: "block", marginBottom: 12 }}>
          <span style={{ display: "block", marginBottom: 6, color: "var(--muted)" }}>{t("login.orgSlug")}</span>
          <input
            value={organizationSlug}
            onChange={(e) => setOrganizationSlug(e.target.value)}
            type="text"
            autoComplete="organization"
            placeholder="default"
            style={{
              width: "100%",
              padding: 12,
              borderRadius: 0,
              border: "1px solid var(--border)",
              background: "var(--bg)",
              color: "var(--text)",
            }}
          />
        </label>
        <label style={{ display: "block", marginBottom: 16 }}>
          <span style={{ display: "block", marginBottom: 6, color: "var(--muted)" }}>{t("login.password")}</span>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            required
            autoComplete="current-password"
            style={{
              width: "100%",
              padding: 12,
              borderRadius: 0,
              border: "1px solid var(--border)",
              background: "var(--bg)",
              color: "var(--text)",
            }}
          />
        </label>
        {err ? (
          <div style={{ color: "var(--danger)", marginBottom: 12, fontSize: 14 }}>{err}</div>
        ) : null}
        {dbUrlInfo ? (
          <div
            style={{
              marginBottom: 12,
              padding: 12,
              fontSize: 13,
              lineHeight: 1.45,
              color: "var(--muted)",
              background: "var(--surface2)",
              border: "1px solid var(--border)",
            }}
          >
            <strong style={{ color: "var(--text)", display: "block", marginBottom: 6 }}>
              {t("login.dbDiagnostics")}
            </strong>
            {dbUrlInfo.hint ? <div style={{ marginBottom: 8 }}>{dbUrlInfo.hint}</div> : null}
            {dbUrlInfo.databaseUrlSet && dbUrlInfo.host ? (
              <div style={{ fontSize: 12, fontFamily: "ui-monospace, monospace" }}>
                {t("login.dbHost")}: {String(dbUrlInfo.host)} — {t("login.dbPort")}: {String(dbUrlInfo.port ?? "—")}
              </div>
            ) : null}
          </div>
        ) : null}
        <button
          type="submit"
          className="btn-touch"
          style={{ width: "100%", background: "var(--accent)", color: "#fff", marginBottom: 12 }}
        >
          {t("login.submit")}
        </button>
        <div style={{ textAlign: "center", fontSize: 14 }}>
          <Link to="/register" style={{ color: "var(--accent)" }}>
            {t("login.createAccount")}
          </Link>
        </div>
      </form>
    </div>
  );
}
