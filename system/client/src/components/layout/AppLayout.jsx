import React, { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import { useTheme } from "../../context/ThemeContext.jsx";
import { useI18n } from "../../context/LanguageContext.jsx";
import { formatUserBranchLine } from "../../utils/displayLabels.js";
import { OfflineBanner } from "../OfflineBanner.jsx";
import { useAlertsBadgeCount } from "../../hooks/useAlertsBadgeCount.js";

const STORAGE_KEY = "sidebarOpen";

const NAV_SECTION_IDS = ["sales", "overview", "catalog", "inventory", "business", "admin"];

/** Which sidebar section owns the current route (for auto-expand). */
function navSectionForPath(pathname) {
  const p = pathname || "";
  if (p === "/pos" || p.startsWith("/pos/") || p.startsWith("/wholesale") || p.startsWith("/cash")) return "sales";
  if (
    p.startsWith("/sync-queue") ||
    p.startsWith("/alerts") ||
    p.startsWith("/dashboard") ||
    p.startsWith("/print-settings")
  ) {
    return "overview";
  }
  if (p.startsWith("/products") || p === "/customers" || p.startsWith("/customers/") || p.startsWith("/customer-accounts")) {
    return "catalog";
  }
  if (
    p.startsWith("/returns") ||
    p.startsWith("/purchases") ||
    p.startsWith("/transfer") ||
    p.startsWith("/count") ||
    p.startsWith("/audit") ||
    p === "/sync"
  ) {
    return "inventory";
  }
  if (
    p.startsWith("/loyalty") ||
    p.startsWith("/zakat") ||
    p.startsWith("/reports") ||
    p.startsWith("/appointments") ||
    p.startsWith("/accounting") ||
    p.startsWith("/automations") ||
    p.startsWith("/commissions") ||
    p.startsWith("/delivery") ||
    p.startsWith("/hr")
  ) {
    return "business";
  }
  if (p.startsWith("/platform") || p.startsWith("/users") || p.startsWith("/branches")) return "admin";
  return "";
}

function initialOpenSections(pathname) {
  const open = {};
  NAV_SECTION_IDS.forEach((id) => {
    open[id] = false;
  });
  const sec = navSectionForPath(pathname);
  if (sec) open[sec] = true;
  else NAV_SECTION_IDS.forEach((id) => {
    open[id] = true;
  });
  return open;
}

const sidebarLink = ({ isActive }) => ({
  display: "block",
  padding: "10px 14px",
  borderRadius: 0,
  textDecoration: "none",
  color: isActive ? "#fff" : "var(--muted)",
  background: isActive ? "var(--accent)" : "transparent",
  fontWeight: 700,
  width: "100%",
  boxSizing: "border-box",
});

/** Collapsible sidebar group; skips if there are no link children. */
function SidebarNavSection({ sectionId, title, expanded, onToggle, t, children }) {
  const visible = React.Children.toArray(children).some(
    (c) => c != null && typeof c !== "boolean",
  );
  if (!visible) return null;
  const panelId = `sidebar-nav-${sectionId}`;
  const hint = expanded ? t("nav.collapseSection", { title }) : t("nav.expandSection", { title });
  return (
    <div className="app-sidebar-nav-section">
      <button
        type="button"
        className="app-sidebar-nav-heading app-sidebar-nav-heading--toggle"
        id={`${panelId}-btn`}
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={onToggle}
        title={hint}
      >
        <span className="app-sidebar-nav-chevron" aria-hidden>
          ▼
        </span>
        <span style={{ flex: "1 1 auto", minWidth: 0 }}>{title}</span>
      </button>
      <div id={panelId} className="app-sidebar-nav-panel" role="region" aria-labelledby={`${panelId}-btn`} hidden={!expanded}>
        {children}
      </div>
    </div>
  );
}

export function AppLayout() {
  const { user, logout, isAdmin, isManager, isPlatformAdmin } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { t, locale, setLocale } = useI18n();
  const nav = useNavigate();
  const location = useLocation();
  const { count: alertsBadge } = useAlertsBadgeCount();

  const isPosRoute = location.pathname === "/pos";

  const [menuOpen, setMenuOpen] = useState(() => {
    try {
      if (typeof window !== "undefined" && window.location.pathname === "/pos") {
        return false;
      }
      const v = localStorage.getItem(STORAGE_KEY);
      if (v === null) return true;
      return v === "true";
    } catch {
      return true;
    }
  });

  useEffect(() => {
    if (location.pathname === "/pos") {
      setMenuOpen(false);
    }
  }, [location.pathname]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(menuOpen));
    } catch {
      /* ignore */
    }
  }, [menuOpen]);

  const [openSections, setOpenSections] = useState(() =>
    initialOpenSections(typeof window !== "undefined" ? window.location.pathname : ""),
  );

  useEffect(() => {
    const sec = navSectionForPath(location.pathname);
    if (sec) {
      setOpenSections((prev) => ({ ...prev, [sec]: true }));
    }
  }, [location.pathname]);

  const toggleNavSection = (id) => {
    setOpenSections((prev) => ({ ...prev, [id]: !prev[id] }));
  };

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
          <SidebarNavSection
            sectionId="sales"
            title={t("nav.section.sales")}
            expanded={Boolean(openSections.sales)}
            onToggle={() => toggleNavSection("sales")}
            t={t}
          >
            <NavLink to="/pos" style={sidebarLink} end>
              {t("nav.pos")}
            </NavLink>
            <NavLink to="/wholesale" style={sidebarLink}>
              {t("nav.wholesale")}
            </NavLink>
            <NavLink to="/cash" style={sidebarLink}>
              {t("nav.cash")}
            </NavLink>
          </SidebarNavSection>

          <SidebarNavSection
            sectionId="overview"
            title={t("nav.section.overview")}
            expanded={Boolean(openSections.overview)}
            onToggle={() => toggleNavSection("overview")}
            t={t}
          >
            <NavLink to="/sync-queue" style={sidebarLink}>
              {t("nav.syncQueue")}
            </NavLink>
            <NavLink to="/alerts" style={sidebarLink}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8, width: "100%" }}>
                <span>{t("nav.alerts")}</span>
                {alertsBadge > 0 ? (
                  <span
                    style={{
                      marginInlineStart: "auto",
                      minWidth: 22,
                      height: 22,
                      padding: "0 6px",
                      borderRadius: 999,
                      background: "var(--danger, #c62828)",
                      color: "#fff",
                      fontSize: 12,
                      fontWeight: 800,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                    title={t("nav.alerts")}
                  >
                    {alertsBadge > 99 ? "99+" : alertsBadge}
                  </span>
                ) : null}
              </span>
            </NavLink>
            <NavLink to="/dashboard" style={sidebarLink}>
              {t("nav.dashboard")}
            </NavLink>
            <NavLink to="/print-settings" style={sidebarLink}>
              {t("nav.printSettings")}
            </NavLink>
          </SidebarNavSection>

          <SidebarNavSection
            sectionId="catalog"
            title={t("nav.section.catalog")}
            expanded={Boolean(openSections.catalog)}
            onToggle={() => toggleNavSection("catalog")}
            t={t}
          >
            <NavLink to="/products" style={sidebarLink}>
              {t("nav.products")}
            </NavLink>
            <NavLink to="/customers" style={sidebarLink}>
              {t("nav.customers")}
            </NavLink>
            <NavLink to="/customer-accounts" style={sidebarLink}>
              {t("nav.receivable")}
            </NavLink>
          </SidebarNavSection>

          <SidebarNavSection
            sectionId="inventory"
            title={t("nav.section.inventory")}
            expanded={Boolean(openSections.inventory)}
            onToggle={() => toggleNavSection("inventory")}
            t={t}
          >
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
              <NavLink to="/sync" style={sidebarLink}>
                {t("nav.sync")}
              </NavLink>
            ) : null}
            {isManager ? (
              <NavLink to="/audit" style={sidebarLink}>
                {t("nav.audit")}
              </NavLink>
            ) : null}
          </SidebarNavSection>

          <SidebarNavSection
            sectionId="business"
            title={t("nav.section.business")}
            expanded={Boolean(openSections.business)}
            onToggle={() => toggleNavSection("business")}
            t={t}
          >
            {isManager ? (
              <NavLink to="/loyalty" style={sidebarLink}>
                {t("nav.loyalty")}
              </NavLink>
            ) : null}
            {isManager ? (
              <NavLink to="/zakat" style={sidebarLink}>
                {t("nav.zakat")}
              </NavLink>
            ) : null}
            {isManager ? (
              <NavLink to="/reports" style={sidebarLink}>
                {t("nav.reports")}
              </NavLink>
            ) : null}
            {isManager ? (
              <NavLink to="/appointments" style={sidebarLink}>
                {t("nav.appointments")}
              </NavLink>
            ) : null}
            {isManager ? (
              <NavLink to="/accounting" style={sidebarLink}>
                {t("nav.accounting")}
              </NavLink>
            ) : null}
            {isManager ? (
              <NavLink to="/automations" style={sidebarLink}>
                {t("nav.automations")}
              </NavLink>
            ) : null}
            {isManager ? (
              <NavLink to="/commissions" style={sidebarLink}>
                {t("nav.commissions")}
              </NavLink>
            ) : null}
            {isManager ? (
              <NavLink to="/delivery" style={sidebarLink}>
                {t("nav.delivery")}
              </NavLink>
            ) : null}
            {isManager ? (
              <NavLink to="/hr/employees" style={sidebarLink}>
                {t("nav.hr")}
              </NavLink>
            ) : null}
          </SidebarNavSection>

          <SidebarNavSection
            sectionId="admin"
            title={t("nav.section.admin")}
            expanded={Boolean(openSections.admin)}
            onToggle={() => toggleNavSection("admin")}
            t={t}
          >
            {isPlatformAdmin ? (
              <NavLink to="/platform/organizations" style={sidebarLink}>
                {t("nav.platform")}
              </NavLink>
            ) : null}
            {isAdmin ? (
              <NavLink to="/users" style={sidebarLink}>
                {t("nav.users")}
              </NavLink>
            ) : null}
            {isAdmin ? (
              <NavLink to="/branches" style={sidebarLink}>
                {t("nav.branches")}
              </NavLink>
            ) : null}
          </SidebarNavSection>
        </nav>
      </aside>

      <div className="app-main-wrap">
        <OfflineBanner />
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
        <main className={`app-main-content${isPosRoute ? " app-main-content--pos-wide" : ""}`}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
