import React, { useEffect, useState } from "react";
import { api } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useI18n } from "../context/LanguageContext.jsx";
import { branchDisplayName } from "../utils/displayLabels.js";
import { productDisplayName } from "../utils/productName.js";

const inp = {
  padding: 10,
  borderRadius: 10,
  border: "1px solid var(--border)",
  background: "var(--bg)",
  color: "var(--text)",
};

export default function Count() {
  const { t, locale } = useI18n();
  const { user, isAdmin } = useAuth();
  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState(user?.branchId || "");
  const [products, setProducts] = useState([]);
  const [counts, setCounts] = useState({});
  const [msg, setMsg] = useState("");

  useEffect(() => {
    api("/api/branches")
      .then((bs) => {
        setBranches(bs);
        if (user?.role === "ADMIN" && !branchId && bs[0]) setBranchId(bs[0].id);
      })
      .catch(() => {});
  }, [user?.role]);

  useEffect(() => {
    const bid = branchId || user?.branchId;
    if (!bid) return;
    const q = new URLSearchParams();
    q.set("branchId", bid);
    api(`/api/products?${q.toString()}`)
      .then((list) => {
        setProducts(list);
        const m = {};
        for (const p of list) {
          const inv = p.inventories?.[0];
          m[p.id] = String(inv?.quantity ?? 0);
        }
        setCounts(m);
      })
      .catch(() => setProducts([]));
  }, [branchId, user?.branchId]);

  const submit = async (e) => {
    e.preventDefault();
    setMsg("");
    const bid = branchId || user?.branchId;
    if (!bid) return;
    const lines = products.map((p) => ({
      productId: p.id,
      quantity: Math.max(0, parseInt(String(counts[p.id] ?? "0"), 10) || 0),
    }));
    try {
      await api("/api/inventory/reconcile", {
        method: "POST",
        body: { branchId: bid, lines },
      });
      setMsg(t("count.done"));
    } catch (x) {
      setMsg(x.message || t("count.failed"));
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h1 style={{ margin: 0 }}>{t("count.title")}</h1>
      <p style={{ margin: 0, color: "var(--muted)", fontSize: 14 }}>{t("count.intro")}</p>

      <form className="card" onSubmit={submit}>
        {isAdmin ? (
          <label style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 12 }}>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>{t("pos.branch")}</span>
            <select value={branchId} onChange={(e) => setBranchId(e.target.value)} style={{ ...inp, minHeight: 44 }}>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {branchDisplayName(b, locale)}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <div style={{ overflowX: "auto", maxHeight: "60vh" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ color: "var(--muted)", textAlign: "start" }}>
                <th style={th}>{t("invoice.colProduct")}</th>
                <th style={th}>{t("count.colQty")}</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id}>
                  <td style={td}>{productDisplayName(p, locale)}</td>
                  <td style={td}>
                    <input
                      type="number"
                      min={0}
                      value={counts[p.id] ?? "0"}
                      onChange={(e) => setCounts({ ...counts, [p.id]: e.target.value })}
                      style={{ ...inp, width: 100 }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button type="submit" className="btn-touch" style={{ background: "var(--accent)", color: "#fff", marginTop: 12, maxWidth: 280 }}>
          {t("count.submit")}
        </button>
        {msg ? (
          <div style={{ marginTop: 8, color: "var(--muted)" }}>{msg}</div>
        ) : null}
      </form>
    </div>
  );
}

const th = { padding: 8, borderBottom: "1px solid var(--border)" };
const td = { padding: 8, borderBottom: "1px solid var(--border)" };
