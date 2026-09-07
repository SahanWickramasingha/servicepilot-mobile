import {
  BarChart3,
  Bell,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  LayoutDashboard,
  MapPinned,
  Menu,
  Settings,
  UserCog,
  Users,
  Wrench,
} from "lucide-react";
import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import servicePilotLogo from "../assets/images/servicepilot-logo.png";

const navigation = [
  {
    label: "Dashboard",
    path: "/",
    icon: LayoutDashboard,
  },
  {
    label: "Service Requests",
    path: "/requests",
    icon: ClipboardList,
  },
  {
    label: "Schedule",
    path: "/schedule",
    icon: CalendarDays,
  },
  {
    label: "Technicians",
    path: "/technicians",
    icon: UserCog,
  },
  {
    label: "Customers",
    path: "/customers",
    icon: Users,
  },
  {
    label: "Services",
    path: "/services",
    icon: Wrench,
  },
  {
    label: "Live Map",
    path: "/live-map",
    icon: MapPinned,
  },
  {
    label: "Notifications",
    path: "/notifications",
    icon: Bell,
  },
  {
    label: "Reports",
    path: "/reports",
    icon: BarChart3,
  },
  {
    label: "Settings",
    path: "/settings",
    icon: Settings,
  },
];

export default function AdminLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="admin-shell">
      {mobileOpen && (
        <div className="sidebar-overlay" onClick={() => setMobileOpen(false)} />
      )}

      <aside
        className={`sidebar ${collapsed ? "collapsed" : ""} ${
          mobileOpen ? "mobile-open" : ""
        }`}
      >
        {/* Brand */}
        <div className="brand-logo">
          <img
            src={servicePilotLogo}
            alt="ServicePilot"
            className="brand-logo-image"
          />
        </div>

        {!collapsed && (
          <div>
            <div className="brand-name">ServicePilot</div>
            <div className="brand-subtitle">Admin Portal</div>
          </div>
        )}

        {/* Navigation */}
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
                <Icon size={19} />

                {!collapsed && <span>{item.label}</span>}
              </NavLink>
            );
          })}
        </nav>

        {/* Collapse */}
        <button
          className="collapse-button"
          onClick={() => setCollapsed((value) => !value)}
        >
          {collapsed ? (
            <ChevronRight size={18} />
          ) : (
            <>
              <ChevronLeft size={18} />
              <span>Collapse Menu</span>
            </>
          )}
        </button>
      </aside>

      {/* Main */}
      <div className={`admin-main ${collapsed ? "sidebar-collapsed" : ""}`}>
        {/* Topbar */}
        <header className="topbar">
          <button
            className="mobile-menu-button"
            onClick={() => setMobileOpen(true)}
          >
            <Menu size={21} />
          </button>

          <div className="topbar-search">
            <input
              type="text"
              placeholder="Search requests, technicians, customers..."
            />
          </div>

          <div className="topbar-actions">
            <button className="notification-button">
              <Bell size={19} />
              <span className="notification-dot" />
            </button>

            <div className="admin-profile">
              <div className="admin-avatar">SA</div>

              <div className="admin-info">
                <strong>System Admin</strong>
                <span>Administrator</span>
              </div>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="page-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
