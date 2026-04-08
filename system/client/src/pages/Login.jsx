import React, { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
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
  const [err, setErr] = useState("");

  if (loading) {
    return (
      <div style={{ padding: 24, textAlign: "center" }}>
        {t("common.loading")}
      </div>
    );
  }
  if (user) {
    return <Navigate to="/pos" replace />;
  }

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    try {
      await login(email, password);
      nav("/pos", { replace: true });
    } catch (x) {
      setErr(x.message || t("login.failed"));
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
              borderRadius: 10,
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
              borderRadius: 10,
              border: "1px solid var(--border)",
              background: "var(--bg)",
              color: "var(--text)",
            }}
          />
        </label>
        {err ? (
          <div style={{ color: "var(--danger)", marginBottom: 12, fontSize: 14 }}>{err}</div>
        ) : null}
        <button
          type="submit"
          className="btn-touch"
          style={{ width: "100%", background: "var(--accent)", color: "#fff" }}
        >
          {t("login.submit")}
        </button>
      </form>
    </div>
  );
}
