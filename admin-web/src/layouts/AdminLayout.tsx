import {
  ClipboardCheck,
  BarChart3,
  ClipboardList,
  FileClock,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquareText,
  Megaphone,
  Settings,
  ShieldCheck,
  UserCog,
  Users,
} from "lucide-react";
import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";

import { useAdminAuth } from "../auth/AdminAuthContext";
import servicePilotLogo from "../assets/images/servicepilot-logo.png";
import { initials } from "../utils/format";

const adminNavigation = [
  { label: "Dashboard", path: "/admin/dashboard", icon: LayoutDashboard },
  { label: "Dispatchers", path: "/admin/dispatchers", icon: ShieldCheck },
  { label: "Technicians", path: "/admin/technicians", icon: UserCog },
  { label: "Customers", path: "/admin/customers", icon: Users },
  { label: "Service Requests", path: "/admin/requests", icon: ClipboardList },
  { label: "Reviews", path: "/admin/reviews", icon: MessageSquareText },
  { label: "System Messages", path: "/admin/messages", icon: Megaphone },
  { label: "Reports", path: "/admin/reports", icon: BarChart3 },
  { label: "Audit Logs", path: "/admin/audit", icon: FileClock },
  { label: "Settings", path: "/admin/settings", icon: Settings },
];

const dispatcherNavigation = [
  { label: "Dashboard", path: "/dispatcher/dashboard", icon: LayoutDashboard },
  { label: "Applications", path: "/dispatcher/applications", icon: ClipboardCheck },
  { label: "Technicians", path: "/dispatcher/technicians", icon: UserCog },
  { label: "Messages", path: "/dispatcher/messages", icon: Megaphone },
  { label: "Profile", path: "/dispatcher/profile", icon: Users },
];

export default function AdminLayout({
  portal,
}: {
  portal: "admin" | "dispatcher";
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { profile, logout } = useAdminAuth();
  const navigation =
    portal === "admin" ? adminNavigation : dispatcherNavigation;
  const portalLabel =
    portal === "admin" ? "Super Admin" : "Dispatcher";

  return (
    <div className="admin-shell">
      {mobileOpen && (
        <button
          className="sidebar-overlay"
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside className={`sidebar ${mobileOpen ? "mobile-open" : ""}`}>
        <div className="brand-area">
          <div className="brand-logo">
            <img
              src={servicePilotLogo}
              alt="ServicePilot"
              className="brand-logo-image"
            />
          </div>
          <div>
            <div className="brand-name">ServicePilot</div>
            <div className="brand-subtitle">{portalLabel}</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          {navigation.map((item) => {
            const Icon = item.icon;

            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === "/"}
                className={({ isActive }) =>
                  `nav-item ${isActive ? "active" : ""}`
                }
                onClick={() => setMobileOpen(false)}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <button className="logout-button" onClick={logout}>
          <LogOut size={17} />
          Logout
        </button>
      </aside>

      <div className="admin-main">
        <header className="topbar">
          <button
            className="mobile-menu-button"
            aria-label="Open navigation"
            onClick={() => setMobileOpen(true)}
          >
            <Menu size={21} />
          </button>

          <div className="topbar-title">
            <strong>{portalLabel} Portal</strong>
            <span>Real-time Firebase monitoring</span>
          </div>

          <div className="topbar-actions">
            <div className="admin-profile">
              <div className="admin-avatar">
                {initials(profile?.fullName, profile?.email)}
              </div>
              <div className="admin-info">
                <strong>{profile?.fullName ?? "Super Admin"}</strong>
                <span>{profile?.email}</span>
              </div>
            </div>
          </div>
        </header>

        <main className="page-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
