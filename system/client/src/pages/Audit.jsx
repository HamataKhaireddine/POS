import React, { useCallback, useEffect, useState } from "react";
import { api } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useI18n } from "../context/LanguageContext.jsx";

export default function Audit() {
  const { t } = useI18n();
  const { isAdmin } = useAuth();
  const [rows, setRows] = useState([]);
  const [branchFilter, setBranchFilter] = useState("");
  const [branches, setBranches] = useState([]);

  const load = useCallback(() => {
    const p = new URLSearchParams();
    p.set("limit", "150");
    if (isAdmin && branchFilter) p.set("branchId", branchFilter);
    return api(`/api/audit-logs?${p.toString()}`).then(setRows);
  }, [isAdmin, branchFilter]);

  useEffect(() => {
    if (isAdmin) {
      api("/api/branches")
        .then(setBranches)
        .catch(() => {});
    }
  }, [isAdmin]);

  useEffect(() => {
    load().catch(() => setRows([]));
  }, [load]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h1 style={{ margin: 0 }}>{t("audit.title")}</h1>
      <p style={{ margin: 0, color: "var(--muted)", fontSize: 14 }}>{t("audit.intro")}</p>

      {isAdmin ? (
        <div className="card" style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>{t("audit.filterBranch")}</span>
            <select
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              style={{
                minHeight: 44,
                padding: "8px 12px",
                borderRadius: 10,
                background: "var(--surface)",
                color: "var(--text)",
                border: "1px solid var(--border)",
              }}
            >
              <option value="">{t("dashboard.allBranches")}</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="btn-touch" onClick={() => load()} style={{ background: "var(--surface2)" }}>
            {t("pos.refresh")}
          </button>
        </div>
      ) : null}

      <div className="card" style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ color: "var(--muted)", textAlign: "start" }}>
              <th style={th}>{t("returns.colDate")}</th>
              <th style={th}>{t("audit.action")}</th>
              <th style={th}>{t("audit.user")}</th>
              <th style={th}>{t("audit.branch")}</th>
              <th style={th}>{t("audit.summary")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td style={td}>{new Date(r.createdAt).toLocaleString()}</td>
                <td style={td}>
                  <code style={{ fontSize: 12 }}>{r.action}</code>
                </td>
                <td style={td}>{r.user?.name || r.user?.email || "—"}</td>
                <td style={td}>{r.branch?.name || "—"}</td>
                <td style={td}>{r.summary || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const th = { padding: "8px 6px", borderBottom: "1px solid var(--border)" };
const td = { padding: "8px 6px", borderBottom: "1px solid var(--border)", verticalAlign: "top" };
