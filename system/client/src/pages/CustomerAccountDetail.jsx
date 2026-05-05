import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useI18n } from "../context/LanguageContext.jsx";
import { branchDisplayName } from "../utils/displayLabels.js";

export default function CustomerAccountDetail() {
  const { customerId } = useParams();
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [msg, setMsg] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("CASH");
  const [payNote, setPayNote] = useState("");
  const [branches, setBranches] = useState([]);
  const [payBranchId, setPayBranchId] = useState(user?.branchId || "");

  const load = () => {
    setMsg("");
    return api(`/api/customer-accounts/${customerId}/ledger`)
      .then(setData)
      .catch((e) => {
        setMsg(e.message || t("receivable.loadError"));
        setData(null);
      });
  };

  useEffect(() => {
    load();
  }, [customerId]);

  useEffect(() => {
    if (user?.role === "ADMIN" && !user?.branchId) {
      api("/api/branches")
        .then((bs) => {
          setBranches(bs);
          if (bs[0]) setPayBranchId((prev) => prev || bs[0].id);
        })
        .catch(() => {});
    }
  }, [user?.role, user?.branchId]);

  const submitPay = async (e) => {
    e.preventDefault();
    setMsg("");
    try {
      const bid = user?.branchId || payBranchId;
      if (!bid) {
        setMsg(t("receivable.needBranch"));
        return;
      }
      await api(`/api/customer-accounts/${customerId}/payments`, {
        method: "POST",
        body: {
          amount: Number(String(payAmount).replace(",", ".")),
          paymentMethod: payMethod,
          branchId: bid,
          note: payNote.trim() || undefined,
        },
      });
      setPayAmount("");
      setPayNote("");
      setMsg(t("receivable.saved"));
      await load();
    } catch (e) {
      setMsg(e.message || t("receivable.payFailed"));
    }
  };

  if (!data?.customer) {
    return (
      <div>
        <Link to="/customer-accounts">{t("receivable.backCustomers")}</Link>
        <p>{msg || t("common.loading")}</p>
      </div>
    );
  }

  const { customer, entries } = data;
  const bal = Number(customer.accountBalance ?? 0);

  const typeLabel = (et) => {
    if (et === "SALE_CREDIT") return t("receivable.typeSale");
    if (et === "PAYMENT") return t("receivable.typePayment");
    if (et === "ADJUSTMENT") return t("receivable.typeAdjust");
    return et;
  };

  return (
    <div style={{ maxWidth: 960 }}>
      <p style={{ marginBottom: 12 }}>
        <Link to="/customer-accounts">{t("receivable.backCustomers")}</Link>
      </p>
      <h1 style={{ marginTop: 0 }}>{customer.name}</h1>
      <p style={{ fontSize: 18, fontWeight: 700 }}>
        {t("receivable.balance")}: {bal.toFixed(2)} {t("common.currency")}
      </p>
      {msg ? <p style={{ color: "var(--muted)" }}>{msg}</p> : null}

      {bal > 0.001 ? (
        <form className="card" onSubmit={submitPay} style={{ marginBottom: 24, display: "grid", gap: 12, maxWidth: 420 }}>
          <strong>{t("receivable.collect")}</strong>
          {user?.role === "ADMIN" && !user?.branchId && branches.length > 0 ? (
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 12, color: "var(--muted)" }}>{t("pos.branch")}</span>
              <select
                value={payBranchId}
                onChange={(e) => setPayBranchId(e.target.value)}
                style={{ minHeight: 44, padding: "8px 12px", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)" }}
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {branchDisplayName(b, locale)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>{t("receivable.amount")}</span>
            <input
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
              inputMode="decimal"
              required
              style={{ minHeight: 44, padding: "0 12px", border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)" }}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>{t("receivable.method")}</span>
            <select
              value={payMethod}
              onChange={(e) => setPayMethod(e.target.value)}
              style={{ minHeight: 44, padding: "8px 12px", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)" }}
            >
              <option value="CASH">{t("payment.cash")}</option>
              <option value="CARD">{t("payment.card")}</option>
              <option value="ONLINE">{t("payment.online")}</option>
            </select>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>{t("receivable.note")}</span>
            <input
              value={payNote}
              onChange={(e) => setPayNote(e.target.value)}
              style={{ minHeight: 44, padding: "0 12px", border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)" }}
            />
          </label>
          <button type="submit" className="btn-touch" style={{ background: "var(--accent)", color: "#fff", maxWidth: 240 }}>
            {t("receivable.submit")}
          </button>
        </form>
      ) : null}

      <h2 style={{ fontSize: 18 }}>{t("receivable.ledger")}</h2>
      <div className="card" style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "start" }}>
              <th style={{ padding: "8px 6px" }}>{t("receivable.colDate")}</th>
              <th style={{ padding: "8px 6px" }}>{t("receivable.colType")}</th>
              <th style={{ padding: "8px 6px" }}>{t("receivable.colAmount")}</th>
              <th style={{ padding: "8px 6px" }}>{t("receivable.colSale")}</th>
              <th style={{ padding: "8px 6px" }}>{t("receivable.colBy")}</th>
            </tr>
          </thead>
          <tbody>
            {(entries || []).map((row) => (
              <tr key={row.id} style={{ borderBottom: "1px solid var(--border)" }}>
                <td style={{ padding: "8px 6px", whiteSpace: "nowrap" }}>
                  {new Date(row.createdAt).toLocaleString()}
                </td>
                <td style={{ padding: "8px 6px" }}>{typeLabel(row.entryType)}</td>
                <td style={{ padding: "8px 6px", fontWeight: 600 }}>
                  {Number(row.amount).toFixed(2)} {t("common.currency")}
                </td>
                <td style={{ padding: "8px 6px" }}>
                  {row.saleId ? (
                    <span style={{ fontFamily: "monospace", fontSize: 12 }}>{row.saleId.slice(0, 8)}…</span>
                  ) : (
                    "—"
                  )}
                </td>
                <td style={{ padding: "8px 6px" }}>{row.createdBy?.name || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
