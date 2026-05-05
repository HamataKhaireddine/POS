import React from "react";
import { useI18n } from "../context/LanguageContext.jsx";
import { usePrintSettings } from "../context/PrintSettingsContext.jsx";
import { PRINT_PAPER_KEYS } from "../utils/printPaper.js";

const card = {
  padding: 16,
  borderRadius: 0,
  border: "1px solid var(--border)",
  background: "var(--surface)",
  maxWidth: 560,
};

const sel = {
  minHeight: 44,
  padding: "8px 12px",
  borderRadius: 0,
  background: "var(--bg)",
  color: "var(--text)",
  border: "1px solid var(--border)",
  width: "100%",
  maxWidth: 320,
};

export default function PrintSettings() {
  const { t } = useI18n();
  const { sizes, setSizes } = usePrintSettings();

  const row = (key, labelKey, hintKey) => (
    <label style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
      <span style={{ fontWeight: 700 }}>{t(labelKey)}</span>
      {hintKey ? (
        <span style={{ fontSize: 13, color: "var(--muted)" }}>{t(hintKey)}</span>
      ) : null}
      <select
        value={sizes[key]}
        onChange={(e) => setSizes({ [key]: e.target.value })}
        style={sel}
        aria-label={t(labelKey)}
      >
        {PRINT_PAPER_KEYS.map((k) => (
          <option key={k} value={k}>
            {t(`printPaper.size.${k}`)}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 640 }}>
      <h1 style={{ margin: 0 }}>{t("printSettings.title")}</h1>
      <p style={{ margin: 0, color: "var(--muted)", fontSize: 14 }}>{t("printSettings.intro")}</p>

      <div style={card}>
        {row("retail", "printSettings.retail", "printSettings.retailHint")}
        {row("wholesale", "printSettings.wholesale", "printSettings.wholesaleHint")}
        {row("reports", "printSettings.reports", "printSettings.reportsHint")}
        {row("other", "printSettings.other", "printSettings.otherHint")}
      </div>

      <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>{t("printSettings.saveNote")}</p>
    </div>
  );
}
