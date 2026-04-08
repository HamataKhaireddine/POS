import React, { useEffect, useState } from "react";
import { api } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useI18n } from "../context/LanguageContext.jsx";

const inp = {
  padding: 12,
  borderRadius: 10,
  border: "1px solid var(--border)",
  background: "var(--bg)",
  color: "var(--text)",
};

export default function Returns() {
  const { t } = useI18n();
  const { user, isAdmin } = useAuth();
  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState(user?.branchId || "");
  const [products, setProducts] = useState([]);
  const [lines, setLines] = useState([{ productId: "", quantity: "1" }]);
  const [saleId, setSaleId] = useState("");
  const [note, setNote] = useState("");
  const [list, setList] = useState([]);
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
      .then(setProducts)
      .catch(() => setProducts([]));
  }, [branchId, user?.branchId]);

  const loadRefunds = () => {
    const bid = branchId || user?.branchId;
    const p = new URLSearchParams();
    if (bid) p.set("branchId", bid);
    return api(`/api/refunds?${p.toString()}`).then(setList);
  };

  useEffect(() => {
    loadRefunds().catch(() => setList([]));
  }, [branchId, user?.branchId]);

  const submit = async (e) => {
    e.preventDefault();
    setMsg("");
    const bid = branchId || user?.branchId;
    if (!bid) {
      setMsg(t("returns.needBranch"));
      return;
    }
    const items = lines
      .filter((l) => l.productId)
      .map((l) => ({
        productId: l.productId,
        quantity: Math.max(1, parseInt(String(l.quantity), 10) || 1),
      }));
    if (!items.length) {
      setMsg(t("returns.needLines"));
      return;
    }
    try {
      await api("/api/refunds", {
        method: "POST",
        body: {
          branchId: bid,
          saleId: saleId.trim() || undefined,
          note: note.trim() || undefined,
          items,
        },
      });
      setLines([{ productId: "", quantity: "1" }]);
      setSaleId("");
      setNote("");
      await loadRefunds();
      setMsg(t("returns.done"));
    } catch (x) {
      setMsg(x.message || t("returns.failed"));
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h1 style={{ margin: 0 }}>{t("returns.title")}</h1>
      <p style={{ margin: 0, color: "var(--muted)", fontSize: 14 }}>{t("returns.intro")}</p>

      <form className="card" onSubmit={submit} style={{ display: "grid", gap: 12 }}>
        {isAdmin ? (
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>{t("pos.branch")}</span>
            <select
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              style={{ ...inp, minHeight: 44 }}
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>{t("returns.saleIdOptional")}</span>
          <input value={saleId} onChange={(e) => setSaleId(e.target.value)} placeholder="cuid…" style={inp} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>{t("returns.note")}</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} style={inp} />
        </label>
        <strong>{t("returns.lines")}</strong>
        {lines.map((line, i) => (
          <div key={i} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <select
              value={line.productId}
              onChange={(e) => {
                const next = [...lines];
                next[i] = { ...next[i], productId: e.target.value };
                setLines(next);
              }}
              style={{ ...inp, flex: 1, minWidth: 200, minHeight: 44 }}
            >
              <option value="">{t("returns.pickProduct")}</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.sku ? `(${p.sku})` : ""}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={1}
              value={line.quantity}
              onChange={(e) => {
                const next = [...lines];
                next[i] = { ...next[i], quantity: e.target.value };
                setLines(next);
              }}
              style={{ ...inp, width: 100, minHeight: 44 }}
            />
            <button
              type="button"
              className="btn-touch"
              onClick={() => setLines(lines.filter((_, j) => j !== i))}
              disabled={lines.length < 2}
            >
              {t("returns.removeLine")}
            </button>
          </div>
        ))}
        <button
          type="button"
          className="btn-touch"
          onClick={() => setLines([...lines, { productId: "", quantity: "1" }])}
          style={{ background: "var(--surface2)", maxWidth: 200 }}
        >
          {t("returns.addLine")}
        </button>
        <button type="submit" className="btn-touch" style={{ background: "var(--accent)", color: "#fff", maxWidth: 280 }}>
          {t("returns.submit")}
        </button>
        {msg ? <div style={{ color: "var(--muted)" }}>{msg}</div> : null}
      </form>

      <div className="card" style={{ overflowX: "auto" }}>
        <strong>{t("returns.recent")}</strong>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, marginTop: 12 }}>
          <thead>
            <tr style={{ color: "var(--muted)", textAlign: "start" }}>
              <th style={th}>{t("returns.colDate")}</th>
              <th style={th}>{t("returns.colTotal")}</th>
              <th style={th}>{t("returns.colSale")}</th>
              <th style={th}>{t("returns.colItems")}</th>
            </tr>
          </thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.id}>
                <td style={td}>{new Date(r.createdAt).toLocaleString()}</td>
                <td style={td}>
                  {Number(r.total).toFixed(2)} {t("common.currency")}
                </td>
                <td style={td}>{r.saleId ? r.saleId.slice(0, 8) + "…" : "—"}</td>
                <td style={td}>
                  {r.items?.map((it) => `${it.product?.name || "?"} ×${it.quantity}`).join("، ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const th = { padding: "8px 6px", borderBottom: "1px solid var(--border)" };
const td = { padding: "8px 6px", borderBottom: "1px solid var(--border)" };
