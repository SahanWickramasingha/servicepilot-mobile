import { BrowserRouter, Route, Routes } from "react-router-dom";
import AdminLayout from "./layouts/AdminLayout";
import Dashboard from "./pages/Dashboard";
import PlaceholderPage from "./pages/PlaceholderPage";
import ServiceRequests from "./pages/ServiceRequests";
import Technicians from "./pages/Technicians";
import Customers from "./pages/Customers";
import Services from "./pages/Services";

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
            element={<PlaceholderPage title="Schedule Management" />}
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
            element={<PlaceholderPage title="Live Technician Map" />}
          />

          <Route
            path="/notifications"
            element={<PlaceholderPage title="Notifications" />}
          />

          <Route
            path="/reports"
            element={<PlaceholderPage title="Reports & Analytics" />}
          />

          <Route
            path="/settings"
            element={<PlaceholderPage title="System Settings" />}
          />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}