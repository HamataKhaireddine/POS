import React, { useEffect, useState } from "react";
import { api } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useI18n } from "../context/LanguageContext.jsx";
import { productDisplayName } from "../utils/productName.js";
import { branchDisplayName } from "../utils/displayLabels.js";
import { ProductImagePreview } from "../components/ProductImagePreview.jsx";

const PET_KEYS = { CAT: "pet.cat", DOG: "pet.dog", OTHER: "pet.other" };

export default function Products() {
  const { user, isManager, isAdmin } = useAuth();
  const { t, locale } = useI18n();
  const [branches, setBranches] = useState([]);
  const [filterBranchId, setFilterBranchId] = useState("");
  const [list, setList] = useState([]);
  const [low, setLow] = useState([]);
  const [form, setForm] = useState({
    name: "",
    nameEn: "",
    price: "",
    cost: "",
    petType: "OTHER",
    category: "",
    imageUrl: "",
    sku: "",
    barcode: "",
    branchId: "",
    initialStock: "0",
    minStockLevel: "5",
  });
  const [editing, setEditing] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);

  const load = async () => {
    const bid = isAdmin ? filterBranchId || "" : user?.branchId || "";
    const qs = new URLSearchParams();
    if (bid) qs.set("branchId", bid);
    qs.set("includeInactive", "1");
    qs.set("page", String(page));
    qs.set("pageSize", String(pageSize));
    qs.set("paginate", "1");
    const q = qs.toString() ? `?${qs.toString()}` : "";
    const [res, l] = await Promise.all([
      api(`/api/products${q}`),
      api(`/api/inventory/low-stock${bid ? `?branchId=${bid}` : ""}`),
    ]);
    if (res && Array.isArray(res.items)) {
      setList(res.items);
      setTotal(res.total ?? 0);
    } else {
      setList(Array.isArray(res) ? res : []);
      setTotal(Array.isArray(res) ? res.length : 0);
    }
    setLow(l);
  };

  useEffect(() => {
    api("/api/branches").then(setBranches).catch(() => {});
  }, []);

  useEffect(() => {
    setPage(1);
  }, [user?.id]);

  useEffect(() => {
    load().catch(() => {});
  }, [user?.branchId, filterBranchId, isAdmin, page, pageSize]);

  const saveNew = async (e) => {
    e.preventDefault();
    const bid = form.branchId || user?.branchId;
    if (!bid) {
      alert(t("products.pickBranch"));
      return;
    }
    await api("/api/products", {
      method: "POST",
      body: {
        ...form,
        branchId: bid,
        price: Number(form.price),
        cost: form.cost === "" ? null : Number(form.cost),
        nameEn: form.nameEn?.trim() || null,
      },
    });
    setForm({
      name: "",
      nameEn: "",
      price: "",
      cost: "",
      petType: "OTHER",
      category: "",
      imageUrl: "",
      sku: "",
      barcode: "",
      branchId: form.branchId,
      initialStock: "0",
      minStockLevel: "5",
    });
    await load();
  };

  const patch = async () => {
    if (!editing) return;
    await api(`/api/products/${editing.id}`, {
      method: "PATCH",
      body: {
        name: editing.name,
        nameEn: editing.nameEn?.trim() || null,
        price: Number(editing.price),
        cost: editing.cost === "" ? null : Number(editing.cost),
        petType: editing.petType,
        category: editing.category?.trim() || null,
        imageUrl: editing.imageUrl,
        sku: editing.sku,
        barcode: editing.barcode,
      },
    });
    setEditing(null);
    await load();
  };

  const remove = async (id) => {
    if (!confirm(t("products.confirmDelete"))) return;
    try {
      await api(`/api/products/${id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      alert(e.message || t("products.deleteFailed"));
    }
  };

  const toggleActive = async (p) => {
    try {
      await api(`/api/products/${p.id}`, {
        method: "PATCH",
        body: { isActive: !p.isActive },
      });
      await load();
    } catch (e) {
      alert(e.message || t("products.saveFailed"));
    }
  };

  const pages = Math.max(1, Math.ceil(total / pageSize) || 1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
        <h1 style={{ margin: 0 }}>{t("products.title")}</h1>
        {isAdmin ? (
          <select
            value={filterBranchId}
            onChange={(e) => {
              setFilterBranchId(e.target.value);
              setPage(1);
            }}
            style={{
              minHeight: 44,
              padding: "8px 12px",
              borderRadius: 10,
              background: "var(--surface)",
              color: "var(--text)",
              border: "1px solid var(--border)",
            }}
          >
            <option value="">{t("products.filterAllBranches")}</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {t("products.stockPrefix")} {branchDisplayName(b, locale)}
              </option>
            ))}
          </select>
        ) : null}
      </div>

      {low.length ? (
        <div className="card" style={{ borderInlineStart: "4px solid var(--warning)" }}>
          <strong>{t("products.lowStockTitle")}</strong>
          <ul style={{ margin: "8px 0 0", paddingInlineStart: 20 }}>
            {low.slice(0, 8).map((r) => (
              <li key={r.id}>
                {t("products.lowStockLine", {
                  name: r.product.name,
                  qty: r.quantity,
                  min: r.minStockLevel,
                  branch: branchDisplayName(r.branch, locale),
                })}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {isManager ? (
        <form className="card" onSubmit={saveNew} style={{ display: "grid", gap: 10 }}>
          <strong>{t("products.addProduct")}</strong>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
            <input
              placeholder={t("products.name")}
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              style={inp}
            />
            <input
              placeholder={t("products.nameEnField")}
              value={form.nameEn}
              onChange={(e) => setForm({ ...form, nameEn: e.target.value })}
              style={inp}
            />
            <input
              placeholder={t("products.price")}
              required
              type="number"
              step="0.01"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
              style={inp}
            />
            <input
              placeholder={t("products.cost")}
              type="number"
              step="0.01"
              value={form.cost}
              onChange={(e) => setForm({ ...form, cost: e.target.value })}
              style={inp}
            />
            <select
              value={form.petType}
              onChange={(e) => setForm({ ...form, petType: e.target.value })}
              style={inp}
            >
              <option value="CAT">{t("pet.cat")}</option>
              <option value="DOG">{t("pet.dog")}</option>
              <option value="OTHER">{t("pet.other")}</option>
            </select>
            <input
              placeholder={t("products.category")}
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              style={inp}
            />
            <input
              placeholder={t("products.imageUrl")}
              value={form.imageUrl}
              onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
              style={inp}
            />
            <input
              placeholder={t("products.sku")}
              value={form.sku}
              onChange={(e) => setForm({ ...form, sku: e.target.value })}
              style={inp}
            />
            <input
              placeholder={t("products.barcode")}
              value={form.barcode}
              onChange={(e) => setForm({ ...form, barcode: e.target.value })}
              style={inp}
            />
            <select
              value={form.branchId || user?.branchId || ""}
              onChange={(e) => setForm({ ...form, branchId: e.target.value })}
              required
              style={inp}
            >
              <option value="">{t("products.branch")}</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {branchDisplayName(b, locale)}
                </option>
              ))}
            </select>
            <input
              placeholder={t("products.initialStock")}
              type="number"
              value={form.initialStock}
              onChange={(e) => setForm({ ...form, initialStock: e.target.value })}
              style={inp}
            />
            <input
              placeholder={t("products.minLevel")}
              type="number"
              value={form.minStockLevel}
              onChange={(e) => setForm({ ...form, minStockLevel: e.target.value })}
              style={inp}
            />
          </div>
          <button type="submit" className="btn-touch" style={{ background: "var(--accent)", color: "#fff", maxWidth: 200 }}>
            {t("products.saveProduct")}
          </button>
        </form>
      ) : null}

      <div className="card" style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: "start", color: "var(--muted)" }}>
              <th style={{ ...th, width: 72 }}>{t("products.colImage")}</th>
              <th style={th}>{t("products.name")}</th>
              <th style={th}>{t("products.colType")}</th>
              <th style={th}>{t("products.colBrand")}</th>
              <th style={th}>{t("products.category")}</th>
              <th style={th}>{t("products.price")}</th>
              <th style={th}>{t("products.colStock")}</th>
              <th style={th}>{t("products.colStatus")}</th>
              {isManager ? <th style={th} /> : null}
            </tr>
          </thead>
          <tbody>
            {list.map((p) => {
              const inv = p.inventories?.[0];
              return (
                <tr key={p.id} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ ...td, verticalAlign: "middle" }}>
                    <ProductImagePreview url={p.imageUrl} alt="" width={56} height={56} />
                  </td>
                  <td style={td}>{productDisplayName(p, locale)}</td>
                  <td style={td}>{t(PET_KEYS[p.petType] || "pet.other")}</td>
                  <td style={td}>{p.brand?.name || "—"}</td>
                  <td style={td}>{p.productCategory?.name || p.category || "—"}</td>
                  <td style={td}>{Number(p.price).toFixed(2)}</td>
                  <td style={td}>{inv?.quantity ?? t("common.none")}</td>
                  <td style={td}>
                    {p.isActive ? t("products.statusActive") : t("products.statusInactive")}
                  </td>
                  {isManager ? (
                    <td style={td}>
                      <button
                        type="button"
                        className="btn-touch"
                        style={{ background: "var(--surface2)", marginInlineEnd: 6 }}
                        onClick={() =>
                          setEditing({
                            ...p,
                            price: String(p.price),
                            cost: p.cost != null ? String(p.cost) : "",
                            nameEn: p.nameEn || "",
                            category: p.category || "",
                          })
                        }
                      >
                        {t("common.edit")}
                      </button>
                      <button type="button" className="btn-touch" style={{ background: "var(--danger)" }} onClick={() => remove(p.id)}>
                        {t("common.delete")}
                      </button>
                      <button
                        type="button"
                        className="btn-touch"
                        style={{ background: p.isActive ? "var(--warning)" : "var(--success)", marginInlineStart: 6 }}
                        onClick={() => toggleActive(p)}
                      >
                        {p.isActive ? t("products.disable") : t("products.enable")}
                      </button>
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            marginTop: 16,
            paddingTop: 12,
            borderTop: "1px solid var(--border)",
          }}
        >
          <span style={{ color: "var(--muted)", fontSize: 14 }}>
            {t("products.pagination", { total, page, pages })}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              className="btn-touch"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              style={{ background: "var(--surface2)" }}
            >
              {t("common.previous")}
            </button>
            <button
              type="button"
              className="btn-touch"
              disabled={page * pageSize >= total}
              onClick={() => setPage((p) => p + 1)}
              style={{ background: "var(--surface2)" }}
            >
              {t("common.next")}
            </button>
          </div>
        </div>
      </div>

      {editing ? (
        <div className="card" style={{ position: "fixed", inset: 0, margin: "auto", maxWidth: 480, maxHeight: "90vh", overflow: "auto", zIndex: 50 }}>
          <h3>{t("products.editTitle")}</h3>
          <label style={lbl}>
            {t("products.name")}
            <input style={inp} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
          </label>
          <label style={lbl}>
            {t("products.nameEnField")}
            <input
              style={inp}
              value={editing.nameEn || ""}
              onChange={(e) => setEditing({ ...editing, nameEn: e.target.value })}
            />
          </label>
          <label style={lbl}>
            {t("products.price")}
            <input style={inp} value={editing.price} onChange={(e) => setEditing({ ...editing, price: e.target.value })} />
          </label>
          <label style={lbl}>
            {t("products.cost")}
            <input style={inp} value={editing.cost} onChange={(e) => setEditing({ ...editing, cost: e.target.value })} />
          </label>
          <label style={lbl}>
            {t("products.colType")}
            <select style={inp} value={editing.petType} onChange={(e) => setEditing({ ...editing, petType: e.target.value })}>
              <option value="CAT">{t("pet.cat")}</option>
              <option value="DOG">{t("pet.dog")}</option>
              <option value="OTHER">{t("pet.other")}</option>
            </select>
          </label>
          <label style={lbl}>
            {t("products.category")}
            <input
              style={inp}
              value={editing.category || ""}
              onChange={(e) => setEditing({ ...editing, category: e.target.value })}
            />
          </label>
          <label style={lbl}>
            {t("products.image")}
            <input style={inp} value={editing.imageUrl || ""} onChange={(e) => setEditing({ ...editing, imageUrl: e.target.value })} />
          </label>
          <div style={{ marginBottom: 10 }}>
            <span style={{ fontSize: 12, color: "var(--muted)", display: "block", marginBottom: 6 }}>{t("products.previewFromDb")}</span>
            <ProductImagePreview url={editing.imageUrl} alt="" width={120} height={120} />
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button type="button" className="btn-touch" style={{ background: "var(--accent)", color: "#fff" }} onClick={patch}>
              {t("common.save")}
            </button>
            <button type="button" className="btn-touch" style={{ background: "var(--surface2)" }} onClick={() => setEditing(null)}>
              {t("common.cancel")}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const inp = {
  padding: 10,
  borderRadius: 10,
  border: "1px solid var(--border)",
  background: "var(--bg)",
  color: "var(--text)",
};
const th = { padding: 10 };
const td = { padding: 10 };
const lbl = { display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 };
