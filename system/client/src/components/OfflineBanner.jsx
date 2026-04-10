import React from "react";
import { useOffline } from "../context/OfflineContext.jsx";
import { useI18n } from "../context/LanguageContext.jsx";

export function OfflineBanner() {
  const { online, syncing, pendingCount } = useOffline();
  const { t } = useI18n();

  if (online && !syncing && pendingCount === 0) return null;

  let text = "";
  if (!online) text = t("offline.banner");
  else if (syncing) text = t("offline.syncing");
  else if (pendingCount > 0) text = t("offline.pending").replace("{{n}}", String(pendingCount));

  if (!text) return null;

  return (
    <div
      role="status"
      style={{
        padding: "8px 12px",
        fontSize: 13,
        fontWeight: 700,
        textAlign: "center",
        background: !online ? "var(--danger-bg, #fef2f2)" : "var(--surface2)",
        color: !online ? "var(--danger, #b91c1c)" : "var(--text)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      {text}
    </div>
  );
}
