import React, { useEffect, useState } from "react";
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
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

const today = () => new Date().toISOString().slice(0, 10);

function FitMapBounds({ points }) {
  const map = useMap();
  useEffect(() => {
    if (!points?.length) return;
    const bounds = points.map((p) => [p.lat, p.lng]);
    map.fitBounds(bounds, { padding: [30, 30], maxZoom: 16 });
  }, [map, points]);
  return null;
}

export default function DeliveryRouting() {
  const { t, locale } = useI18n();
  const { user, isAdmin } = useAuth();
  const [branchId, setBranchId] = useState(user?.branchId || "");
  const [branches, setBranches] = useState([]);
  const [date, setDate] = useState(today());
  const [addressText, setAddressText] = useState("");
  const [priority, setPriority] = useState("0");
  const [windowStartMin, setWindowStartMin] = useState("");
  const [windowEndMin, setWindowEndMin] = useState("");
  const [driverName, setDriverName] = useState("");
  const [vehicleName, setVehicleName] = useState("");
  const [driverCount, setDriverCount] = useState("1");
  const [baseLat, setBaseLat] = useState("");
  const [baseLng, setBaseLng] = useState("");
  const [avgKmh, setAvgKmh] = useState("35");
  const [stopServiceMin, setStopServiceMin] = useState("5");
  const [orders, setOrders] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [msg, setMsg] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);

  const mapDirectionsLink = (fromLat, fromLng, toLat, toLng) => {
    if ([fromLat, fromLng, toLat, toLng].some((x) => x == null || Number.isNaN(Number(x)))) {
      return null;
    }
    return `https://www.google.com/maps/dir/?api=1&origin=${fromLat},${fromLng}&destination=${toLat},${toLng}&travelmode=driving`;
  };

  const load = async () => {
    const bid = branchId || user?.branchId;
    if (!bid) return;
    const q = new URLSearchParams();
    q.set("branchId", bid);
    q.set("date", date);
    const [os, rs] = await Promise.all([
      api(`/api/delivery/orders?${q.toString()}`),
      api(`/api/delivery/routes?branchId=${encodeURIComponent(bid)}&routeDate=${encodeURIComponent(date)}`),
    ]);
    setOrders(os || []);
    setRoutes(rs || []);
  };

  useEffect(() => {
    api("/api/branches")
      .then((b) => {
        setBranches(b || []);
        if (isAdmin && !branchId && b?.[0]?.id) setBranchId(b[0].id);
      })
      .catch(() => setBranches([]));
  }, [isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    load().catch(() => {});
  }, [branchId, user?.branchId, date]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!autoRefresh) return undefined;
    const id = setInterval(() => {
      load().catch(() => {});
    }, 15000);
    return () => clearInterval(id);
  }, [autoRefresh, branchId, user?.branchId, date]); // eslint-disable-line react-hooks/exhaustive-deps

  const createOrder = async (e) => {
    e.preventDefault();
    const bid = branchId || user?.branchId;
    if (!bid) return;
    setMsg("");
    try {
      await api("/api/delivery/orders", {
        method: "POST",
        body: {
          branchId: bid,
          scheduledDate: date,
          addressText,
          priority: Number(priority) || 0,
          windowStartMin: windowStartMin !== "" ? Number(windowStartMin) : undefined,
          windowEndMin: windowEndMin !== "" ? Number(windowEndMin) : undefined,
        },
      });
      setAddressText("");
      setPriority("0");
      setWindowStartMin("");
      setWindowEndMin("");
      await load();
      setMsg(t("delivery.msgOrderCreated"));
    } catch (x) {
      setMsg(x.message || t("delivery.msgOrderFail"));
    }
  };

  const buildRoute = async () => {
    const bid = branchId || user?.branchId;
    if (!bid) return;
    setMsg("");
    try {
      await api("/api/delivery/routes/build", {
        method: "POST",
        body: {
          branchId: bid,
          routeDate: date,
          driverName: driverName || undefined,
          vehicleName: vehicleName || undefined,
          driverCount: Number(driverCount) || 1,
          baseLat: baseLat !== "" ? Number(baseLat) : undefined,
          baseLng: baseLng !== "" ? Number(baseLng) : undefined,
          avgKmh: Number(avgKmh) || 35,
          stopServiceMin: Number(stopServiceMin) || 5,
        },
      });
      await load();
      setMsg(t("delivery.msgRouteBuilt"));
    } catch (x) {
      setMsg(x.message || t("delivery.msgRouteFail"));
    }
  };

  const setStopStatus = async (stopId, status) => {
    await api(`/api/delivery/stops/${stopId}`, {
      method: "PATCH",
      body: { status },
    });
    await load();
  };

  const reoptimizeRoute = async (routeId) => {
    await api(`/api/delivery/routes/${routeId}/reoptimize`, { method: "POST" });
    await load();
  };

  const activeRoute = routes[0] || null;

  const routeMap = React.useMemo(() => {
    if (!activeRoute) return null;
    const stopPoints = [...(activeRoute.stops || [])]
      .sort((a, b) => a.sequence - b.sequence)
      .map((s) => {
        const lat = Number(s.deliveryOrder?.lat);
        const lng = Number(s.deliveryOrder?.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        return {
          id: s.id,
          kind: "stop",
          seq: s.sequence,
          lat,
          lng,
          label: `#${s.sequence}`,
          status: s.status,
          address: s.deliveryOrder?.addressText || "",
        };
      })
      .filter(Boolean);
    const pts = [...stopPoints];
    const dl = Number(activeRoute.lastDriverLat);
    const dn = Number(activeRoute.lastDriverLng);
    const hasDriver = Number.isFinite(dl) && Number.isFinite(dn);
    if (hasDriver) {
      pts.push({ id: "driver", kind: "driver", seq: 0, lat: dl, lng: dn, label: "Driver" });
    }
    if (!pts.length) return null;
    const center = {
      lat: pts.reduce((acc, p) => acc + p.lat, 0) / pts.length,
      lng: pts.reduce((acc, p) => acc + p.lng, 0) / pts.length,
    };
    return { center, rendered: pts, pathStops: stopPoints };
  }, [activeRoute]);

  const updateDriverLocation = async (routeId) => {
    if (!navigator?.geolocation) {
      setMsg(t("delivery.msgGeoUnsupported"));
      return;
    }
    setMsg("");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          await api(`/api/delivery/routes/${routeId}/driver-location`, {
            method: "PATCH",
            body: { lat: pos.coords.latitude, lng: pos.coords.longitude },
          });
          await load();
          setMsg(t("delivery.msgDriverUpdated"));
        } catch (x) {
          setMsg(x.message || t("delivery.msgDriverFail"));
        }
      },
      (err) => {
        setMsg(err?.message || t("delivery.msgLocationFail"));
      },
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 10000 },
    );
  };

  const locTag = locale === "en" ? "en" : "ar";

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <h1 style={{ margin: 0 }}>{t("delivery.title")}</h1>
      <p style={{ margin: 0, color: "var(--muted)" }}>{t("delivery.intro")}</p>

      <div className="card" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end" }}>
        {isAdmin ? (
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>{t("pos.branch")}</span>
            <select value={branchId} onChange={(e) => setBranchId(e.target.value)} style={{ ...inp, minWidth: 180 }}>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
        ) : null}
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>{t("delivery.date")}</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inp} />
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 6, marginInlineStart: 8 }}>
          <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
          <span style={{ fontSize: 13, color: "var(--muted)" }}>{t("delivery.autoRefresh")}</span>
        </label>
      </div>

      <div className="card" style={{ display: "grid", gap: 8 }}>
        <strong>{t("delivery.mapTitle")}</strong>
        {!activeRoute ? (
          <div style={{ color: "var(--muted)" }}>{t("delivery.noRouteYet")}</div>
        ) : !routeMap ? (
          <div style={{ color: "var(--muted)" }}>{t("delivery.noCoordsMap")}</div>
        ) : (
          <div style={{ width: "100%" }}>
            <MapContainer
              center={[routeMap.center.lat, routeMap.center.lng]}
              zoom={13}
              style={{ width: "100%", height: 360, border: "1px solid var(--border)" }}
              scrollWheelZoom
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <FitMapBounds points={routeMap.rendered} />
              {routeMap.pathStops.length > 1 ? (
                <Polyline
                  positions={routeMap.pathStops.map((p) => [p.lat, p.lng])}
                  pathOptions={{ color: "#2563eb", weight: 4, opacity: 0.8 }}
                />
              ) : null}
              {routeMap.rendered.map((p) => (
                <CircleMarker
                  key={p.id}
                  center={[p.lat, p.lng]}
                  radius={p.kind === "driver" ? 9 : 7}
                  pathOptions={{
                    color: "#111827",
                    weight: 1,
                    fillColor: p.kind === "driver" ? "#ef4444" : "#10b981",
                    fillOpacity: 0.95,
                  }}
                >
                  <Tooltip direction="top" offset={[0, -8]} opacity={1}>
                    {p.kind === "driver"
                      ? t("delivery.tooltipDriver")
                      : t("delivery.tooltipStop", { label: p.label, address: p.address || "", status: p.status || "" })}
                  </Tooltip>
                </CircleMarker>
              ))}
            </MapContainer>
          </div>
        )}
      </div>

      <form className="card" onSubmit={createOrder} style={{ display: "grid", gap: 10 }}>
        <strong>{t("delivery.newOrderTitle")}</strong>
        <input
          style={inp}
          value={addressText}
          onChange={(e) => setAddressText(e.target.value)}
          placeholder={t("delivery.addressPlaceholder")}
        />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input type="number" min={0} max={10} value={priority} onChange={(e) => setPriority(e.target.value)} style={{ ...inp, width: 120 }} placeholder={t("delivery.priority")} />
          <input type="number" min={0} max={1439} value={windowStartMin} onChange={(e) => setWindowStartMin(e.target.value)} style={{ ...inp, width: 160 }} placeholder={t("delivery.windowStart")} />
          <input type="number" min={0} max={1439} value={windowEndMin} onChange={(e) => setWindowEndMin(e.target.value)} style={{ ...inp, width: 160 }} placeholder={t("delivery.windowEnd")} />
          <button type="submit" className="btn-touch" style={{ background: "var(--accent)", color: "#fff" }}>
            {t("delivery.createOrder")}
          </button>
        </div>
      </form>

      <div className="card" style={{ display: "grid", gap: 10 }}>
        <strong>{t("delivery.smartRouteTitle")}</strong>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input style={{ ...inp, minWidth: 180 }} placeholder={t("delivery.driverName")} value={driverName} onChange={(e) => setDriverName(e.target.value)} />
          <input style={{ ...inp, minWidth: 180 }} placeholder={t("delivery.vehicle")} value={vehicleName} onChange={(e) => setVehicleName(e.target.value)} />
          <input type="number" min={1} max={10} style={{ ...inp, width: 120 }} placeholder={t("delivery.drivers")} value={driverCount} onChange={(e) => setDriverCount(e.target.value)} />
          <input type="number" step="0.000001" style={{ ...inp, width: 150 }} placeholder={t("delivery.depotLat")} value={baseLat} onChange={(e) => setBaseLat(e.target.value)} />
          <input type="number" step="0.000001" style={{ ...inp, width: 150 }} placeholder={t("delivery.depotLng")} value={baseLng} onChange={(e) => setBaseLng(e.target.value)} />
          <input type="number" min={10} max={80} style={{ ...inp, width: 130 }} placeholder={t("delivery.avgKmh")} value={avgKmh} onChange={(e) => setAvgKmh(e.target.value)} />
          <input type="number" min={0} max={60} style={{ ...inp, width: 130 }} placeholder={t("delivery.stopMin")} value={stopServiceMin} onChange={(e) => setStopServiceMin(e.target.value)} />
          <button type="button" className="btn-touch" onClick={buildRoute}>
            {t("delivery.buildRoute")}
          </button>
        </div>
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        <strong>{t("delivery.ordersToday", { n: String(orders.length) })}</strong>
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10, fontSize: 13 }}>
          <thead>
            <tr style={{ color: "var(--muted)", textAlign: "start" }}>
              <th style={th}>{t("delivery.thAddress")}</th>
              <th style={th}>{t("delivery.thPriority")}</th>
              <th style={th}>{t("delivery.thStatus")}</th>
              <th style={th}>{t("delivery.thWindow")}</th>
              <th style={th}>{t("delivery.thRouteStop")}</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id}>
                <td style={td}>{o.addressText}</td>
                <td style={td}>{o.priority}</td>
                <td style={td}>{o.status}</td>
                <td style={td}>
                  {o.windowStartMin != null || o.windowEndMin != null
                    ? `${o.windowStartMin ?? "-"}..${o.windowEndMin ?? "-"}`
                    : "—"}
                </td>
                <td style={td}>{o.stop ? `#${o.stop.sequence}` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {routes.map((r) => (
        <div className="card" key={r.id} style={{ overflowX: "auto" }}>
          <strong>
            {t("delivery.routeHeader", {
              date: new Date(r.routeDate).toLocaleDateString(locTag),
              stops: String(r.totalStops ?? 0),
              driver: r.driverName || t("delivery.driverNA"),
            })}
          </strong>
          <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <button className="btn-touch" type="button" onClick={() => reoptimizeRoute(r.id)}>
              {t("delivery.reoptimize")}
            </button>
            <button className="btn-touch" type="button" onClick={() => updateDriverLocation(r.id)}>
              {t("delivery.updateDriverLocation")}
            </button>
            {r.lastDriverLat != null && r.lastDriverLng != null ? (
              <a
                href={`https://www.google.com/maps?q=${r.lastDriverLat},${r.lastDriverLng}`}
                target="_blank"
                rel="noreferrer"
              >
                {t("delivery.driverPin")}
              </a>
            ) : (
              <span style={{ color: "var(--muted)" }}>{t("delivery.noLiveYet")}</span>
            )}
            {r.lastDriverAt ? (
              <span style={{ color: "var(--muted)", fontSize: 12 }}>
                {t("delivery.updated")} {new Date(r.lastDriverAt).toLocaleTimeString(locTag)}
              </span>
            ) : null}
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10, fontSize: 13 }}>
            <thead>
              <tr style={{ color: "var(--muted)", textAlign: "start" }}>
                <th style={th}>{t("delivery.thSeq")}</th>
                <th style={th}>{t("delivery.thCustomer")}</th>
                <th style={th}>{t("delivery.thAddress")}</th>
                <th style={th}>{t("delivery.thStatus")}</th>
                <th style={th}>{t("delivery.thEta")}</th>
                <th style={th}>{t("delivery.thMap")}</th>
                <th style={th}>{t("delivery.thAction")}</th>
              </tr>
            </thead>
            <tbody>
              {r.stops.map((s) => (
                <tr key={s.id}>
                  <td style={td}>{s.sequence}</td>
                  <td style={td}>{s.customer?.name || "—"}</td>
                  <td style={td}>{s.deliveryOrder?.addressText || "—"}</td>
                  <td style={td}>{s.status}</td>
                  <td style={td}>{s.etaAt ? new Date(s.etaAt).toLocaleTimeString(locTag) : "—"}</td>
                  <td style={td}>
                    {(() => {
                      const link = mapDirectionsLink(
                        r.lastDriverLat,
                        r.lastDriverLng,
                        s.deliveryOrder?.lat,
                        s.deliveryOrder?.lng,
                      );
                      if (!link) return "—";
                      return (
                        <a href={link} target="_blank" rel="noreferrer">
                          {t("delivery.navigate")}
                        </a>
                      );
                    })()}
                  </td>
                  <td style={td}>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button className="btn-touch" type="button" onClick={() => setStopStatus(s.id, "OUT_FOR_DELIVERY")}>{t("delivery.stopOut")}</button>
                      <button className="btn-touch" type="button" onClick={() => setStopStatus(s.id, "DELIVERED")}>{t("delivery.stopDone")}</button>
                      <button className="btn-touch" type="button" onClick={() => setStopStatus(s.id, "FAILED")}>{t("delivery.stopFail")}</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      {msg ? <div style={{ color: "var(--muted)" }}>{msg}</div> : null}
    </div>
  );
}

const th = { padding: "8px 6px", borderBottom: "1px solid var(--border)" };
const td = { padding: "8px 6px", borderBottom: "1px solid var(--border)" };
