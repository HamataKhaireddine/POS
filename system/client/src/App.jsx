import React from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./context/AuthContext.jsx";
import { useI18n } from "./context/LanguageContext.jsx";
import { AppLayout } from "./components/layout/AppLayout.jsx";
import Login from "./pages/Login.jsx";
import POS from "./pages/POS.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Products from "./pages/Products.jsx";
import Users from "./pages/Users.jsx";
import Sync from "./pages/Sync.jsx";
import Branches from "./pages/Branches.jsx";
import Customers from "./pages/Customers.jsx";
import Returns from "./pages/Returns.jsx";
import Purchases from "./pages/Purchases.jsx";
import Transfer from "./pages/Transfer.jsx";
import Count from "./pages/Count.jsx";
import Cash from "./pages/Cash.jsx";
import Audit from "./pages/Audit.jsx";

function Protected({ children, roles }) {
  const { user, loading } = useAuth();
  const { t } = useI18n();
  if (loading) {
    return (
      <div style={{ padding: 24, textAlign: "center" }}>
        {t("common.loading")}
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/pos" replace />;
  }
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <Protected>
            <AppLayout />
          </Protected>
        }
      >
        <Route path="/" element={<Navigate to="/pos" replace />} />
        <Route path="/pos" element={<POS />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/products" element={<Products />} />
        <Route path="/customers" element={<Customers />} />
        <Route
          path="/users"
          element={
            <Protected roles={["ADMIN"]}>
              <Users />
            </Protected>
          }
        />
        <Route
          path="/branches"
          element={
            <Protected roles={["ADMIN"]}>
              <Branches />
            </Protected>
          }
        />
        <Route
          path="/sync"
          element={
            <Protected roles={["ADMIN", "MANAGER"]}>
              <Sync />
            </Protected>
          }
        />
        <Route
          path="/returns"
          element={
            <Protected roles={["ADMIN", "MANAGER"]}>
              <Returns />
            </Protected>
          }
        />
        <Route
          path="/purchases"
          element={
            <Protected roles={["ADMIN", "MANAGER"]}>
              <Purchases />
            </Protected>
          }
        />
        <Route
          path="/transfer"
          element={
            <Protected roles={["ADMIN", "MANAGER"]}>
              <Transfer />
            </Protected>
          }
        />
        <Route
          path="/count"
          element={
            <Protected roles={["ADMIN", "MANAGER"]}>
              <Count />
            </Protected>
          }
        />
        <Route path="/cash" element={<Cash />} />
        <Route
          path="/audit"
          element={
            <Protected roles={["ADMIN", "MANAGER"]}>
              <Audit />
            </Protected>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/pos" replace />} />
    </Routes>
  );
}
