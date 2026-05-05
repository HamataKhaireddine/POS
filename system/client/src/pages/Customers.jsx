import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useI18n } from "../context/LanguageContext.jsx";
import { isVerticalFeatureEnabled } from "../lib/verticalFeatures.js";

const inp = {
  padding: 12,
  borderRadius: 0,
  border: "1px solid var(--border)",
  background: "var(--bg)",
  color: "var(--text)",
};

export default function Customers() {
  const { t } = useI18n();
  const { isAdmin, isManager, user } = useAuth();
  const showReceivable = isVerticalFeatureEnabled("customerAccounts", user?.businessVertical);
  const [list, setList] = useState([]);
  const [q, setQ] = useState("");
  const [form, setForm] = useState({ name: "", phone: "", email: "", notes: "" });
  const [editing, setEditing] = useState(null);
  const [msg, setMsg] = useState("");

  const load = () => {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    return api(`/api/customers?${params.toString()}`).then(setList);
  };

  useEffect(() => {
    load().catch(() => setList([]));
  }, [q]);

  const create = async (e) => {
    e.preventDefault();
    setMsg("");
    try {
      await api("/api/customers", { method: "POST", body: form });
      setForm({ name: "", phone: "", email: "", notes: "" });
      await load();
      setMsg(t("customers.created"));
    } catch (x) {
      setMsg(x.message || t("customers.saveFailed"));
    }
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    if (!editing) return;
    setMsg("");
    try {
      await api(`/api/customers/${editing.id}`, {
        method: "PATCH",
        body: {
          name: editing.name,
          phone: editing.phone || null,
          email: editing.email || null,
          notes: editing.notes || null,
        },
      });
      setEditing(null);
      await load();
      setMsg(t("customers.saved"));
    } catch (x) {
      setMsg(x.message || t("customers.saveFailed"));
    }
  };

  const del = async (id) => {
    if (!confirm(t("customers.confirmDelete"))) return;
    setMsg("");
    try {
      await api(`/api/customers/${id}`, { method: "DELETE" });
      await load();
      setMsg(t("customers.deleted"));
    } catch (x) {
      setMsg(x.message || t("customers.deleteFailed"));
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h1 style={{ margin: 0 }}>{t("customers.title")}</h1>

      <div className="card" style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        <input
          placeholder={t("customers.search")}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ ...inp, flex: 1, minWidth: 200 }}
        />
      </div>

      <form className="card" onSubmit={create} style={{ display: "grid", gap: 10 }}>
        <strong>{t("customers.quickAdd")}</strong>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
          <input
            placeholder={t("customers.name")}
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            style={inp}
          />
          <input
            placeholder={t("customers.phone")}
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            style={inp}
          />
          <input
            placeholder={t("customers.email")}
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            style={inp}
          />
          <input
            placeholder={t("customers.notes")}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            style={inp}
          />
        </div>
        <button type="submit" className="btn-touch" style={{ background: "var(--accent)", color: "#fff", maxWidth: 200 }}>
          {t("common.add")}
        </button>
      </form>

      {msg ? <div style={{ color: "var(--muted)" }}>{msg}</div> : null}

      <div className="card" style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ color: "var(--muted)", textAlign: "start" }}>
              <th style={th}>{t("customers.name")}</th>
              <th style={th}>{t("customers.phone")}</th>
              <th style={th}>{t("customers.colBalance")}</th>
              <th style={th}>{t("customers.email")}</th>
              <th style={th}>{t("customers.notes")}</th>
              {showReceivable ? <th style={th}>{t("customers.receivable")}</th> : null}
              {isManager ? <th style={th} /> : null}
            </tr>
          </thead>
          <tbody>
            {list.map((c) =>
              editing?.id === c.id ? (
                <tr key={c.id}>
                  <td style={td}>
                    <input
                      value={editing.name}
                      onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                      style={inp}
                    />
                  </td>
                  <td style={td}>
                    <input
                      value={editing.phone || ""}
                      onChange={(e) => setEditing({ ...editing, phone: e.target.value })}
                      style={inp}
                    />
                  </td>
                  <td style={td}>—</td>
                  <td style={td}>
                    <input
                      value={editing.email || ""}
                      onChange={(e) => setEditing({ ...editing, email: e.target.value })}
                      style={inp}
                    />
                  </td>
                  <td style={td}>
                    <input
                      value={editing.notes || ""}
                      onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
                      style={inp}
                    />
                  </td>
                  {showReceivable ? <td style={td}>—</td> : null}
                  {isManager ? (
                    <td style={td}>
                      <form onSubmit={saveEdit} style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <button type="submit" className="btn-touch" style={{ background: "var(--accent)", color: "#fff" }}>
                          {t("common.save")}
                        </button>
                        <button type="button" className="btn-touch" onClick={() => setEditing(null)}>
                          {t("common.cancel")}
                        </button>
                      </form>
                    </td>
                  ) : null}
                </tr>
              ) : (
                <tr key={c.id}>
                  <td style={td}>{c.name}</td>
                  <td style={td}>{c.phone || "—"}</td>
                  <td style={td}>{Number(c.accountBalance ?? 0).toFixed(2)}</td>
                  <td style={td}>{c.email || "—"}</td>
                  <td style={td}>{c.notes || "—"}</td>
                  {showReceivable ? (
                    <td style={td}>
                      <Link to={`/customer-accounts/${c.id}`} style={{ fontSize: 13 }}>
                        {t("receivable.open")}
                      </Link>
                    </td>
                  ) : null}
                  {isManager ? (
                    <td style={td}>
                      <button type="button" className="btn-touch" onClick={() => setEditing({ ...c })}>
                        {t("common.edit")}
                      </button>
                      {isAdmin ? (
                        <button
                          type="button"
                          className="btn-touch"
                          onClick={() => del(c.id)}
                          style={{ marginInlineStart: 8, color: "var(--danger)" }}
                        >
                          {t("common.delete")}
                        </button>
                      ) : null}
                    </td>
                  ) : null}
                </tr>
              )
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const th = { padding: "8px 6px", borderBottom: "1px solid var(--border)" };
const td = { padding: "8px 6px", borderBottom: "1px solid var(--border)", verticalAlign: "top" };
