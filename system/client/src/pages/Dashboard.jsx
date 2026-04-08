import React, { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
} from "recharts";
import { api } from "../api/client.js";
import { DashboardCard } from "../components/DashboardCard.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useI18n } from "../context/LanguageContext.jsx";
import { branchDisplayName } from "../utils/displayLabels.js";

export default function Dashboard() {
  const { user } = useAuth();
  const { t, locale } = useI18n();
  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState(user?.branchId || "");
  const [summary, setSummary] = useState(null);
  const [byProduct, setByProduct] = useState([]);
  const [byBranch, setByBranch] = useState([]);
  const [monthly, setMonthly] = useState([]);

  useEffect(() => {
    api("/api/branches").then(setBranches).catch(() => {});
  }, []);

  useEffect(() => {
    const q = branchId ? `?branchId=${branchId}` : "";
    const run = async () => {
      const [s, p, m] = await Promise.all([
        api(`/api/dashboard/summary${q}`),
        api(`/api/dashboard/sales-by-product${q}`),
        api(`/api/dashboard/monthly-profit${q}`),
      ]);
      setSummary(s);
      setByProduct(p);
      setMonthly(m);
      if (user?.role === "ADMIN") {
        const b = await api("/api/dashboard/sales-by-branch");
        setByBranch(b);
      } else {
        setByBranch([]);
      }
    };
    run().catch(() => {});
  }, [branchId, user?.role]);

  const cur = (v) => `${Number(v).toFixed(2)} ${t("common.currency")}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
        <h1 style={{ margin: 0 }}>{t("dashboard.title")}</h1>
        {user?.role === "ADMIN" ? (
          <select
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            style={{
              minHeight: 44,
              padding: "8px 12px",
              borderRadius: 10,
              background: "var(--surface)",
              color: "var(--text)",
              border: "1px solid var(--border)",
            }}
          >
            <option value="">{t("dashboard.allBranches")}</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {branchDisplayName(b, locale)}
              </option>
            ))}
          </select>
        ) : null}
      </div>

      {summary ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: 12,
          }}
        >
          <DashboardCard title={t("dashboard.salesTodayCount")} value={String(summary.salesTodayCount)} />
          <DashboardCard
            title={t("dashboard.salesTodayValue")}
            value={cur(summary.salesTodayTotal)}
            accent="var(--success)"
          />
          <DashboardCard title={t("dashboard.monthTotal")} value={cur(summary.salesMonthTotal)} />
          <DashboardCard
            title={t("dashboard.profitMonth")}
            value={`${summary.estimatedProfitMonth} ${t("common.currency")}`}
            hint={t("dashboard.profitHint")}
            accent="var(--accent2)"
          />
          <DashboardCard
            title={t("dashboard.lowStock")}
            value={String(summary.lowStockAlerts)}
            accent="var(--warning)"
          />
        </div>
      ) : (
        <div className="card">{t("common.loading")}</div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: 16,
        }}
      >
        <div className="card" style={{ minHeight: 320 }}>
          <div style={{ fontWeight: 800, marginBottom: 12 }}>{t("dashboard.chartByProduct")}</div>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={byProduct}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
              <XAxis dataKey="name" tick={{ fill: "var(--muted)", fontSize: 10 }} />
              <YAxis tick={{ fill: "var(--muted)" }} />
              <Tooltip
                contentStyle={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  color: "var(--text)",
                }}
                formatter={(v) => [cur(v), t("dashboard.tooltipSales")]}
              />
              <Bar dataKey="value" fill="var(--accent)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {user?.role === "ADMIN" && byBranch.length ? (
          <div className="card" style={{ minHeight: 320 }}>
            <div style={{ fontWeight: 800, marginBottom: 12 }}>{t("dashboard.chartByBranch")}</div>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={byBranch}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                <XAxis dataKey="name" tick={{ fill: "var(--muted)", fontSize: 11 }} />
                <YAxis tick={{ fill: "var(--muted)" }} />
                <Tooltip
                  contentStyle={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    color: "var(--text)",
                  }}
                  formatter={(v) => [cur(v), t("dashboard.tooltipSales")]}
                />
                <Bar dataKey="value" fill="var(--accent2)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : null}

        <div className="card" style={{ minHeight: 320 }}>
          <div style={{ fontWeight: 800, marginBottom: 12 }}>{t("dashboard.chartProfit")}</div>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={monthly}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
              <XAxis dataKey="label" tick={{ fill: "var(--muted)", fontSize: 10 }} />
              <YAxis tick={{ fill: "var(--muted)" }} />
              <Tooltip
                contentStyle={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  color: "var(--text)",
                }}
                formatter={(v) => [cur(v), t("dashboard.tooltipProfit")]}
              />
              <Line type="monotone" dataKey="profit" stroke="var(--success)" strokeWidth={2} dot />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
