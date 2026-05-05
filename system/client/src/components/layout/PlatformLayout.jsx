import React from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import { useTheme } from "../../context/ThemeContext.jsx";
import { useI18n } from "../../context/LanguageContext.jsx";

const link = ({ isActive }) => ({
  display: "block",
  padding: "10px 14px",
  borderRadius: 0,
  textDecoration: "none",
  color: isActive ? "#fff" : "var(--muted)",
  background: isActive ? "var(--accent)" : "transparent",
  fontWeight: 700,
});

export function PlatformLayout() {
  const { logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { t, locale, setLocale } = useI18n();
  const nav = useNavigate();

  return (
    <div className="app-layout-shell">
      <aside className="app-sidebar" aria-label={t("platform.title")}>
        <div className="app-sidebar-header">
          <div className="app-sidebar-brand">{t("platform.title")}</div>
        </div>
        <nav className="app-sidebar-nav">
          <NavLink to="/platform/organizations" style={link}>
            {t("platform.orgs")}
          </NavLink>
          <NavLink to="/platform/users" style={link}>
            {t("platform.users")}
          </NavLink>
          <NavLink to="/pos" style={link}>
            {t("platform.backApp")}
          </NavLink>
        </nav>
      </aside>
      <div className="app-main-wrap">
        <header className="app-topbar">
          <div style={{ fontSize: 13, color: "var(--muted)", flex: "1 1 auto" }}>
            {t("nav.platform")}
          </div>
          <button
            type="button"
            className="btn-touch"
            onClick={() => setLocale(locale === "ar" ? "en" : "ar")}
            title={t("lang.switch")}
            aria-label={t("lang.switch")}
            style={{ background: "var(--surface2)", color: "var(--text)", minWidth: 44 }}
          >
            {locale === "ar" ? t("lang.en") : t("lang.ar")}
          </button>
          <button
            type="button"
            className="btn-touch"
            onClick={toggleTheme}
            title={theme === "dark" ? t("theme.lightTitle") : t("theme.darkTitle")}
            aria-label={theme === "dark" ? t("theme.lightTitle") : t("theme.darkTitle")}
            style={{ background: "var(--surface2)", color: "var(--text)", minWidth: 44 }}
          >
            {theme === "dark" ? t("theme.lightShort") : t("theme.darkShort")}
          </button>
          <button
            type="button"
            className="btn-touch"
            onClick={() => {
              logout();
              nav("/login");
            }}
            style={{ background: "var(--surface2)", color: "var(--text)" }}
          >
            {t("nav.logout")}
          </button>
        </header>
        <main className="app-main-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
