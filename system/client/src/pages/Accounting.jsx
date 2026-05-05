import React, { useState } from "react";
import { api } from "../api/client.js";
import { useI18n } from "../context/LanguageContext.jsx";

const inp = {
  padding: 12,
  borderRadius: 0,
  border: "1px solid var(--border)",
  background: "var(--bg)",
  color: "var(--text)",
};

export default function Accounting() {
  const { t } = useI18n();
  const [from, setFrom] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [trial, setTrial] = useState(null);

  const initAccounts = async () => {
    setLoading(true);
    setMsg("");
    try {
      const res = await api("/api/accounting/accounts/init-defaults", { method: "POST" });
      setAccounts(res.accounts || []);
      setMsg(t("accounting.msgInitDone", { n: String(res.count || 0) }));
    } catch (e) {
      setMsg(e.message || t("accounting.msgInitFail"));
    } finally {
      setLoading(false);
    }
  };

  const rebuild = async () => {
    setLoading(true);
    setMsg("");
    try {
      await api("/api/accounting/journals/rebuild", {
        method: "POST",
        body: {
          from: new Date(`${from}T00:00:00`).toISOString(),
          to: new Date(`${to}T23:59:59`).toISOString(),
        },
      });
      setMsg(t("accounting.msgRebuildDone"));
    } catch (e) {
      setMsg(e.message || t("accounting.msgRebuildFail"));
    } finally {
      setLoading(false);
    }
  };

  const loadTrial = async () => {
    setLoading(true);
    setMsg("");
    try {
      const q = new URLSearchParams();
      q.set("from", new Date(`${from}T00:00:00`).toISOString());
      q.set("to", new Date(`${to}T23:59:59`).toISOString());
      const res = await api(`/api/accounting/trial-balance?${q.toString()}`);
      setTrial(res);
      setMsg(res.balanced ? t("accounting.msgBalanced") : t("accounting.msgUnbalanced"));
    } catch (e) {
      setMsg(e.message || t("accounting.msgTrialFail"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <h1 style={{ margin: 0 }}>{t("accounting.title")}</h1>
      <p style={{ margin: 0, color: "var(--muted)" }}>{t("accounting.intro")}</p>

      <div className="card" style={{ display: "grid", gap: 10 }}>
        <strong>{t("accounting.step1")}</strong>
        <button className="btn-touch" type="button" onClick={initAccounts} disabled={loading} style={{ maxWidth: 260 }}>
          {t("accounting.initBtn")}
        </button>
        {accounts.length ? (
          <div style={{ fontSize: 13, color: "var(--muted)" }}>
            {accounts.map((a) => `${a.code} ${a.name}`).join(" • ")}
          </div>
        ) : null}
      </div>

      <div className="card" style={{ display: "grid", gap: 10 }}>
        <strong>{t("accounting.step2")}</strong>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={inp} />
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={inp} />
          <button className="btn-touch" type="button" onClick={rebuild} disabled={loading} style={{ background: "var(--accent)", color: "#fff" }}>
            {t("accounting.generateJournals")}
          </button>
          <button className="btn-touch" type="button" onClick={loadTrial} disabled={loading}>
            {t("accounting.showTrial")}
          </button>
        </div>
      </div>

      {trial ? (
        <div className="card" style={{ overflowX: "auto" }}>
          <strong>{t("accounting.trialTitle")}</strong>
          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10, fontSize: 13 }}>
            <thead>
              <tr style={{ color: "var(--muted)", textAlign: "start" }}>
                <th style={th}>{t("accounting.thCode")}</th>
                <th style={th}>{t("accounting.thAccount")}</th>
                <th style={th}>{t("accounting.thType")}</th>
                <th style={th}>{t("accounting.thDebit")}</th>
                <th style={th}>{t("accounting.thCredit")}</th>
              </tr>
            </thead>
            <tbody>
              {trial.lines?.map((l) => (
                <tr key={l.accountCode}>
                  <td style={td}>{l.accountCode}</td>
                  <td style={td}>{l.accountName}</td>
                  <td style={td}>{l.type}</td>
                  <td style={td}>{Number(l.debit || 0).toFixed(2)}</td>
                  <td style={td}>{Number(l.credit || 0).toFixed(2)}</td>
                </tr>
              ))}
              <tr>
                <td style={{ ...td, fontWeight: 700 }} colSpan={3}>
                  {t("accounting.totals")}
                </td>
                <td style={{ ...td, fontWeight: 700 }}>{Number(trial.totals?.debit || 0).toFixed(2)}</td>
                <td style={{ ...td, fontWeight: 700 }}>{Number(trial.totals?.credit || 0).toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : null}
      {msg ? <div style={{ color: "var(--muted)" }}>{msg}</div> : null}
    </div>
  );
}

const th = { padding: "8px 6px", borderBottom: "1px solid var(--border)" };
const td = { padding: "8px 6px", borderBottom: "1px solid var(--border)" };
