import React, { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import { useTheme } from "../../context/ThemeContext.jsx";
import { useI18n } from "../../context/LanguageContext.jsx";
import { formatUserBranchLine } from "../../utils/displayLabels.js";

const STORAGE_KEY = "sidebarOpen";

const sidebarLink = ({ isActive }) => ({
  display: "block",
  padding: "10px 14px",
  borderRadius: 10,
  textDecoration: "none",
  color: isActive ? "#fff" : "var(--muted)",
  background: isActive ? "var(--accent)" : "transparent",
  fontWeight: 700,
  width: "100%",
  boxSizing: "border-box",
});

export function AppLayout() {
  const { user, logout, isAdmin, isManager } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { t, locale, setLocale } = useI18n();
  const nav = useNavigate();

  const [menuOpen, setMenuOpen] = useState(() => {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      if (v === null) return true;
      return v === "true";
    } catch {
      return true;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(menuOpen));
    } catch {
      /* ignore */
    }
  }, [menuOpen]);

  return (
    <div className="app-layout-shell">
      <aside
        className={`app-sidebar${menuOpen ? "" : " app-sidebar--collapsed"}`}
        aria-label={t("nav.brand")}
        aria-hidden={!menuOpen}
      >
        <div className="app-sidebar-header">
          <div className="app-sidebar-brand">{t("nav.brand")}</div>
          <button
            type="button"
            className="app-sidebar-pin"
            onClick={() => setMenuOpen(false)}
            title={t("nav.sidebarCollapse")}
            aria-label={t("nav.sidebarCollapse")}
          >
            ×
          </button>
        </div>
        <nav className="app-sidebar-nav">
          <NavLink to="/pos" style={sidebarLink} end>
            {t("nav.pos")}
          </NavLink>
          <NavLink to="/dashboard" style={sidebarLink}>
            {t("nav.dashboard")}
          </NavLink>
          <NavLink to="/products" style={sidebarLink}>
            {t("nav.products")}
          </NavLink>
          <NavLink to="/customers" style={sidebarLink}>
            {t("nav.customers")}
          </NavLink>
          <NavLink to="/cash" style={sidebarLink}>
            {t("nav.cash")}
          </NavLink>
          {isManager ? (
            <NavLink to="/sync" style={sidebarLink}>
              {t("nav.sync")}
            </NavLink>
          ) : null}
          {isManager ? (
            <NavLink to="/returns" style={sidebarLink}>
              {t("nav.returns")}
            </NavLink>
          ) : null}
          {isManager ? (
            <NavLink to="/purchases" style={sidebarLink}>
              {t("nav.purchases")}
            </NavLink>
          ) : null}
          {isManager ? (
            <NavLink to="/transfer" style={sidebarLink}>
              {t("nav.transfer")}
            </NavLink>
          ) : null}
          {isManager ? (
            <NavLink to="/count" style={sidebarLink}>
              {t("nav.count")}
            </NavLink>
          ) : null}
          {isManager ? (
            <NavLink to="/audit" style={sidebarLink}>
              {t("nav.audit")}
            </NavLink>
          ) : null}
          {isAdmin ? (
            <>
              <NavLink to="/users" style={sidebarLink}>
                {t("nav.users")}
              </NavLink>
              <NavLink to="/branches" style={sidebarLink}>
                {t("nav.branches")}
              </NavLink>
            </>
          ) : null}
        </nav>
      </aside>

      <div className="app-main-wrap">
        <header className="app-topbar">
          <button
            type="button"
            className="btn-touch app-menu-toggle"
            onClick={() => setMenuOpen((o) => !o)}
            aria-expanded={menuOpen}
            title={menuOpen ? t("nav.sidebarCollapse") : t("nav.sidebarExpand")}
            aria-label={menuOpen ? t("nav.sidebarCollapse") : t("nav.sidebarExpand")}
          >
            {menuOpen ? "⟨" : "☰"}
          </button>
          <div style={{ fontSize: 13, color: "var(--muted)", flex: "1 1 auto", minWidth: 0 }}>
            {formatUserBranchLine(user, locale, t("nav.allBranches"))}
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
