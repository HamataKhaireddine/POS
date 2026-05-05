import React, { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { useTheme } from "../context/ThemeContext.jsx";
import { useI18n } from "../context/LanguageContext.jsx";
import { BUSINESS_VERTICAL_IDS } from "../lib/businessVerticalIds.js";
import { BusinessVerticalIcon } from "../lib/businessVerticalIcons.jsx";

const btnGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(148px, 1fr))",
  gap: 8,
};

export default function Register() {
  const { registerOrganization, user, loading } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { t, locale, setLocale } = useI18n();
  const nav = useNavigate();

  const [step, setStep] = useState(1);
  const [businessVertical, setBusinessVertical] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [organizationSlug, setOrganizationSlug] = useState("");
  const [branchName, setBranchName] = useState("");
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [registrationSecret, setRegistrationSecret] = useState(
    () => import.meta.env.VITE_ORG_REGISTRATION_SECRET || ""
  );
  const [err, setErr] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [dbUrlInfo, setDbUrlInfo] = useState(null);

  const defaultSlugFromName = useMemo(() => {
    const raw = organizationName
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      .slice(0, 48);
    return raw.replace(/^-+|-+$/g, "");
  }, [organizationName]);

  useEffect(() => {
    try {
      window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
    } catch {
      window.scrollTo(0, 0);
    }
  }, [step]);

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

  const applySuggestedSlug = () => {
    if (defaultSlugFromName) setOrganizationSlug(defaultSlugFromName);
  };

  const goNext = () => {
    setErr("");
    setDbUrlInfo(null);
    if (!businessVertical) {
      setErr(t("register.verticalRequired"));
      return;
    }
    setStep(2);
  };

  const goBack = () => {
    setErr("");
    setDbUrlInfo(null);
    setStep(1);
  };

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    setDbUrlInfo(null);
    if (!businessVertical) {
      setErr(t("register.verticalRequired"));
      setStep(1);
      return;
    }
    setSubmitting(true);
    try {
      await registerOrganization({
        registrationSecret: registrationSecret.trim() || undefined,
        organizationName: organizationName.trim(),
        organizationSlug: organizationSlug.trim().toLowerCase(),
        branchName: branchName.trim() || undefined,
        adminName: adminName.trim(),
        adminEmail: adminEmail.trim(),
        adminPassword,
        businessVertical,
      });
      nav("/pos", { replace: true });
    } catch (x) {
      setErr(x.message || t("register.failed"));
      const info = x?.data?.urlInfo;
      setDbUrlInfo(info && typeof info === "object" ? info : null);
    } finally {
      setSubmitting(false);
    }
  };

  const iconColor = theme === "dark" ? "#e5e5e5" : "#111";

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

      <form className="card" onSubmit={submit} style={{ width: "100%", maxWidth: 520 }}>
        <h1 style={{ marginTop: 0 }}>{t("register.title")}</h1>
        <p
          style={{
            marginTop: 0,
            marginBottom: 6,
            fontSize: 12,
            fontWeight: 700,
            color: "var(--muted)",
            letterSpacing: 0.3,
          }}
        >
          {t("register.stepProgress", { step: String(step) })}
        </p>
        <p style={{ marginTop: 0, fontSize: 13, color: "var(--muted)", lineHeight: 1.45 }}>
          {step === 1 ? t("register.step1Subtitle") : t("register.step2Subtitle")}
        </p>
        {step === 1 ? (
          <p style={{ marginTop: 8, marginBottom: 0, fontSize: 13, color: "var(--muted)", lineHeight: 1.45 }}>
            {t("register.intro")}
          </p>
        ) : null}

        {step === 1 ? (
          <fieldset style={{ border: "none", margin: "16px 0", padding: 0 }}>
            <legend style={{ fontWeight: 600, marginBottom: 8, color: "var(--text)" }}>
              {t("register.verticalSection")}
            </legend>
            <div style={btnGrid}>
              {BUSINESS_VERTICAL_IDS.map((id) => (
                <button
                  key={id}
                  type="button"
                  className="btn-touch"
                  onClick={() => setBusinessVertical(id)}
                  aria-pressed={businessVertical === id}
                  style={{
                    minHeight: 76,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    padding: "10px 8px",
                    fontSize: 13,
                    lineHeight: 1.25,
                    textAlign: "center",
                    border:
                      businessVertical === id
                        ? "2px solid var(--accent)"
                        : "1px solid var(--border)",
                    background: businessVertical === id ? "var(--surface2)" : "var(--surface)",
                    color: "var(--text)",
                  }}
                >
                  <span style={{ lineHeight: 1, userSelect: "none" }}>
                    <BusinessVerticalIcon id={id} size={24} color={iconColor} />
                  </span>
                  <span>{t(`register.vertical.${id}`)}</span>
                </button>
              ))}
            </div>
          </fieldset>
        ) : null}

        {step === 2 ? (
          <>
            <label style={{ display: "block", marginBottom: 12 }}>
              <span style={{ display: "block", marginBottom: 6, color: "var(--muted)" }}>
                {t("register.orgName")}
              </span>
              <input
                value={organizationName}
                onChange={(e) => setOrganizationName(e.target.value)}
                required
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
              <span style={{ display: "block", marginBottom: 6, color: "var(--muted)" }}>
                {t("register.orgSlug")}
              </span>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input
                  value={organizationSlug}
                  onChange={(e) => setOrganizationSlug(e.target.value.toLowerCase())}
                  required
                  pattern="[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?"
                  title={t("register.slugHint")}
                  style={{
                    flex: "1 1 160px",
                    padding: 12,
                    borderRadius: 0,
                    border: "1px solid var(--border)",
                    background: "var(--bg)",
                    color: "var(--text)",
                  }}
                />
                <button
                  type="button"
                  className="btn-touch"
                  onClick={applySuggestedSlug}
                  disabled={!defaultSlugFromName}
                  style={{
                    border: "1px solid var(--border)",
                    background: "var(--surface)",
                    color: "var(--text)",
                  }}
                >
                  {t("register.suggestSlug")}
                </button>
              </div>
            </label>

            <label style={{ display: "block", marginBottom: 12 }}>
              <span style={{ display: "block", marginBottom: 6, color: "var(--muted)" }}>
                {t("register.branchName")}
              </span>
              <input
                value={branchName}
                onChange={(e) => setBranchName(e.target.value)}
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
              <span style={{ display: "block", marginBottom: 6, color: "var(--muted)" }}>
                {t("register.adminName")}
              </span>
              <input
                value={adminName}
                onChange={(e) => setAdminName(e.target.value)}
                required
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
              <span style={{ display: "block", marginBottom: 6, color: "var(--muted)" }}>
                {t("register.adminEmail")}
              </span>
              <input
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                type="email"
                required
                autoComplete="email"
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
              <span style={{ display: "block", marginBottom: 6, color: "var(--muted)" }}>
                {t("register.adminPassword")}
              </span>
              <input
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
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
              <span style={{ display: "block", marginBottom: 6, color: "var(--muted)" }}>
                {t("register.registrationSecret")}
              </span>
              <input
                value={registrationSecret}
                onChange={(e) => setRegistrationSecret(e.target.value)}
                type="password"
                autoComplete="off"
                placeholder={t("register.registrationSecretPlaceholder")}
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

            <details style={{ marginBottom: 14, fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>
              <summary style={{ cursor: "pointer", color: "var(--text)" }}>{t("register.coverageTitle")}</summary>
              <p style={{ margin: "8px 0 0" }}>{t("register.coverageSummary")}</p>
              <p style={{ margin: "8px 0 0" }}>{t("register.coverageGaps")}</p>
            </details>
          </>
        ) : null}

        {err ? (
          <div style={{ color: "var(--danger)", marginBottom: 12, fontSize: 14 }} role="alert">
            {err}
          </div>
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
          </div>
        ) : null}

        {step === 1 ? (
          <button
            type="button"
            className="btn-touch"
            onClick={goNext}
            style={{ width: "100%", background: "var(--accent)", color: "#fff", marginBottom: 12 }}
          >
            {t("common.next")}
          </button>
        ) : (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            <button
              type="button"
              className="btn-touch"
              onClick={goBack}
              disabled={submitting}
              style={{
                flex: "0 0 auto",
                minWidth: 100,
                background: "var(--surface2)",
                color: "var(--text)",
                border: "1px solid var(--border)",
              }}
            >
              {t("common.previous")}
            </button>
            <button
              type="submit"
              className="btn-touch"
              disabled={submitting}
              style={{
                flex: "1 1 160px",
                background: "var(--accent)",
                color: "#fff",
              }}
            >
              {submitting ? t("register.submitting") : t("register.submit")}
            </button>
          </div>
        )}

        <div style={{ textAlign: "center", fontSize: 14 }}>
          <Link to="/login" style={{ color: "var(--accent)" }}>
            {t("register.backToLogin")}
          </Link>
        </div>
      </form>
    </div>
  );
}
