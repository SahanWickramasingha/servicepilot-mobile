import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { AdminAuthProvider } from "./auth/AdminAuthContext";
import AdminRoute from "./components/AdminRoute";
import HomeRedirect from "./components/HomeRedirect";
import AdminLayout from "./layouts/AdminLayout";
import AuditLogs from "./pages/AuditLogs";
import Customers from "./pages/Customers";
import Dashboard from "./pages/Dashboard";
import Dispatchers from "./pages/Dispatchers";
import Login from "./pages/Login";
import Reports from "./pages/Reports";
import Reviews from "./pages/Reviews";
import ServiceRequests from "./pages/ServiceRequests";
import Settings from "./pages/Settings";
import Technicians from "./pages/Technicians";
import DispatcherApplications from "./pages/dispatcher/DispatcherApplications";
import DispatcherDashboard from "./pages/dispatcher/DispatcherDashboard";
import DispatcherProfile from "./pages/dispatcher/DispatcherProfile";
import DispatcherTechnicians from "./pages/dispatcher/DispatcherTechnicians";

export default function App() {
  return (
    <AdminAuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomeRedirect />} />
          <Route path="/login" element={<Login />} />
          <Route element={<AdminRoute allowedRoles={["super_admin"]} />}>
            <Route element={<AdminLayout portal="admin" />}>
              <Route
                path="/admin"
                element={<Navigate to="/admin/dashboard" replace />}
              />
              <Route path="/admin/dashboard" element={<Dashboard />} />
              <Route path="/admin/dispatchers" element={<Dispatchers />} />
              <Route path="/admin/technicians" element={<Technicians />} />
              <Route path="/admin/customers" element={<Customers />} />
              <Route path="/admin/requests" element={<ServiceRequests />} />
              <Route path="/admin/reviews" element={<Reviews />} />
              <Route path="/admin/reports" element={<Reports />} />
              <Route path="/admin/audit" element={<AuditLogs />} />
              <Route path="/admin/settings" element={<Settings />} />
            </Route>
          </Route>
          <Route element={<AdminRoute allowedRoles={["dispatcher"]} />}>
            <Route element={<AdminLayout portal="dispatcher" />}>
              <Route
                path="/dispatcher"
                element={<Navigate to="/dispatcher/dashboard" replace />}
              />
              <Route
                path="/dispatcher/dashboard"
                element={<DispatcherDashboard />}
              />
              <Route
                path="/dispatcher/applications"
                element={<DispatcherApplications />}
              />
              <Route
                path="/dispatcher/technicians"
                element={<DispatcherTechnicians />}
              />
              <Route
                path="/dispatcher/profile"
                element={<DispatcherProfile />}
              />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </AdminAuthProvider>
  );
}
