import { BrowserRouter, Route, Routes } from "react-router-dom";
import AdminLayout from "./layouts/AdminLayout";
import Dashboard from "./pages/Dashboard";
import PlaceholderPage from "./pages/PlaceholderPage";
import ServiceRequests from "./pages/ServiceRequests";
import Technicians from "./pages/Technicians";
import Customers from "./pages/Customers";
import Services from "./pages/Services";
import Schedule from "./pages/Schedule";
import LiveMap from "./pages/LiveMap";
import Notifications from "./pages/Notifications";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AdminLayout />}>
          <Route path="/" element={<Dashboard />} />

          <Route
  path="/requests"
  element={<ServiceRequests />}
/>

          <Route
  path="/schedule"
  element={<Schedule />}
/>

          <Route
  path="/technicians"
  element={<Technicians />}
/>

         <Route
  path="/customers"
  element={<Customers />}
/>
          <Route
  path="/services"
  element={<Services />}
/>

          <Route
  path="/live-map"
  element={<LiveMap />}
/>

          <Route
  path="/notifications"
  element={<Notifications />}
/>

          <Route
  path="/reports"
  element={<Reports />}
/>
<Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}