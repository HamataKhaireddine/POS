import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api/client.js";
import { ProductCard } from "../components/ProductCard.jsx";
import { Cart } from "../components/Cart.jsx";
import { InvoicePrint } from "../components/InvoicePrint.jsx";
import {
  PAYMENT_METHOD_IDS,
  PaymentMethodIconGroup,
  PaymentSectionHeading,
  SPLIT_PAYMENT_METHOD_IDS,
  SplitPaymentToggle,
} from "../components/PaymentMethodControls.jsx";
import { useBarcodeScanner } from "../hooks/useBarcodeScanner.js";
import { useWholesaleCartStore } from "../store/wholesaleCartStore.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useOffline } from "../context/OfflineContext.jsx";
import { useI18n } from "../context/LanguageContext.jsx";
import { usePrintSettings } from "../context/PrintSettingsContext.jsx";
import {
  applyOfflineSaleToInventory,
  hydrateInventoryFromProducts,
  loadProductsForBranch,
  saveCustomers,
  saveProductsForBranch,
  loadCustomers,
} from "../offline/cache.js";
import { getOrCreateDeviceId, SYNC_TYPES } from "../offline/db.js";
import { enqueue } from "../offline/syncQueue.js";
import { buildOfflineSalePreview } from "../offline/offlineSale.js";
import { branchDisplayName } from "../utils/displayLabels.js";
import { buildReceiptPlainText } from "../utils/receiptText.js";
import { isUnitPriceAtOrBelowCost } from "../utils/saleCostWarning.js";

function round2(n) {
  return Math.round(n * 100) / 100;
}

