import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client.js";
import { useI18n } from "../context/LanguageContext.jsx";

export default function CustomerReceivables() {
  const { t } = useI18n();
  const [list, setList] = useState([]);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    setMsg("");
    api("/api/customer-accounts?debtsOnly=1")
      .then(setList)
      .catch((e) => setMsg(e.message || t("receivable.loadError")));
  }, [t]);

  return (
    <div style={{ maxWidth: 900 }}>
      <h1 style={{ marginTop: 0 }}>{t("nav.receivable")}</h1>
      <p style={{ color: "var(--muted)", fontSize: 14 }}>
        {t("receivable.listIntro")}
      </p>
      {msg ? <p style={{ color: "var(--danger)" }}>{msg}</p> : null}
      <div className="card" style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "start" }}>
              <th style={{ padding: "8px 6px" }}>{t("customers.name")}</th>
              <th style={{ padding: "8px 6px" }}>{t("customers.phone")}</th>
              <th style={{ padding: "8px 6px" }}>{t("customers.colBalance")}</th>
              <th style={{ padding: "8px 6px" }} />
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ padding: 16, color: "var(--muted)" }}>
                  {t("receivable.empty")}
                </td>
              </tr>
            ) : (
              list.map((c) => (
                <tr key={c.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "8px 6px" }}>{c.name}</td>
                  <td style={{ padding: "8px 6px" }}>{c.phone || "—"}</td>
                  <td style={{ padding: "8px 6px", fontWeight: 700 }}>
                    {Number(c.accountBalance ?? 0).toFixed(2)} {t("common.currency")}
                  </td>
                  <td style={{ padding: "8px 6px" }}>
                    <Link to={`/customer-accounts/${c.id}`} className="btn-touch" style={{ textDecoration: "none", display: "inline-block" }}>
                      {t("receivable.open")}
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
