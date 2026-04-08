import React from "react";

/**
 * بطاقة إحصائية سريعة للوحة التحكم
 */
export function DashboardCard({ title, value, hint, accent = "var(--accent)" }) {
  return (
    <div className="card" style={{ borderRight: `4px solid ${accent}` }}>
      <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.5 }}>{value}</div>
      {hint ? (
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>{hint}</div>
      ) : null}
    </div>
  );
}
