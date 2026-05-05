import React, { useEffect, useState } from "react";
import { api } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useI18n } from "../context/LanguageContext.jsx";

const inp = {
  padding: 12,
  borderRadius: 0,
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
  const [lines, setLines] = useState([{ productId: "", quantity: "1", unitCost: "", expiryDate: "" }]);
  const [note, setNote] = useState("");
  const [updateProductCost, setUpdateProductCost] = useState(true);
  const [list, setList] = useState([]);
  const [msg, setMsg] = useState("");
  const [newSupplier, setNewSupplier] = useState({ name: "", phone: "" });
  const [lookbackDays, setLookbackDays] = useState("30");
  const [targetStockDays, setTargetStockDays] = useState("21");
  const [recommendations, setRecommendations] = useState([]);
  const [selectedRecommendations, setSelectedRecommendations] = useState({});
  const [autoLoading, setAutoLoading] = useState(false);

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
        expiryDate: l.expiryDate?.trim() ? l.expiryDate : undefined,
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
      setLines([{ productId: "", quantity: "1", unitCost: "", expiryDate: "" }]);
      setNote("");
      await loadPurchases();
      setMsg(t("purchases.done"));
    } catch (x) {
      setMsg(x.message || t("purchases.failed"));
    }
  };

  const loadAutoRecommendations = async () => {
    const bid = branchId || user?.branchId;
    if (!bid) {
      setMsg(t("purchases.needBranch"));
      return;
    }
    setAutoLoading(true);
    setMsg("");
    try {
      const q = new URLSearchParams();
      q.set("branchId", bid);
      q.set("lookbackDays", String(Math.max(7, Number(lookbackDays) || 30)));
      q.set("targetStockDays", String(Math.max(7, Number(targetStockDays) || 21)));
      const res = await api(`/api/purchases/reorder-recommendations?${q.toString()}`);
      const rows = Array.isArray(res?.recommendations) ? res.recommendations : [];
      setRecommendations(rows);
      const nextSel = {};
      rows.forEach((r) => {
        nextSel[r.productId] = { checked: true, quantity: String(r.suggestedQty || 1) };
      });
      setSelectedRecommendations(nextSel);
      if (!rows.length) setMsg(t("purchases.noReorderNeeded"));
    } catch (x) {
      setMsg(x.message || t("purchases.reorderGenFailed"));
    } finally {
      setAutoLoading(false);
    }
  };

  const receiveRecommendations = async () => {
    const bid = branchId || user?.branchId;
    if (!bid) return;
    const items = recommendations
      .filter((r) => selectedRecommendations[r.productId]?.checked)
      .map((r) => ({
        productId: r.productId,
        quantity: Math.max(
          1,
          parseInt(String(selectedRecommendations[r.productId]?.quantity || "1"), 10) || 1
        ),
        unitCost: r.defaultUnitCost ?? "",
      }));
    if (!items.length) {
      setMsg(t("purchases.needPickOneProduct"));
      return;
    }
    setAutoLoading(true);
    setMsg("");
    try {
      await api("/api/purchases/reorder-recommendations/receive", {
        method: "POST",
        body: {
          branchId: bid,
          supplierId: supplierId || undefined,
          lookbackDays: Number(lookbackDays) || 30,
          targetStockDays: Number(targetStockDays) || 21,
          updateProductCost: false,
          items,
        },
      });
      await Promise.all([loadPurchases(), loadAutoRecommendations()]);
      setMsg(t("purchases.autoReceiveDone"));
    } catch (x) {
      setMsg(x.message || t("purchases.autoReceiveFailed"));
    } finally {
      setAutoLoading(false);
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

      <div className="card" style={{ display: "grid", gap: 10 }}>
        <strong>{t("purchases.autoReorderTitle")}</strong>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <input
            type="number"
            min={7}
            value={lookbackDays}
            onChange={(e) => setLookbackDays(e.target.value)}
            style={{ ...inp, width: 170 }}
            placeholder={t("purchases.lookbackPlaceholder")}
          />
          <input
            type="number"
            min={7}
            value={targetStockDays}
            onChange={(e) => setTargetStockDays(e.target.value)}
            style={{ ...inp, width: 170 }}
            placeholder={t("purchases.targetStockPlaceholder")}
          />
          <button
            type="button"
            className="btn-touch"
            onClick={loadAutoRecommendations}
            disabled={autoLoading}
            style={{ background: "var(--surface2)" }}
          >
            {t("purchases.generateSuggestions")}
          </button>
          <button
            type="button"
            className="btn-touch"
            onClick={receiveRecommendations}
            disabled={autoLoading || !recommendations.length}
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            {t("purchases.receiveSuggested")}
          </button>
        </div>

        {recommendations.length ? (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ color: "var(--muted)", textAlign: "start" }}>
                  <th style={th}>{t("purchases.colSelect")}</th>
                  <th style={th}>{t("purchases.colProduct")}</th>
                  <th style={th}>{t("purchases.colCurrent")}</th>
                  <th style={th}>{t("purchases.colReorderPoint")}</th>
                  <th style={th}>{t("purchases.colSuggested")}</th>
                  <th style={th}>{t("purchases.colCost")}</th>
                </tr>
              </thead>
              <tbody>
                {recommendations.map((r) => (
                  <tr key={r.productId}>
                    <td style={td}>
                      <input
                        type="checkbox"
                        checked={Boolean(selectedRecommendations[r.productId]?.checked)}
                        onChange={(e) =>
                          setSelectedRecommendations((prev) => ({
                            ...prev,
                            [r.productId]: {
                              ...(prev[r.productId] || {}),
                              checked: e.target.checked,
                              quantity: prev[r.productId]?.quantity || String(r.suggestedQty || 1),
                            },
                          }))
                        }
                      />
                    </td>
                    <td style={td}>{r.name}</td>
                    <td style={td}>{r.currentQty}</td>
                    <td style={td}>{r.reorderPoint}</td>
                    <td style={td}>
                      <input
                        type="number"
                        min={1}
                        value={selectedRecommendations[r.productId]?.quantity || String(r.suggestedQty || 1)}
                        onChange={(e) =>
                          setSelectedRecommendations((prev) => ({
                            ...prev,
                            [r.productId]: {
                              checked: prev[r.productId]?.checked ?? true,
                              quantity: e.target.value,
                            },
                          }))
                        }
                        style={{ ...inp, width: 90, minHeight: 36 }}
                      />
                    </td>
                    <td style={td}>
                      {r.defaultUnitCost != null ? Number(r.defaultUnitCost).toFixed(2) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

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
            <input
              type="date"
              value={line.expiryDate || ""}
              onChange={(e) => {
                const next = [...lines];
                next[i] = { ...next[i], expiryDate: e.target.value };
                setLines(next);
              }}
              style={{ ...inp, width: 170, minHeight: 44 }}
              title={t("purchases.expiryLotHint")}
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
          onClick={() => setLines([...lines, { productId: "", quantity: "1", unitCost: "", expiryDate: "" }])}
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
