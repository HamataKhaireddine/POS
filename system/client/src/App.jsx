import React, { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./context/AuthContext.jsx";
import { useI18n } from "./context/LanguageContext.jsx";
import { AppLayout } from "./components/layout/AppLayout.jsx";
import Login from "./pages/Login.jsx";
import POS from "./pages/POS.jsx";
import Wholesale from "./pages/Wholesale.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Products from "./pages/Products.jsx";
import Users from "./pages/Users.jsx";
import Sync from "./pages/Sync.jsx";
import Branches from "./pages/Branches.jsx";
import Customers from "./pages/Customers.jsx";
import CustomerReceivables from "./pages/CustomerReceivables.jsx";
import CustomerAccountDetail from "./pages/CustomerAccountDetail.jsx";
import Zakat from "./pages/Zakat.jsx";
import Returns from "./pages/Returns.jsx";
import Purchases from "./pages/Purchases.jsx";
import Transfer from "./pages/Transfer.jsx";
import Count from "./pages/Count.jsx";
import Cash from "./pages/Cash.jsx";
import Audit from "./pages/Audit.jsx";
import SyncQueueStatus from "./pages/SyncQueueStatus.jsx";
import Alerts from "./pages/Alerts.jsx";
import PrintSettings from "./pages/PrintSettings.jsx";
import LoyaltyCoupons from "./pages/LoyaltyCoupons.jsx";
const loadReports = () => import("./pages/Reports.jsx");
const loadAppointments = () => import("./pages/Appointments.jsx");
const loadAccounting = () => import("./pages/Accounting.jsx");
const loadAutomations = () => import("./pages/Automations.jsx");
const loadCommissions = () => import("./pages/Commissions.jsx");
const loadDeliveryRouting = () => import("./pages/DeliveryRouting.jsx");
const loadHrLayout = () => import("./pages/hr/HrLayout.jsx");
const loadHrEmployees = () => import("./pages/hr/HrEmployees.jsx");
const loadHrPayrollList = () => import("./pages/hr/HrPayrollList.jsx");
const loadHrPayrollPeriod = () => import("./pages/hr/HrPayrollPeriod.jsx");
const loadHrLoans = () => import("./pages/hr/HrLoans.jsx");
const loadPlatformLayout = () => import("./components/layout/PlatformLayout.jsx");
const loadPlatformOrganizations = () => import("./pages/PlatformOrganizations.jsx");
const loadPlatformUsers = () => import("./pages/PlatformUsers.jsx");

const Reports = React.lazy(loadReports);
const Appointments = React.lazy(loadAppointments);
const Accounting = React.lazy(loadAccounting);
const Automations = React.lazy(loadAutomations);
const Commissions = React.lazy(loadCommissions);
const DeliveryRouting = React.lazy(loadDeliveryRouting);
const HrLayout = React.lazy(loadHrLayout);
const HrEmployees = React.lazy(loadHrEmployees);
const HrPayrollList = React.lazy(loadHrPayrollList);
const HrPayrollPeriod = React.lazy(loadHrPayrollPeriod);
const HrLoans = React.lazy(loadHrLoans);
const PlatformLayout = React.lazy(loadPlatformLayout);
const PlatformOrganizations = React.lazy(loadPlatformOrganizations);
const PlatformUsers = React.lazy(loadPlatformUsers);

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

function ProtectedPlatform({ children }) {
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
  if (!user.isPlatformAdmin) return <Navigate to="/pos" replace />;
  return children;
}

export default function App() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return undefined;
    const preload = () => {
      // Warm up heavy chunks in idle time for faster first navigation.
      Promise.allSettled([
        loadDeliveryRouting(),
        loadReports(),
        loadAppointments(),
      ]);
      if (user.role === "ADMIN" || user.role === "MANAGER") {
        Promise.allSettled([loadAccounting(), loadAutomations(), loadCommissions()]);
      }
      if (user.isPlatformAdmin) {
        Promise.allSettled([loadPlatformLayout(), loadPlatformOrganizations(), loadPlatformUsers()]);
      }
    };
    const schedule = window.requestIdleCallback || ((cb) => window.setTimeout(cb, 1200));
    const cancel = window.cancelIdleCallback || window.clearTimeout;
    const taskId = schedule(preload);
    return () => cancel(taskId);
  }, [user]);

  const lazyFallback = (
    <div style={{ padding: 24, textAlign: "center" }}>
      Loading...
    </div>
  );

  return (
    <React.Suspense fallback={lazyFallback}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/platform"
          element={
            <Protected>
              <ProtectedPlatform>
                <PlatformLayout />
              </ProtectedPlatform>
            </Protected>
          }
        >
          <Route index element={<Navigate to="/platform/organizations" replace />} />
          <Route path="organizations" element={<PlatformOrganizations />} />
          <Route path="users" element={<PlatformUsers />} />
        </Route>
        <Route
          element={
            <Protected>
              <AppLayout />
            </Protected>
          }
        >
          <Route path="/" element={<Navigate to="/pos" replace />} />
          <Route path="/pos" element={<POS />} />
          <Route path="/wholesale" element={<Wholesale />} />
          <Route path="/sync-queue" element={<SyncQueueStatus />} />
          <Route path="/alerts" element={<Alerts />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/print-settings" element={<PrintSettings />} />
          <Route
            path="/loyalty"
            element={
              <Protected roles={["ADMIN", "MANAGER"]}>
                <LoyaltyCoupons />
              </Protected>
            }
          />
          <Route
            path="/zakat"
            element={
              <Protected roles={["ADMIN", "MANAGER"]}>
                <Zakat />
              </Protected>
            }
          />
          <Route
            path="/reports"
            element={
              <Protected roles={["ADMIN", "MANAGER"]}>
                <Reports />
              </Protected>
            }
          />
          <Route
            path="/appointments"
            element={
              <Protected roles={["ADMIN", "MANAGER"]}>
                <Appointments />
              </Protected>
            }
          />
          <Route
            path="/accounting"
            element={
              <Protected roles={["ADMIN", "MANAGER"]}>
                <Accounting />
              </Protected>
            }
          />
          <Route
            path="/automations"
            element={
              <Protected roles={["ADMIN", "MANAGER"]}>
                <Automations />
              </Protected>
            }
          />
          <Route
            path="/commissions"
            element={
              <Protected roles={["ADMIN", "MANAGER"]}>
                <Commissions />
              </Protected>
            }
          />
          <Route
            path="/delivery"
            element={
              <Protected roles={["ADMIN", "MANAGER"]}>
                <DeliveryRouting />
              </Protected>
            }
          />
          <Route
            path="/hr"
            element={
              <Protected roles={["ADMIN", "MANAGER"]}>
                <HrLayout />
              </Protected>
            }
          >
            <Route index element={<Navigate to="/hr/employees" replace />} />
            <Route path="employees" element={<HrEmployees />} />
            <Route path="payroll" element={<HrPayrollList />} />
            <Route path="payroll/:periodId" element={<HrPayrollPeriod />} />
            <Route path="loans" element={<HrLoans />} />
          </Route>
          <Route path="/products" element={<Products />} />
          <Route path="/customers" element={<Customers />} />
          <Route path="/customer-accounts" element={<CustomerReceivables />} />
          <Route path="/customer-accounts/:customerId" element={<CustomerAccountDetail />} />
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
    </React.Suspense>
  );
}
