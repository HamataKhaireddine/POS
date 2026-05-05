import React, { useEffect, useState } from "react";
import { api } from "../api/client.js";
import { useI18n } from "../context/LanguageContext.jsx";
import { branchDisplayName } from "../utils/displayLabels.js";

export default function Branches() {
  const { t, locale } = useI18n();
  const [list, setList] = useState([]);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [supaEdits, setSupaEdits] = useState({});

  const load = () => api("/api/branches").then(setList);

  useEffect(() => {
    load().catch(() => {});
  }, []);

  useEffect(() => {
    const m = {};
    for (const b of list) {
      m[b.id] = b.supabaseId ?? "";
    }
    setSupaEdits(m);
  }, [list]);

  const add = async (e) => {
    e.preventDefault();
    await api("/api/branches", { method: "POST", body: { name, address } });
    setName("");
    setAddress("");
    await load();
  };

  const saveSupabase = async (id) => {
    const v = supaEdits[id];
    await api(`/api/branches/${id}`, {
      method: "PATCH",
      body: { supabaseId: v != null && String(v).trim() ? String(v).trim() : null },
    });
    await load();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 640 }}>
      <h1 style={{ margin: 0 }}>{t("branches.title")}</h1>

      <form className="card" onSubmit={add} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <strong>{t("branches.new")}</strong>
        <input
          placeholder={t("branches.name")}
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={inp}
        />
        <input placeholder={t("branches.address")} value={address} onChange={(e) => setAddress(e.target.value)} style={inp} />
        <button type="submit" className="btn-touch" style={{ background: "var(--accent)", color: "#fff", maxWidth: 200 }}>
          {t("common.add")}
        </button>
      </form>

      <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>{t("branches.supabaseHint")}</p>

      <ul className="card" style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {list.map((b) => (
          <li
            key={b.id}
            style={{
              padding: "12px 0",
              borderBottom: "1px solid var(--border)",
            }}
          >
            <div style={{ fontWeight: 800 }}>{branchDisplayName(b, locale)}</div>
            {b.address ? <div style={{ color: "var(--muted)", fontSize: 14 }}>{b.address}</div> : null}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10, alignItems: "center" }}>
              <input
                placeholder={t("branches.supabaseId")}
                value={supaEdits[b.id] ?? ""}
                onChange={(e) => setSupaEdits((prev) => ({ ...prev, [b.id]: e.target.value }))}
                style={{ ...inp, flex: 1, minWidth: 200 }}
              />
              <button type="button" className="btn-touch" style={{ background: "var(--surface2)" }} onClick={() => saveSupabase(b.id)}>
                {t("branches.saveSupabase")}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

const inp = {
  padding: 12,
  borderRadius: 0,
  border: "1px solid var(--border)",
  background: "var(--bg)",
  color: "var(--text)",
};
