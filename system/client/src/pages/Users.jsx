import React, { useEffect, useState } from "react";
import { api } from "../api/client.js";
import { useI18n } from "../context/LanguageContext.jsx";
import { branchDisplayName } from "../utils/displayLabels.js";

export default function Users() {
  const { t, locale } = useI18n();
  const [users, setUsers] = useState([]);
  const [branches, setBranches] = useState([]);
  const [form, setForm] = useState({
    email: "",
    password: "",
    name: "",
    role: "CASHIER",
    branchId: "",
  });

  const load = () => api("/api/users").then(setUsers);

  useEffect(() => {
    load().catch(() => {});
    api("/api/branches").then(setBranches).catch(() => {});
  }, []);

  const create = async (e) => {
    e.preventDefault();
    await api("/api/users", { method: "POST", body: { ...form, branchId: form.branchId || null } });
    setForm({ email: "", password: "", name: "", role: "CASHIER", branchId: "" });
    await load();
  };

  const updateRole = async (u, role) => {
    await api(`/api/users/${u.id}`, { method: "PATCH", body: { role } });
    await load();
  };

  const del = async (id) => {
    if (!confirm(t("users.confirmDelete"))) return;
    await api(`/api/users/${id}`, { method: "DELETE" });
    await load();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h1 style={{ margin: 0 }}>{t("users.title")}</h1>

      <form className="card" onSubmit={create} style={{ display: "grid", gap: 10 }}>
        <strong>{t("users.newUser")}</strong>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
          <input
            placeholder={t("products.name")}
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            style={inp}
          />
          <input
            placeholder={t("login.email")}
            type="email"
            required
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            style={inp}
          />
          <input
            placeholder={t("login.password")}
            type="password"
            required
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            style={inp}
          />
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} style={inp}>
            <option value="ADMIN">Admin</option>
            <option value="MANAGER">Manager</option>
            <option value="CASHIER">Cashier</option>
          </select>
          <select value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })} style={inp}>
            <option value="">{t("users.noBranch")}</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {branchDisplayName(b, locale)}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn-touch" style={{ background: "var(--accent)", color: "#fff", maxWidth: 200 }}>
          {t("common.add")}
        </button>
      </form>

      <div className="card" style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ color: "var(--muted)", textAlign: "start" }}>
              <th style={th}>{t("products.name")}</th>
              <th style={th}>{t("login.email")}</th>
              <th style={th}>{t("users.colRole")}</th>
              <th style={th}>{t("products.branch")}</th>
              <th style={th} />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} style={{ borderTop: "1px solid var(--border)" }}>
                <td style={td}>{u.name}</td>
                <td style={td}>{u.email}</td>
                <td style={td}>
                  <select
                    value={u.role}
                    onChange={(e) => updateRole(u, e.target.value)}
                    style={{ ...inp, minWidth: 120 }}
                  >
                    <option value="ADMIN">Admin</option>
                    <option value="MANAGER">Manager</option>
                    <option value="CASHIER">Cashier</option>
                  </select>
                  <span style={{ fontSize: 11, color: "var(--muted)", marginInlineStart: 8 }}>
                    ({t(`role.${u.role}`)})
                  </span>
                </td>
                <td style={td}>{u.branch?.name || t("common.none")}</td>
                <td style={td}>
                  <button type="button" className="btn-touch" style={{ background: "var(--danger)" }} onClick={() => del(u.id)}>
                    {t("common.delete")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
