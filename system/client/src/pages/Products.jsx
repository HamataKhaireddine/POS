import React, { useEffect, useRef, useState } from "react";
import { api, apiBlob, apiUploadExcel } from "../api/client.js";
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
  const [expiring, setExpiring] = useState([]);
  const [form, setForm] = useState({
    name: "",
    nameEn: "",
    price: "",
    wholesalePrice: "",
    cost: "",
    petType: "OTHER",
    category: "",
    imageUrl: "",
    sku: "",
    barcode: "",
    branchId: "",
    initialStock: "0",
    minStockLevel: "5",
    expiryDate: "",
    expiryAlertDaysBefore: "",
  });
  const [editing, setEditing] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [excelBranchId, setExcelBranchId] = useState("");
  const [excelBusy, setExcelBusy] = useState(false);
  const fileRef = useRef(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [lotsView, setLotsView] = useState({ productId: "", productName: "", branchId: "", lots: [], loading: false, error: "" });

  const load = async () => {
    const bid = isAdmin ? filterBranchId || "" : user?.branchId || "";
    const qs = new URLSearchParams();
    if (bid) qs.set("branchId", bid);
    qs.set("includeInactive", "1");
    qs.set("page", String(page));
    qs.set("pageSize", String(pageSize));
    qs.set("paginate", "1");
    const q = qs.toString() ? `?${qs.toString()}` : "";
    const [res, l, ex] = await Promise.all([
      api(`/api/products${q}`),
      api(`/api/inventory/low-stock${bid ? `?branchId=${bid}` : ""}`),
      api(`/api/inventory/expiry-alerts${bid ? `?branchId=${encodeURIComponent(bid)}` : ""}`).catch(() => []),
    ]);
    if (res && Array.isArray(res.items)) {
      setList(res.items);
      setTotal(res.total ?? 0);
    } else {
      setList(Array.isArray(res) ? res : []);
      setTotal(Array.isArray(res) ? res.length : 0);
    }
    setLow(l);
    setExpiring(Array.isArray(ex) ? ex : []);
  };

  useEffect(() => {
    api("/api/branches").then(setBranches).catch(() => {});
  }, []);

  useEffect(() => {
    if (!branches.length) return;
    setExcelBranchId((prev) => {
      if (prev) return prev;
      if (isAdmin && filterBranchId) return filterBranchId;
      if (user?.branchId) return user.branchId;
      return branches[0].id;
    });
  }, [branches, filterBranchId, isAdmin, user?.branchId]);

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
        wholesalePrice: form.wholesalePrice === "" ? null : Number(form.wholesalePrice),
        cost: form.cost === "" ? null : Number(form.cost),
        nameEn: form.nameEn?.trim() || null,
        expiryDate: form.expiryDate?.trim() || null,
        expiryAlertDaysBefore: form.expiryDate?.trim()
          ? form.expiryAlertDaysBefore !== ""
            ? Number(form.expiryAlertDaysBefore)
            : undefined
          : null,
      },
    });
    setForm({
      name: "",
      nameEn: "",
      price: "",
      wholesalePrice: "",
      cost: "",
      petType: "OTHER",
      category: "",
      imageUrl: "",
      sku: "",
      barcode: "",
      branchId: form.branchId,
      initialStock: "0",
      minStockLevel: "5",
      expiryDate: "",
      expiryAlertDaysBefore: "",
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
        wholesalePrice: editing.wholesalePrice === "" ? null : Number(editing.wholesalePrice),
        cost: editing.cost === "" ? null : Number(editing.cost),
        expiryDate: editing.expiryDate === "" ? null : editing.expiryDate,
        expiryAlertDaysBefore:
          editing.expiryDate && editing.expiryAlertDaysBefore !== ""
            ? Number(editing.expiryAlertDaysBefore)
            : editing.expiryDate
              ? undefined
              : null,
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

  const idsOnPage = list.map((p) => p.id);
  const allSelectedOnPage =
    idsOnPage.length > 0 && idsOnPage.every((id) => selectedIds.includes(id));

  const toggleSelectRow = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const generateBarcode = async (mode) => {
    try {
      if (mode === "new") {
        const { barcode: b } = await api("/api/products/generate-barcode");
        setForm((f) => ({ ...f, barcode: b }));
      } else if (mode === "edit" && editing?.id) {
        const { barcode: b } = await api(
          `/api/products/generate-barcode?excludeProductId=${encodeURIComponent(editing.id)}`
        );
        setEditing((e) => (e ? { ...e, barcode: b } : e));
      }
    } catch (e) {
      alert(e?.message || t("products.generateBarcodeFailed"));
    }
  };

  const toggleSelectAllOnPage = () => {
    if (allSelectedOnPage) {
      setSelectedIds((prev) => prev.filter((id) => !idsOnPage.includes(id)));
    } else {
      setSelectedIds((prev) => [...new Set([...prev, ...idsOnPage])]);
    }
  };

  const runBulkPatch = async (isActive) => {
    if (selectedIds.length === 0) return;
    const n = selectedIds.length;
    const ids = [...selectedIds];
    setBulkBusy(true);
    let ok = 0;
    try {
      for (const id of ids) {
        try {
          await api(`/api/products/${id}`, {
            method: "PATCH",
            body: { isActive },
          });
          ok += 1;
        } catch {
          /* continue */
        }
      }
      setSelectedIds([]);
      await load();
      if (ok < n) alert(t("products.bulkFailed"));
      else alert(t("products.bulkDone", { n: ok }));
    } catch (e) {
      alert(e.message || t("products.bulkFailed"));
    } finally {
      setBulkBusy(false);
    }
  };

  const bulkEnable = () => runBulkPatch(true);
  const bulkDisable = () => runBulkPatch(false);

  const bulkDelete = async () => {
    if (selectedIds.length === 0 || !isAdmin) return;
    if (!confirm(t("products.bulkConfirmDelete", { n: selectedIds.length }))) return;
    setBulkBusy(true);
    const toDelete = [...selectedIds];
    let ok = 0;
    try {
      for (const id of toDelete) {
        try {
          await api(`/api/products/${id}`, { method: "DELETE" });
          ok += 1;
        } catch {
          /* continue */
        }
      }
      setSelectedIds([]);
      await load();
      if (ok < toDelete.length) alert(t("products.bulkFailed"));
      else alert(t("products.bulkDone", { n: ok }));
    } catch (e) {
      alert(e.message || t("products.bulkFailed"));
    } finally {
      setBulkBusy(false);
    }
  };

  const pages = Math.max(1, Math.ceil(total / pageSize) || 1);

  const fmtExpiry = (iso) => {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleDateString(locale === "en" ? "en-GB" : "ar-SA");
    } catch {
      return "—";
    }
  };

  const lotStatus = (expiryIso) => {
    if (!expiryIso) return { key: "none", label: "No expiry", color: "var(--muted)" };
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const exp = new Date(expiryIso);
    exp.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((exp.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
    if (diffDays < 0) return { key: "expired", label: `Expired ${Math.abs(diffDays)}d`, color: "var(--danger)" };
    if (diffDays <= 14) return { key: "soon", label: `Expiring in ${diffDays}d`, color: "var(--warning)" };
    return { key: "ok", label: `${diffDays}d left`, color: "var(--success)" };
  };

  const openLots = async (productId, productName) => {
    const bid = isAdmin ? filterBranchId || user?.branchId || "" : user?.branchId || "";
    if (!bid) {
      alert(t("products.pickBranch"));
      return;
    }
    setLotsView({ productId, productName, branchId: bid, lots: [], loading: true, error: "" });
    try {
      const res = await api(`/api/products/${encodeURIComponent(productId)}/lots?branchId=${encodeURIComponent(bid)}`);
      setLotsView({
        productId,
        productName,
        branchId: bid,
        lots: Array.isArray(res?.lots) ? res.lots : [],
        loading: false,
        error: "",
      });
    } catch (e) {
      setLotsView({ productId, productName, branchId: bid, lots: [], loading: false, error: e.message || "Failed to load lots" });
    }
  };

  const downloadExcel = async () => {
    if (!excelBranchId) {
      alert(t("products.excelPickBranch"));
      return;
    }
    setExcelBusy(true);
    try {
      const blob = await apiBlob(
        `/api/products/export/excel?branchId=${encodeURIComponent(excelBranchId)}`
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "products-export.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(e.message || "Export failed");
    } finally {
      setExcelBusy(false);
    }
  };

  const onExcelFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !excelBranchId) {
      if (!excelBranchId) alert(t("products.excelPickBranch"));
      return;
    }
    setExcelBusy(true);
    try {
      const r = await apiUploadExcel("/api/products/import/excel", file, excelBranchId);
      const msg = t("products.excelResult", {
        created: r.created ?? 0,
        updated: r.updated ?? 0,
        errors: r.errorCount ?? 0,
      });
      const detail =
        r.errors?.length > 0
          ? `\n${r.errors.slice(0, 5).map((x) => `صف ${x.row}: ${x.message}`).join("\n")}${r.errors.length > 5 ? "\n…" : ""}`
          : "";
      alert(msg + detail);
      await load();
    } catch (err) {
      alert(err.message || "Import failed");
    } finally {
      setExcelBusy(false);
    }
  };

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
              borderRadius: 0,
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

      {isManager ? (
        <div className="card" style={{ display: "grid", gap: 10 }}>
          <strong>{t("products.excelTitle")}</strong>
          <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>{t("products.excelHint")}</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 200 }}>
              <span style={{ fontSize: 12, color: "var(--muted)" }}>{t("products.excelBranch")}</span>
              <select
                value={excelBranchId}
                onChange={(e) => setExcelBranchId(e.target.value)}
                disabled={excelBusy}
                style={{
                  minHeight: 44,
                  padding: "8px 12px",
                  borderRadius: 0,
                  background: "var(--surface)",
                  color: "var(--text)",
                  border: "1px solid var(--border)",
                }}
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {branchDisplayName(b, locale)}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="btn-touch"
              disabled={excelBusy || !excelBranchId}
              onClick={downloadExcel}
              style={{ background: "var(--surface2)", color: "var(--text)", minHeight: 44 }}
            >
              {t("products.excelDownload")}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              style={{ display: "none" }}
              onChange={onExcelFile}
            />
            <button
              type="button"
              className="btn-touch"
              disabled={excelBusy || !excelBranchId}
              onClick={() => fileRef.current?.click()}
              style={{ background: "var(--accent)", color: "#fff", minHeight: 44 }}
            >
              {t("products.excelUpload")}
            </button>
          </div>
        </div>
      ) : null}

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

      {expiring.length ? (
        <div className="card" style={{ borderInlineStart: "4px solid var(--danger)" }}>
          <strong>{t("products.expiringTitle")}</strong>
          <ul style={{ margin: "8px 0 0", paddingInlineStart: 20 }}>
            {expiring.slice(0, 12).map((row) => (
              <li
                key={row.product.id}
                style={{
                  color: row.status === "expired" ? "var(--danger)" : "var(--warning)",
                  fontWeight: row.status === "expired" ? 700 : 600,
                }}
              >
                {row.status === "expired"
                  ? t("products.expiryLineExpired", {
                      name: row.product.name,
                      days: Math.abs(row.daysUntilExpiry),
                    })
                  : t("products.expiryLineSoon", {
                      name: row.product.name,
                      days: row.daysUntilExpiry,
                      alertDays: row.alertDays,
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
              placeholder={t("products.purchasePrice")}
              type="number"
              step="0.01"
              value={form.cost}
              onChange={(e) => setForm({ ...form, cost: e.target.value })}
              style={inp}
            />
            <input
              placeholder={t("products.retailPrice")}
              required
              type="number"
              step="0.01"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
              style={inp}
            />
            <input
              placeholder={t("products.wholesalePrice")}
              type="number"
              step="0.01"
              value={form.wholesalePrice}
              onChange={(e) => setForm({ ...form, wholesalePrice: e.target.value })}
              style={inp}
            />
            <input
              type="date"
              value={form.expiryDate}
              onChange={(e) => setForm({ ...form, expiryDate: e.target.value })}
              style={inp}
              title={t("products.expiryDate")}
            />
            <input
              placeholder={t("products.expiryAlertDays")}
              type="number"
              min={0}
              step={1}
              value={form.expiryAlertDaysBefore}
              onChange={(e) => setForm({ ...form, expiryAlertDaysBefore: e.target.value })}
              style={inp}
              disabled={!form.expiryDate}
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
            <div style={{ display: "flex", gap: 8, alignItems: "stretch", flexWrap: "wrap", minWidth: 0 }}>
              <input
                placeholder={t("products.barcode")}
                value={form.barcode}
                onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                style={{ ...inp, flex: "1 1 140px", minWidth: 0 }}
              />
              {!String(form.barcode || "").trim() ? (
                <button
                  type="button"
                  className="btn-touch"
                  onClick={() => generateBarcode("new")}
                  style={{ background: "var(--surface2)", whiteSpace: "nowrap" }}
                  title={t("products.generateBarcodeTitle")}
                >
                  {t("products.generateBarcode")}
                </button>
              ) : null}
            </div>
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
        {isManager && selectedIds.length > 0 ? (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: 10,
              marginBottom: 12,
              padding: "10px 12px",
              borderRadius: 0,
              background: "var(--surface2)",
              border: "1px solid var(--border)",
            }}
          >
            <span style={{ fontWeight: 700 }}>{t("products.bulkSelected", { n: selectedIds.length })}</span>
            <button
              type="button"
              className="btn-touch"
              disabled={bulkBusy}
              onClick={bulkEnable}
              style={{ background: "var(--success)", color: "#fff" }}
            >
              {t("products.bulkEnable")}
            </button>
            <button
              type="button"
              className="btn-touch"
              disabled={bulkBusy}
              onClick={bulkDisable}
              style={{ background: "var(--warning)", color: "#111" }}
            >
              {t("products.bulkDisable")}
            </button>
            {isAdmin ? (
              <button
                type="button"
                className="btn-touch"
                disabled={bulkBusy}
                onClick={bulkDelete}
                style={{ background: "var(--danger)", color: "#fff" }}
              >
                {t("products.bulkDelete")}
              </button>
            ) : null}
            <button
              type="button"
              className="btn-touch"
              disabled={bulkBusy}
              onClick={() => setSelectedIds([])}
              style={{ background: "transparent", color: "var(--muted)", marginInlineStart: "auto" }}
            >
              {t("common.cancel")}
            </button>
          </div>
        ) : null}
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: "start", color: "var(--muted)" }}>
              {isManager ? (
                <th style={{ ...th, width: 44 }}>
                  <input
                    type="checkbox"
                    checked={allSelectedOnPage}
                    onChange={toggleSelectAllOnPage}
                    disabled={!list.length || bulkBusy}
                    title={t("products.colSelect")}
                    aria-label={t("products.colSelect")}
                  />
                </th>
              ) : null}
              <th style={{ ...th, width: 72 }}>{t("products.colImage")}</th>
              <th style={th}>{t("products.name")}</th>
              <th style={th}>{t("products.colType")}</th>
              <th style={th}>{t("products.colBrand")}</th>
              <th style={th}>{t("products.category")}</th>
              <th style={th}>{t("products.colPurchase")}</th>
              <th style={th}>{t("products.colRetail")}</th>
              <th style={th}>{t("products.colWholesale")}</th>
              <th style={th}>{t("products.colExpiry")}</th>
              <th style={th}>{t("products.colStock")}</th>
              <th style={th}>{t("products.colStatus")}</th>
              <th style={th}>Lots</th>
              {isManager ? <th style={th} /> : null}
            </tr>
          </thead>
          <tbody>
            {list.map((p) => {
              const inv = p.inventories?.[0];
              return (
                <tr key={p.id} style={{ borderTop: "1px solid var(--border)" }}>
                  {isManager ? (
                    <td style={{ ...td, verticalAlign: "middle" }}>
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(p.id)}
                        onChange={() => toggleSelectRow(p.id)}
                        disabled={bulkBusy}
                        aria-label={t("products.colSelect")}
                      />
                    </td>
                  ) : null}
                  <td style={{ ...td, verticalAlign: "middle" }}>
                    <ProductImagePreview url={p.imageUrl} alt="" width={56} height={56} />
                  </td>
                  <td style={td}>{productDisplayName(p, locale)}</td>
                  <td style={td}>{t(PET_KEYS[p.petType] || "pet.other")}</td>
                  <td style={td}>{p.brand?.name || "—"}</td>
                  <td style={td}>{p.productCategory?.name || p.category || "—"}</td>
                  <td style={td}>{p.cost != null ? Number(p.cost).toFixed(2) : "—"}</td>
                  <td style={td}>{Number(p.price).toFixed(2)}</td>
                  <td style={td}>{p.wholesalePrice != null ? Number(p.wholesalePrice).toFixed(2) : "—"}</td>
                  <td style={{ ...td, fontSize: 13 }}>
                    {fmtExpiry(p.expiryDate)}
                    {p.expiryDate && p.expiryAlertDaysBefore != null ? (
                      <span style={{ display: "block", color: "var(--muted)", fontSize: 11 }}>
                        ±{p.expiryAlertDaysBefore} {t("products.expiryDaysShort")}
                      </span>
                    ) : null}
                  </td>
                  <td style={td}>{inv?.quantity ?? t("common.none")}</td>
                  <td style={td}>
                    {p.isActive ? t("products.statusActive") : t("products.statusInactive")}
                  </td>
                  <td style={td}>
                    <button
                      type="button"
                      className="btn-touch"
                      style={{ background: "var(--surface2)" }}
                      onClick={() => openLots(p.id, productDisplayName(p, locale))}
                    >
                      View lots
                    </button>
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
                            wholesalePrice: p.wholesalePrice != null ? String(p.wholesalePrice) : "",
                            cost: p.cost != null ? String(p.cost) : "",
                            nameEn: p.nameEn || "",
                            category: p.category || "",
                            expiryDate: p.expiryDate ? String(p.expiryDate).slice(0, 10) : "",
                            expiryAlertDaysBefore:
                              p.expiryAlertDaysBefore != null ? String(p.expiryAlertDaysBefore) : "",
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
            {t("products.purchasePrice")}
            <input style={inp} value={editing.cost} onChange={(e) => setEditing({ ...editing, cost: e.target.value })} />
          </label>
          <label style={lbl}>
            {t("products.retailPrice")}
            <input style={inp} value={editing.price} onChange={(e) => setEditing({ ...editing, price: e.target.value })} />
          </label>
          <label style={lbl}>
            {t("products.wholesalePrice")}
            <input
              style={inp}
              value={editing.wholesalePrice ?? ""}
              onChange={(e) => setEditing({ ...editing, wholesalePrice: e.target.value })}
            />
          </label>
          <label style={lbl}>
            {t("products.expiryDate")}
            <input
              type="date"
              style={inp}
              value={editing.expiryDate || ""}
              onChange={(e) => setEditing({ ...editing, expiryDate: e.target.value })}
            />
          </label>
          <label style={lbl}>
            {t("products.expiryAlertDays")}
            <input
              type="number"
              min={0}
              step={1}
              style={inp}
              value={editing.expiryAlertDaysBefore ?? ""}
              onChange={(e) => setEditing({ ...editing, expiryAlertDaysBefore: e.target.value })}
              disabled={!editing.expiryDate}
            />
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
            {t("products.sku")}
            <input style={inp} value={editing.sku || ""} onChange={(e) => setEditing({ ...editing, sku: e.target.value })} />
          </label>
          <label style={lbl}>
            {t("products.barcode")}
            <div style={{ display: "flex", gap: 8, alignItems: "stretch", flexWrap: "wrap" }}>
              <input
                style={{ ...inp, flex: "1 1 200px", minWidth: 0 }}
                value={editing.barcode || ""}
                onChange={(e) => setEditing({ ...editing, barcode: e.target.value })}
              />
              {!String(editing.barcode || "").trim() ? (
                <button
                  type="button"
                  className="btn-touch"
                  onClick={() => generateBarcode("edit")}
                  style={{ background: "var(--surface2)", whiteSpace: "nowrap" }}
                  title={t("products.generateBarcodeTitle")}
                >
                  {t("products.generateBarcode")}
                </button>
              ) : null}
            </div>
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

      {lotsView.productId ? (
        <div className="card" style={{ position: "fixed", inset: 0, margin: "auto", maxWidth: 860, maxHeight: "90vh", overflow: "auto", zIndex: 60 }}>
          <h3 style={{ marginTop: 0 }}>Lots — {lotsView.productName}</h3>
          <div style={{ color: "var(--muted)", marginBottom: 10, fontSize: 13 }}>
            Branch: {branches.find((b) => b.id === lotsView.branchId)?.name || lotsView.branchId}
          </div>
          {lotsView.loading ? (
            <div>Loading...</div>
          ) : lotsView.error ? (
            <div style={{ color: "var(--danger)" }}>{lotsView.error}</div>
          ) : !lotsView.lots.length ? (
            <div style={{ color: "var(--muted)" }}>No lots found for this product in selected branch.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: "start", color: "var(--muted)" }}>
                    <th style={th}>Received</th>
                    <th style={th}>Expiry</th>
                    <th style={th}>Status</th>
                    <th style={th}>Received Qty</th>
                    <th style={th}>On hand</th>
                    <th style={th}>Unit cost</th>
                  </tr>
                </thead>
                <tbody>
                  {lotsView.lots.map((lot) => {
                    const st = lotStatus(lot.expiryDate);
                    return (
                      <tr key={lot.id} style={{ borderTop: "1px solid var(--border)" }}>
                        <td style={td}>{fmtExpiry(lot.receivedAt)}</td>
                        <td style={td}>{fmtExpiry(lot.expiryDate)}</td>
                        <td style={{ ...td, color: st.color, fontWeight: 700 }}>{st.label}</td>
                        <td style={td}>{lot.quantityReceived}</td>
                        <td style={td}>{lot.quantityOnHand}</td>
                        <td style={td}>{lot.unitCost != null ? Number(lot.unitCost).toFixed(2) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
            <button
              type="button"
              className="btn-touch"
              style={{ background: "var(--surface2)" }}
              onClick={() => setLotsView({ productId: "", productName: "", branchId: "", lots: [], loading: false, error: "" })}
            >
              {t("common.close")}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const inp = {
  padding: 10,
  borderRadius: 0,
  border: "1px solid var(--border)",
  background: "var(--bg)",
  color: "var(--text)",
};
const th = { padding: 10 };
const td = { padding: 10 };
const lbl = { display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 };
