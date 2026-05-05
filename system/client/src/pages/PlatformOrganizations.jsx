import React, { useEffect, useState } from "react";
import { api } from "../api/client.js";
import { useI18n } from "../context/LanguageContext.jsx";

const inp = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 0,
  border: "1px solid var(--border)",
  background: "var(--surface)",
  color: "var(--text)",
  fontSize: 14,
};

const th = { padding: "8px 10px", textAlign: "start" };
const td = { padding: "8px 10px", verticalAlign: "middle" };

export default function PlatformOrganizations() {
  const { t } = useI18n();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [form, setForm] = useState({
    organizationName: "",
    organizationSlug: "",
    branchName: "",
    adminEmail: "",
    adminPassword: "",
    adminName: "",
  });
  const [editId, setEditId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editSlug, setEditSlug] = useState("");

  const load = () =>
    api("/api/platform/organizations")
      .then(setRows)
      .catch((e) => setErr(e.message || "Error"));

  useEffect(() => {
    setLoading(true);
    setErr("");
    load()
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const create = async (e) => {
    e.preventDefault();
    setErr("");
    await api("/api/platform/organizations", {
      method: "POST",
      body: {
        organizationName: form.organizationName,
        organizationSlug: form.organizationSlug,
        branchName: form.branchName || undefined,
        adminEmail: form.adminEmail,
        adminPassword: form.adminPassword,
        adminName: form.adminName,
      },
    });
    setForm({
      organizationName: "",
      organizationSlug: "",
      branchName: "",
      adminEmail: "",
      adminPassword: "",
      adminName: "",
    });
    await load();
  };

  const startEdit = (o) => {
    setEditId(o.id);
    setEditName(o.name);
    setEditSlug(o.slug || "");
  };

  const saveEdit = async () => {
    if (!editId) return;
    setErr("");
    await api(`/api/platform/organizations/${editId}`, {
      method: "PATCH",
      body: { name: editName, slug: editSlug },
    });
    setEditId(null);
    await load();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h1 style={{ margin: 0 }}>{t("platform.orgs")}</h1>
      <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>{t("platform.envHint")}</p>

      {err ? (
        <div className="card" style={{ color: "var(--danger, #c00)", fontSize: 14 }}>
          {err}
        </div>
      ) : null}

      <form className="card" onSubmit={create} style={{ display: "grid", gap: 10 }}>
        <strong>{t("platform.createOrg")}</strong>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 10,
          }}
        >
          <input
            placeholder={t("platform.orgName")}
            required
            value={form.organizationName}
            onChange={(e) => setForm({ ...form, organizationName: e.target.value })}
            style={inp}
          />
          <input
            placeholder={t("platform.slug")}
            required
            value={form.organizationSlug}
            onChange={(e) =>
              setForm({ ...form, organizationSlug: e.target.value.toLowerCase() })
            }
            style={inp}
          />
          <input
            placeholder={t("platform.branchName")}
            value={form.branchName}
            onChange={(e) => setForm({ ...form, branchName: e.target.value })}
            style={inp}
          />
          <input
            placeholder={t("platform.adminName")}
            required
            value={form.adminName}
            onChange={(e) => setForm({ ...form, adminName: e.target.value })}
            style={inp}
          />
          <input
            placeholder={t("platform.adminEmail")}
            type="email"
            required
            value={form.adminEmail}
            onChange={(e) => setForm({ ...form, adminEmail: e.target.value })}
            style={inp}
          />
          <input
            placeholder={t("platform.adminPassword")}
            type="password"
            required
            minLength={6}
            value={form.adminPassword}
            onChange={(e) => setForm({ ...form, adminPassword: e.target.value })}
            style={inp}
          />
        </div>
        <button type="submit" className="btn-touch" style={{ background: "var(--accent)", color: "#fff", maxWidth: 220 }}>
          {t("common.add")}
        </button>
      </form>

      <div className="card" style={{ overflowX: "auto" }}>
        {loading ? (
          <div style={{ padding: 16 }}>{t("common.loading")}</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ color: "var(--muted)", textAlign: "start" }}>
                <th style={th}>{t("platform.orgName")}</th>
                <th style={th}>{t("platform.slug")}</th>
                <th style={th}>{t("platform.branchesCount")}</th>
                <th style={th}>{t("platform.usersCount")}</th>
                <th style={th} />
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id} style={{ borderTop: "1px solid var(--border)" }}>
                  {editId === o.id ? (
                    <>
                      <td style={td}>
                        <input value={editName} onChange={(e) => setEditName(e.target.value)} style={inp} />
                      </td>
                      <td style={td}>
                        <input
                          value={editSlug}
                          onChange={(e) => setEditSlug(e.target.value.toLowerCase())}
                          style={inp}
                        />
                      </td>
                      <td style={td}>{o._count?.branches ?? "—"}</td>
                      <td style={td}>{o._count?.users ?? "—"}</td>
                      <td style={td}>
                        <button type="button" className="btn-touch" onClick={saveEdit} style={{ marginInlineEnd: 8 }}>
                          {t("platform.saveOrg")}
                        </button>
                        <button type="button" className="btn-touch" onClick={() => setEditId(null)}>
                          {t("common.cancel")}
                        </button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td style={td}>{o.name}</td>
                      <td style={td}>
                        <code style={{ fontSize: 12 }}>{o.slug || "—"}</code>
                      </td>
                      <td style={td}>{o._count?.branches ?? "—"}</td>
                      <td style={td}>{o._count?.users ?? "—"}</td>
                      <td style={td}>
                        <button type="button" className="btn-touch" onClick={() => startEdit(o)}>
                          {t("common.edit")}
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