export default function Wholesale() {
  const { classFor } = usePrintSettings();
  const { user } = useAuth();
  const { refreshPending } = useOffline();
  const { t, locale } = useI18n();
  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState(user?.branchId || "");
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState("");
  const [petFilter, setPetFilter] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [splitEnabled, setSplitEnabled] = useState(false);
  const [splitRows, setSplitRows] = useState([
    { method: "CASH", amount: "" },
    { method: "CARD", amount: "" },
  ]);
  const [loading, setLoading] = useState(false);
  const [lastSale, setLastSale] = useState(null);
  const [msg, setMsg] = useState("");
  const [customers, setCustomers] = useState([]);
  const [customerId, setCustomerId] = useState("");
  const [quickCustomerName, setQuickCustomerName] = useState("");
  const [discountInput, setDiscountInput] = useState("");
  const [taxPercent, setTaxPercent] = useState("0");
  const [holdLabel, setHoldLabel] = useState("");
  const [heldList, setHeldList] = useState([]);
  const [copyDone, setCopyDone] = useState(false);
  const [cartExpanded, setCartExpanded] = useState(false);
  const [payNowInput, setPayNowInput] = useState("");

  const items = useWholesaleCartStore((s) => s.items);
  const syncLinePricesFromProducts = useWholesaleCartStore((s) => s.syncLinePricesFromProducts);
  const addProduct = useWholesaleCartStore((s) => s.addProduct);
  const setQty = useWholesaleCartStore((s) => s.setQuantity);
  const removeLine = useWholesaleCartStore((s) => s.removeLine);
  const total = useWholesaleCartStore((s) => s.total());
  const cartSubtotal = total;
  const discountNum = Math.min(
    Math.max(0, Number.parseFloat(String(discountInput).replace(",", ".")) || 0),
    cartSubtotal
  );
  const afterDisc = Math.max(0, cartSubtotal - discountNum);
  const taxPctNum = Math.min(100, Math.max(0, Number.parseFloat(String(taxPercent).replace(",", ".")) || 0));
  const taxPreview = afterDisc * (taxPctNum / 100);
  const amountDue = round2(afterDisc + taxPreview);
  const clearCart = useWholesaleCartStore((s) => s.clear);
  const setBranchCart = useWholesaleCartStore((s) => s.setBranchId);
  const replaceAll = useWholesaleCartStore((s) => s.replaceAll);

  const hasBelowCostWarning = useMemo(
    () => items.some((line) => isUnitPriceAtOrBelowCost(line.unitPrice, line.cost)),
    [items]
  );

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === customerId),
    [customers, customerId]
  );

  const paymentMethodIds = useMemo(
    () => (customerId ? PAYMENT_METHOD_IDS : PAYMENT_METHOD_IDS.filter((m) => m !== "ON_ACCOUNT")),
    [customerId]
  );

  useEffect(() => {
    if (!customerId && paymentMethod === "ON_ACCOUNT") {
      setPaymentMethod("CASH");
    }
  }, [customerId, paymentMethod]);

  useEffect(() => {
    const offline = typeof navigator !== "undefined" && !navigator.onLine;
    if (offline) {
      loadCustomers()
        .then(setCustomers)
        .catch(() => setCustomers([]));
      return;
    }
    api("/api/customers")
      .then(async (list) => {
        setCustomers(list);
        await saveCustomers(list);
      })
      .catch(() => setCustomers([]));
  }, []);

  useEffect(() => {
    api("/api/branches")
      .then((bs) => {
        setBranches(bs);
        if (user?.role === "ADMIN" && !branchId && bs[0]) {
          setBranchId(bs[0].id);
        }
      })
      .catch(() => {});
  }, [user?.role]);

  useEffect(() => {
    const bid = branchId || user?.branchId;
    if (bid) setBranchCart(bid);
  }, [branchId, user?.branchId, setBranchCart]);

  const loadProducts = useCallback(async () => {
    const bid = branchId || user?.branchId;
    const q = new URLSearchParams();
    if (bid) q.set("branchId", bid);
    if (search) q.set("search", search);
    if (petFilter) q.set("petType", petFilter);
    const offline = typeof navigator !== "undefined" && !navigator.onLine;
    if (offline) {
      let list = await loadProductsForBranch(bid);
      if (search) {
        const s = search.toLowerCase();
        list = list.filter(
          (p) =>
            (p.name && p.name.toLowerCase().includes(s)) ||
            (p.nameEn && p.nameEn.toLowerCase().includes(s)) ||
            (p.sku && String(p.sku).toLowerCase().includes(s)) ||
            (p.barcode && String(p.barcode).toLowerCase().includes(s))
        );
      }
      if (petFilter) list = list.filter((p) => p.petType === petFilter);
      setProducts(list);
      return;
    }
    try {
      const list = await api(`/api/products?${q.toString()}`);
      setProducts(list);
      if (bid) {
        await saveProductsForBranch(bid, list);
        await hydrateInventoryFromProducts(bid, list);
      }
    } catch {
      const list = await loadProductsForBranch(bid);
      setProducts(list);
    }
  }, [branchId, user?.branchId, search, petFilter]);

  const loadHeldCarts = useCallback(async () => {
    const bid = branchId || user?.branchId;
    if (!bid) {
      setHeldList([]);
      return;
    }
    try {
      const q = new URLSearchParams();
      q.set("branchId", bid);
      const list = await api(`/api/held-carts?${q.toString()}`);
      setHeldList(list);
    } catch {
      setHeldList([]);
    }
  }, [branchId, user?.branchId]);

  useEffect(() => {
    loadProducts().catch(() => setProducts([]));
  }, [loadProducts]);

  useEffect(() => {
    if (products.length > 0) syncLinePricesFromProducts(products);
  }, [products, syncLinePricesFromProducts]);

  useEffect(() => {
    loadHeldCarts();
  }, [loadHeldCarts]);

  /** أجهزة متعددة: القائمة لا تُحدَّث تلقائياً من السيرفر إلا عند إعادة الجلب — نحدّث عند العودة للتبويب + دورياً */
  const lastSoftRefreshRef = useRef(0);
  const softRefreshCatalog = useCallback(() => {
    const now = Date.now();
    if (now - lastSoftRefreshRef.current < 2500) return;
    lastSoftRefreshRef.current = now;
    loadProducts().catch(() => {});
    loadHeldCarts().catch(() => {});
  }, [loadProducts, loadHeldCarts]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      softRefreshCatalog();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", softRefreshCatalog);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", softRefreshCatalog);
    };
  }, [softRefreshCatalog]);

  useEffect(() => {
    const id = setInterval(() => {
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      if (document.visibilityState !== "visible") return;
      softRefreshCatalog();
    }, 40000);
    return () => clearInterval(id);
  }, [softRefreshCatalog]);

  const onScan = useCallback(
    (code) => {
      const p = products.find((x) => x.barcode === code || x.sku === code);
      if (p) addProduct(p, 1);
      else setMsg(t("pos.barcodeMiss", { code }));
    },
    [products, addProduct, t]
  );

  useBarcodeScanner(onScan, true);

  const branchName = useMemo(() => {
    const bid = branchId || user?.branchId;
    const b = branches.find((br) => br.id === bid);
    return branchDisplayName(b, locale);
  }, [branches, branchId, user?.branchId, locale]);

  const fillRemainder = (idx) => {
    const due = amountDue;
    const others = splitRows.reduce((s, r, j) => {
      if (j === idx) return s;
      return s + round2(Number.parseFloat(String(r.amount).replace(",", ".")) || 0);
    }, 0);
    const rem = Math.max(0, round2(due - others));
    setSplitRows((rows) => rows.map((r, j) => (j === idx ? { ...r, amount: rem > 0 ? String(rem) : "" } : r)));
  };

  const addSplitRow = () => {
    setSplitRows((rows) => [...rows, { method: "ONLINE", amount: "" }]);
  };

  const holdCart = async () => {
    setMsg("");
    if (!items.length) {
      setMsg(t("pos.holdNeedItems"));
      return;
    }
    const bid = branchId || user?.branchId;
    if (!bid) return;
    setLoading(true);
    try {
      await api("/api/held-carts", {
        method: "POST",
        body: {
          branchId: bid,
          label: holdLabel.trim() || undefined,
          items: items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
          useWholesalePricing: true,
          customerId: customerId || undefined,
          discountInput,
          taxPercent,
        },
      });
      setHoldLabel("");
      clearCart();
      setCustomerId("");
      setDiscountInput("");
      setTaxPercent("0");
      setSplitEnabled(false);
      await loadHeldCarts();
      await loadProducts();
    } catch (e) {
      setMsg(e.message || t("pos.saleFailed"));
    } finally {
      setLoading(false);
    }
  };

  const restoreHeld = async (row) => {
    const p = row.payload;
    if (!p?.items?.length) return;
    setMsg("");
    replaceAll(p.items);
    setCustomerId(typeof p.customerId === "string" ? p.customerId : "");
    setDiscountInput(p.discountInput != null ? String(p.discountInput) : "");
    setTaxPercent(p.taxPercent != null ? String(p.taxPercent) : "0");
    setSplitEnabled(false);
    await loadProducts();
  };

  const deleteHeld = async (id) => {
    setMsg("");
    try {
      await api(`/api/held-carts/${id}`, { method: "DELETE" });
      await loadHeldCarts();
    } catch (e) {
      setMsg(e.message || t("pos.saleFailed"));
    }
  };

  const copyLastReceipt = async () => {
    if (!lastSale) return;
    const text = buildReceiptPlainText(lastSale, branchName, locale);
    try {
      await navigator.clipboard.writeText(text);
      setCopyDone(true);
      setTimeout(() => setCopyDone(false), 2000);
    } catch {
      setMsg(t("pos.saleFailed"));
    }
  };

  const checkout = async () => {
    setMsg("");
    if (!items.length) return;
    const bid = branchId || user?.branchId;

    let paymentSplits = undefined;
    if (splitEnabled) {
      const parsed = splitRows
        .map((r) => ({
          method: String(r.method || "CASH").toUpperCase(),
          amount: round2(Number.parseFloat(String(r.amount).replace(",", ".")) || 0),
        }))
        .filter((r) => r.amount > 0);
      if (parsed.length < 2) {
        setMsg(t("pos.splitMismatch"));
        return;
      }
      const sum = round2(parsed.reduce((s, x) => s + x.amount, 0));
      if (Math.abs(sum - amountDue) > 0.02) {
        setMsg(t("pos.splitMismatch"));
        return;
      }
      paymentSplits = parsed;
    }

    const body = {
      branchId: bid,
      customerId: customerId || undefined,
      discountAmount: discountNum > 0 ? discountNum : undefined,
      taxPercent: taxPctNum > 0 ? taxPctNum : undefined,
      saleChannel: "WHOLESALE",
      useWholesalePricing: true,
      items: items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
    };
    if (paymentSplits) {
      body.paymentSplits = paymentSplits;
    } else {
      body.paymentMethod = paymentMethod;
      if (
        !paymentSplits &&
        ["CASH", "CARD", "ONLINE"].includes(paymentMethod) &&
        payNowInput.trim() !== ""
      ) {
        body.amountPaid = round2(Number.parseFloat(String(payNowInput).replace(",", ".")) || 0);
      }
    }

    const offline = typeof navigator !== "undefined" && !navigator.onLine;
    if (offline) {
      const cached = await loadProductsForBranch(bid);
      if (cached.length === 0) {
        setMsg(t("offline.needCache"));
        return;
      }
      setLoading(true);
      try {
        const clientMutationId = crypto.randomUUID();
        const deviceId = await getOrCreateDeviceId();
        const payload = {
          ...body,
          clientMutationId,
          deviceId,
        };
        await enqueue(SYNC_TYPES.SALE, clientMutationId, payload);
        await applyOfflineSaleToInventory(
          bid,
          items.map((i) => ({ productId: i.productId, quantity: i.quantity }))
        );
        const cust = customerId ? customers.find((c) => c.id === customerId) : null;
        const preview = buildOfflineSalePreview({
          clientMutationId,
          branchName,
          cashierName: user?.name || "—",
          cartItems: items,
          total: round2(amountDue),
          discountAmount: discountNum,
          taxAmount: round2(taxPreview),
          paymentMethod,
          paymentSplits,
          customer: cust ? { id: cust.id, name: cust.name, phone: cust.phone || undefined } : null,
          saleChannel: "WHOLESALE",
        });
        setLastSale(preview);
        setCopyDone(false);
        clearCart();
        setCustomerId("");
        setDiscountInput("");
        setTaxPercent("0");
        setSplitEnabled(false);
        setSplitRows([
          { method: "CASH", amount: "" },
          { method: "CARD", amount: "" },
        ]);
        setMsg(t("offline.savedLocal"));
        setPayNowInput("");
        await refreshPending();
        await loadProducts();
        setTimeout(() => window.print(), 200);
      } catch (e) {
        setMsg(e.message || t("pos.saleFailed"));
      } finally {
        setLoading(false);
      }
      return;
    }

    setLoading(true);
    try {
      const sale = await api("/api/sales/checkout", {
        method: "POST",
        body,
      });
      setLastSale(sale);
      setCopyDone(false);
      clearCart();
      setCustomerId("");
      setDiscountInput("");
      setTaxPercent("0");
      setSplitEnabled(false);
      setSplitRows([
        { method: "CASH", amount: "" },
        { method: "CARD", amount: "" },
      ]);
      setPayNowInput("");
      await loadProducts();
      await loadHeldCarts();
      api("/api/customers")
        .then(setCustomers)
        .catch(() => {});
      setTimeout(() => window.print(), 200);
    } catch (e) {
      setMsg(e.message || t("pos.saleFailed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="pos-page-root wholesale-page-root">
      <div className="pos-top-bar">
        <h1 className="pos-top-bar__title">{t("wholesale.title")}</h1>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>{t("pos.branch")}</span>
          <select
            value={branchId || user?.branchId || ""}
            onChange={(e) => {
              setBranchId(e.target.value);
              clearCart();
            }}
            disabled={user?.role !== "ADMIN" && Boolean(user?.branchId)}
            style={{
              minHeight: 44,
              minWidth: 180,
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
        <input
          placeholder={t("pos.searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: 1,
            minWidth: 200,
            minHeight: 44,
            padding: "0 12px",
            borderRadius: 0,
            border: "1px solid var(--border)",
            background: "var(--bg)",
            color: "var(--text)",
          }}
        />
        <select
          value={petFilter}
          onChange={(e) => setPetFilter(e.target.value)}
          style={{
            minHeight: 44,
            padding: "8px 12px",
            borderRadius: 0,
            background: "var(--surface)",
            color: "var(--text)",
            border: "1px solid var(--border)",
          }}
        >
          <option value="">{t("pos.petAll")}</option>
          <option value="CAT">{t("pet.cat")}</option>
          <option value="DOG">{t("pet.dog")}</option>
          <option value="OTHER">{t("pet.other")}</option>
        </select>
        <button type="button" className="btn-touch" onClick={() => loadProducts()} style={{ background: "var(--surface2)" }}>
          {t("pos.refresh")}
        </button>
      </div>
      <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--muted)", fontWeight: 600 }}>
        {t("wholesale.subtitle")}
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr",
          gap: 16,
        }}
        className="pos-grid"
      >
        <style>{`
          @media (min-width: 960px) {
            .pos-grid { grid-template-columns: 1.4fr 0.9fr !important; align-items: stretch !important; }
          }
        `}</style>
        <div className="pos-products-frame">
          <div className="grid-products">
            {products.map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                useWholesalePricing
                onAdd={(x) => addProduct(x, 1)}
              />
            ))}
          </div>
        </div>
        <div className="pos-checkout-column">
          <div className="pos-column-scroll">
          <div
            className="card pos-cart-wrap"
            style={{
              display: "flex",
              flexDirection: "column",
              maxHeight: cartExpanded ? "62vh" : 320,
              minHeight: 160,
              overflow: "hidden",
            }}
          >
            <div
              className="pos-cart-wrap__head"
              onClick={() => setCartExpanded((v) => !v)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setCartExpanded((v) => !v);
                }
              }}
              role="button"
              tabIndex={0}
              title={cartExpanded ? "تصغير السلة" : "تكبير السلة"}
            >
              <strong>{t("wholesale.cartTitle")}</strong>
              <span style={{ fontSize: 12, color: "var(--muted)" }}>
                {cartExpanded ? "−" : "+"} ({items.length})
              </span>
            </div>
            {hasBelowCostWarning ? (
              <div
                role="status"
                style={{
                  padding: "8px 12px",
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--warning)",
                  background: "color-mix(in srgb, var(--warning) 14%, transparent)",
                  borderBottom: "1px solid color-mix(in srgb, var(--warning) 35%, transparent)",
                }}
              >
                {t("pos.belowCostBanner")}
              </div>
            ) : null}
            <div className="pos-cart-wrap__body">
              <Cart
                embedded
                lines={items}
                onChangeQty={(id, v) => setQty(id, Number(v))}
                onRemove={removeLine}
                total={cartSubtotal}
              />
            </div>
          </div>

          <div className="card">
            <div style={{ fontWeight: 800, marginBottom: 8 }}>{t("pos.heldList")}</div>
            {heldList.length === 0 ? (
              <div style={{ color: "var(--muted)", fontSize: 14 }}>{t("pos.heldEmpty")}</div>
            ) : (
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                {heldList.map((h) => (
                  <li
                    key={h.id}
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 8,
                      alignItems: "center",
                      padding: "8px 0",
                      borderBottom: "1px solid var(--border)",
                    }}
                  >
                    <span style={{ flex: "1 1 140px", fontSize: 14 }}>
                      {h.label || `#${h.id.slice(0, 8)}`}
                      <span style={{ color: "var(--muted)", marginInlineStart: 8 }}>
                        {Number(h.subtotal).toFixed(2)} {t("common.currency")} · {h.lineCount}{" "}
                        {locale === "en" ? "lines" : "سطر"}
                      </span>
                    </span>
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>{h.user?.name || "—"}</span>
                    <button type="button" className="btn-touch" style={{ background: "var(--accent)", color: "#fff" }} onClick={() => restoreHeld(h)}>
                      {t("pos.heldRestore")}
                    </button>
                    <button type="button" className="btn-touch" style={{ background: "var(--danger)", color: "#fff" }} onClick={() => deleteHeld(h.id)}>
                      {t("pos.heldDelete")}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
              <input
                placeholder={t("pos.holdLabel")}
                value={holdLabel}
                onChange={(e) => setHoldLabel(e.target.value)}
                style={{
                  minHeight: 44,
                  padding: "0 12px",
                  borderRadius: 0,
                  border: "1px solid var(--border)",
                  background: "var(--bg)",
                  color: "var(--text)",
                }}
              />
              <button
                type="button"
                className="btn-touch"
                disabled={loading || !items.length}
                onClick={holdCart}
                style={{ background: "var(--surface2)", maxWidth: 280 }}
              >
                {t("pos.holdCart")} / {t("pos.holdSave")}
              </button>
            </div>
          </div>

          <div className="card">
            <div style={{ fontWeight: 800, marginBottom: 8 }}>{t("pos.customer")}</div>
            <select
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              style={{
                width: "100%",
                minHeight: 44,
                marginBottom: 10,
                padding: "8px 12px",
                borderRadius: 0,
                background: "var(--surface)",
                color: "var(--text)",
                border: "1px solid var(--border)",
              }}
            >
              <option value="">{t("pos.walkIn")}</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.phone ? ` — ${c.phone}` : ""}
                </option>
              ))}
            </select>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
              <input
                placeholder={t("pos.quickCustomer")}
                value={quickCustomerName}
                onChange={(e) => setQuickCustomerName(e.target.value)}
                style={{
                  flex: 1,
                  minWidth: 140,
                  minHeight: 44,
                  padding: "0 12px",
                  borderRadius: 0,
                  border: "1px solid var(--border)",
                  background: "var(--bg)",
                  color: "var(--text)",
                }}
              />
              <button
                type="button"
                className="btn-touch"
                disabled={!quickCustomerName.trim()}
                onClick={async () => {
                  const name = quickCustomerName.trim();
                  if (!name) return;
                  setMsg("");
                  try {
                    const c = await api("/api/customers", { method: "POST", body: { name } });
                    setCustomers((prev) => [...prev, c].sort((a, b) => a.name.localeCompare(b.name)));
                    setCustomerId(c.id);
                    setQuickCustomerName("");
                  } catch (e) {
                    setMsg(e.message || t("pos.saleFailed"));
                  }
                }}
                style={{ background: "var(--surface2)" }}
              >
                {t("pos.quickCustomerBtn")}
              </button>
            </div>
            {selectedCustomer && selectedCustomer.accountBalance != null ? (
              <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 8 }}>
                {t("receivable.balance")}:{" "}
                <strong>{Number(selectedCustomer.accountBalance).toFixed(2)}</strong> {t("common.currency")}
              </div>
            ) : null}
            <PaymentSectionHeading t={t} />
            <SplitPaymentToggle
              enabled={splitEnabled}
              onChange={(v) => {
                setSplitEnabled(v);
                setPayNowInput("");
                setMsg("");
              }}
              t={t}
            />
            {!splitEnabled ? (
              <>
                <PaymentMethodIconGroup
                  value={paymentMethod}
                  onChange={(m) => {
                    setPaymentMethod(m);
                    setPayNowInput("");
                    setMsg("");
                  }}
                  t={t}
                  methodIds={paymentMethodIds}
                />
                {customerId && ["CASH", "CARD", "ONLINE"].includes(paymentMethod) ? (
                  <label style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 10 }}>
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>{t("pos.payNowPartial")}</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={payNowInput}
                      onChange={(e) => setPayNowInput(e.target.value)}
                      placeholder={String(amountDue)}
                      style={{
                        minHeight: 44,
                        padding: "0 12px",
                        borderRadius: 0,
                        border: "1px solid var(--border)",
                        background: "var(--bg)",
                        color: "var(--text)",
                      }}
                    />
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>
                      {t("pos.payNowHint", { total: amountDue.toFixed(2) })}
                    </span>
                  </label>
                ) : null}
              </>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 12 }}>
                {splitRows.map((row, idx) => (
                  <div key={idx} className="pos-split-row">
                    <PaymentMethodIconGroup
                      compact
                      methodIds={SPLIT_PAYMENT_METHOD_IDS}
                      value={row.method}
                      onChange={(m) => {
                        setSplitRows((rows) => rows.map((r, j) => (j === idx ? { ...r, method: m } : r)));
                      }}
                      t={t}
                    />
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder={t("pos.splitAmount")}
                      value={row.amount}
                      onChange={(e) => {
                        const v = e.target.value;
                        setSplitRows((rows) => rows.map((r, j) => (j === idx ? { ...r, amount: v } : r)));
                      }}
                      style={{
                        minHeight: 44,
                        minWidth: 100,
                        padding: "0 12px",
                        borderRadius: 0,
                        border: "1px solid var(--border)",
                        background: "var(--bg)",
                        color: "var(--text)",
                      }}
                    />
                    <button type="button" className="btn-touch" style={{ background: "var(--surface2)" }} onClick={() => fillRemainder(idx)}>
                      {t("pos.splitRemainder")}
                    </button>
                    {splitRows.length > 2 ? (
                      <button
                        type="button"
                        className="btn-touch"
                        style={{ background: "var(--danger)", color: "#fff" }}
                        onClick={() => setSplitRows((rows) => rows.filter((_, j) => j !== idx))}
                      >
                        {t("common.delete")}
                      </button>
                    ) : null}
                  </div>
                ))}
                <button type="button" className="btn-touch" style={{ background: "var(--surface2)", maxWidth: 220 }} onClick={addSplitRow}>
                  {t("pos.splitAdd")}
                </button>
                <div style={{ fontSize: 13, color: "var(--muted)" }}>
                  {t("pos.afterDiscount")}: {amountDue.toFixed(2)} {t("common.currency")}
                </div>
              </div>
            )}
            <label style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
              <span style={{ fontSize: 12, color: "var(--muted)" }}>{t("pos.discountLabel")}</span>
              <input
                type="text"
                inputMode="decimal"
                value={discountInput}
                onChange={(e) => setDiscountInput(e.target.value)}
                placeholder="0"
                style={{
                  minHeight: 44,
                  padding: "0 12px",
                  borderRadius: 0,
                  border: "1px solid var(--border)",
                  background: "var(--bg)",
                  color: "var(--text)",
                }}
              />
            </label>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 14 }}>
              <span>{t("pos.subtotal")}</span>
              <span>
                {cartSubtotal.toFixed(2)} {t("common.currency")}
              </span>
            </div>
            {discountNum > 0 ? (
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 14, color: "var(--muted)" }}>
                <span>{t("invoice.discount")}</span>
                <span>
                  −{discountNum.toFixed(2)} {t("common.currency")}
                </span>
              </div>
            ) : null}
            <label style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: "var(--muted)" }}>
                {t("pos.taxPercent")} — {t("pos.taxHint")}
              </span>
              <select
                value={taxPercent}
                onChange={(e) => setTaxPercent(e.target.value)}
                style={{
                  minHeight: 44,
                  padding: "8px 12px",
                  borderRadius: 0,
                  background: "var(--surface)",
                  color: "var(--text)",
                  border: "1px solid var(--border)",
                }}
              >
                <option value="0">0%</option>
                <option value="5">5%</option>
                <option value="15">15%</option>
              </select>
            </label>
            {taxPreview > 0 ? (
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 14 }}>
                <span>{t("invoice.tax")}</span>
                <span>
                  {taxPreview.toFixed(2)} {t("common.currency")}
                </span>
              </div>
            ) : null}
          </div>

          {lastSale ? (
            <div className="card pos-last-sale-actions">
              <div style={{ fontWeight: 800, marginBottom: 8 }}>{t("invoice.copyHint")}</div>
              <p style={{ margin: "0 0 10px", fontSize: 13, color: "var(--muted)" }}>{t("pos.thermalHint")}</p>
              <button type="button" className="btn-touch" style={{ background: "var(--surface2)", maxWidth: 320 }} onClick={copyLastReceipt}>
                {copyDone ? t("pos.receiptCopied") : t("pos.copyReceipt")}
              </button>
            </div>
          ) : null}
          </div>

          <div className="pos-checkout-dock" aria-label={t("wholesale.checkout")}>
            <div className="pos-checkout-dock__total">
              <span>{t("pos.afterDiscount")}</span>
              <span>
                {amountDue.toFixed(2)} {t("common.currency")}
              </span>
            </div>
            {items.length > 0 ? (
              <div className="pos-checkout-dock__hint">
                {items.length} {locale === "en" ? "lines" : "سطر"} · {t("pos.subtotal")}{" "}
                {cartSubtotal.toFixed(2)} {t("common.currency")}
              </div>
            ) : null}
            {msg ? <div className="pos-checkout-dock__msg">{msg}</div> : null}
            <button
              type="button"
              className="btn-touch pos-checkout-dock__btn"
              disabled={loading || !items.length}
              onClick={checkout}
            >
              {loading ? t("pos.processing") : t("wholesale.checkout")}
            </button>
          </div>
        </div>
      </div>

      <div
        className={`print-invoice ${classFor("wholesale")}`}
        style={{ position: "fixed", left: -99999, top: 0, width: 400 }}
      >
        <InvoicePrint sale={lastSale} branchName={branchName} />
      </div>
    </div>
  );
}
