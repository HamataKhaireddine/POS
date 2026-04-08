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

export default function Purchases() {
  const { t } = useI18n();
  const { user, isAdmin } = useAuth();
  const [branches, setBranches] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [branchId, setBranchId] = useState(user?.branchId || "");
  const [supplierId, setSupplierId] = useState("");
  const [products, setProducts] = useState([]);
  const [lines, setLines] = useState([{ productId: "", quantity: "1", unitCost: "" }]);
  const [note, setNote] = useState("");
  const [updateProductCost, setUpdateProductCost] = useState(true);
  const [list, setList] = useState([]);
  const [msg, setMsg] = useState("");
  const [newSupplier, setNewSupplier] = useState({ name: "", phone: "" });

  useEffect(() => {
    api("/api/branches")
      .then((bs) => {
        setBranches(bs);
        if (user?.role === "ADMIN" && !branchId && bs[0]) setBranchId(bs[0].id);
      })
      .catch(() => {});
    api("/api/suppliers")
      .then(setSuppliers)
      .catch(() => setSuppliers([]));
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

  const loadPurchases = () => {
    const bid = branchId || user?.branchId;
    const p = new URLSearchParams();
    if (bid) p.set("branchId", bid);
    return api(`/api/purchases?${p.toString()}`).then(setList);
  };

  useEffect(() => {
    loadPurchases().catch(() => setList([]));
  }, [branchId, user?.branchId]);

  const addSupplier = async (e) => {
    e.preventDefault();
    if (!newSupplier.name.trim()) return;
    const s = await api("/api/suppliers", {
      method: "POST",
      body: { name: newSupplier.name.trim(), phone: newSupplier.phone.trim() || undefined },
    });
    setSuppliers((prev) => [...prev, s].sort((a, b) => a.name.localeCompare(b.name)));
    setSupplierId(s.id);
    setNewSupplier({ name: "", phone: "" });
  };

  const submit = async (e) => {
    e.preventDefault();
    setMsg("");
    const bid = branchId || user?.branchId;
    if (!bid) {
      setMsg(t("purchases.needBranch"));
      return;
    }
    const items = lines
      .filter((l) => l.productId && l.unitCost !== "")
      .map((l) => ({
        productId: l.productId,
        quantity: Math.max(1, parseInt(String(l.quantity), 10) || 1),
        unitCost: Number.parseFloat(String(l.unitCost).replace(",", ".")) || 0,
      }));
    if (!items.length) {
      setMsg(t("purchases.needLines"));
      return;
    }
    try {
      await api("/api/purchases/receive", {
        method: "POST",
        body: {
          branchId: bid,
          supplierId: supplierId || undefined,
          note: note.trim() || undefined,
          updateProductCost,
          items,
        },
      });
      setLines([{ productId: "", quantity: "1", unitCost: "" }]);
      setNote("");
      await loadPurchases();
      setMsg(t("purchases.done"));
    } catch (x) {
      setMsg(x.message || t("purchases.failed"));
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h1 style={{ margin: 0 }}>{t("purchases.title")}</h1>
      <p style={{ margin: 0, color: "var(--muted)", fontSize: 14 }}>{t("purchases.intro")}</p>

      <form className="card" onSubmit={addSupplier} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-end" }}>
        <strong style={{ width: "100%" }}>{t("purchases.newSupplier")}</strong>
        <input
          placeholder={t("purchases.supplierName")}
          value={newSupplier.name}
          onChange={(e) => setNewSupplier({ ...newSupplier, name: e.target.value })}
          style={{ ...inp, flex: 1, minWidth: 160 }}
        />
        <input
          placeholder={t("customers.phone")}
          value={newSupplier.phone}
          onChange={(e) => setNewSupplier({ ...newSupplier, phone: e.target.value })}
          style={{ ...inp, width: 160 }}
        />
        <button type="submit" className="btn-touch" style={{ background: "var(--surface2)" }}>
          {t("common.add")}
        </button>
      </form>

      <form className="card" onSubmit={submit} style={{ display: "grid", gap: 12 }}>
        {isAdmin ? (
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>{t("pos.branch")}</span>
            <select value={branchId} onChange={(e) => setBranchId(e.target.value)} style={{ ...inp, minHeight: 44 }}>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>{t("purchases.supplierOptional")}</span>
          <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} style={{ ...inp, minHeight: 44 }}>
            <option value="">{t("common.none")}</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
          <input type="checkbox" checked={updateProductCost} onChange={(e) => setUpdateProductCost(e.target.checked)} />
          {t("purchases.updateCost")}
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>{t("returns.note")}</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} style={inp} />
        </label>
        <strong>{t("purchases.lines")}</strong>
        {lines.map((line, i) => (
          <div key={i} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <select
              value={line.productId}
              onChange={(e) => {
                const next = [...lines];
                next[i] = { ...next[i], productId: e.target.value };
                setLines(next);
              }}
              style={{ ...inp, flex: 1, minWidth: 180, minHeight: 44 }}
            >
              <option value="">{t("returns.pickProduct")}</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={1}
              placeholder={t("invoice.colQty")}
              value={line.quantity}
              onChange={(e) => {
                const next = [...lines];
                next[i] = { ...next[i], quantity: e.target.value };
                setLines(next);
              }}
              style={{ ...inp, width: 80, minHeight: 44 }}
            />
            <input
              type="text"
              inputMode="decimal"
              placeholder={t("purchases.unitCost")}
              value={line.unitCost}
              onChange={(e) => {
                const next = [...lines];
                next[i] = { ...next[i], unitCost: e.target.value };
                setLines(next);
              }}
              style={{ ...inp, width: 120, minHeight: 44 }}
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
          onClick={() => setLines([...lines, { productId: "", quantity: "1", unitCost: "" }])}
          style={{ background: "var(--surface2)", maxWidth: 200 }}
        >
          {t("returns.addLine")}
        </button>
        <button type="submit" className="btn-touch" style={{ background: "var(--accent)", color: "#fff", maxWidth: 320 }}>
          {t("purchases.submit")}
        </button>
        {msg ? <div style={{ color: "var(--muted)" }}>{msg}</div> : null}
      </form>

      <div className="card" style={{ overflowX: "auto" }}>
        <strong>{t("purchases.recent")}</strong>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, marginTop: 12 }}>
          <thead>
            <tr style={{ color: "var(--muted)", textAlign: "start" }}>
              <th style={th}>{t("returns.colDate")}</th>
              <th style={th}>{t("purchases.colSupplier")}</th>
              <th style={th}>{t("returns.colItems")}</th>
            </tr>
          </thead>
          <tbody>
            {list.map((p) => (
              <tr key={p.id}>
                <td style={td}>{new Date(p.createdAt).toLocaleString()}</td>
                <td style={td}>{p.supplier?.name || "—"}</td>
                <td style={td}>
                  {p.items?.map((it) => `${it.product?.name || "?"} ×${it.quantity} @${Number(it.unitCost).toFixed(2)}`).join("، ")}
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
