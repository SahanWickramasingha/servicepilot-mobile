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
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";

import { useAdminAuth } from "../auth/AdminAuthContext";
import servicePilotLogo from "../assets/images/servicepilot-logo.png";
import WebNotificationBell from "../components/WebNotificationBell";
import { initials } from "../utils/format";

const adminNavigation = [
  { label: "Dashboard", path: "/admin/dashboard", icon: LayoutDashboard },
  { label: "Dispatchers", path: "/admin/dispatchers", icon: ShieldCheck },
  { label: "Technicians", path: "/admin/technicians", icon: UserCog },
  { label: "Applications", path: "/admin/applications", icon: ClipboardCheck },
  { label: "Customers", path: "/admin/customers", icon: Users },
  { label: "Service Requests", path: "/admin/requests", icon: ClipboardList },
  { label: "Reviews", path: "/admin/reviews", icon: MessageSquareText },
  { label: "Content Moderation", path: "/admin/moderation", icon: ShieldCheck },
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
  const menuButton = useRef<HTMLButtonElement>(null);
  const sidebar = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!mobileOpen) return;
    const previous = document.body.style.overflow;
    const opener = menuButton.current;
    document.body.style.overflow = "hidden";
    sidebar.current?.querySelector<HTMLElement>("button, a")?.focus();
    const wide = window.matchMedia("(min-width: 851px)");
    const closeWhenWide = () => { if (wide.matches) setMobileOpen(false); };
    wide.addEventListener("change", closeWhenWide);
    return () => { document.body.style.overflow = previous; wide.removeEventListener("change", closeWhenWide); opener?.focus(); };
  }, [mobileOpen]);
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

      <aside id="portal-navigation" ref={sidebar} className={`sidebar ${mobileOpen ? "mobile-open" : ""}`}
        role={mobileOpen ? "dialog" : undefined} aria-modal={mobileOpen ? true : undefined} aria-label={`${portalLabel} navigation`}
        onKeyDown={event => {
          if (!mobileOpen) return;
          if (event.key === "Escape") { event.preventDefault(); setMobileOpen(false); }
          if (event.key === "Tab") {
            const targets = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled), a[href]"));
            const first = targets[0], last = targets.at(-1);
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
          }
        }}>
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
          {mobileOpen && <button className="drawer-close" aria-label="Close navigation" onClick={() => setMobileOpen(false)}><X size={19} /></button>}
        </div>

        <nav className="sidebar-nav" aria-label={`${portalLabel} pages`}>
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

      <div className="admin-main" inert={mobileOpen ? true : undefined}>
        <header className="topbar">
          <button
            className="mobile-menu-button"
            ref={menuButton}
            aria-label="Open navigation"
            aria-expanded={mobileOpen}
            aria-controls="portal-navigation"
            onClick={() => setMobileOpen(true)}
          >
            <Menu size={21} />
          </button>

          <div className="topbar-title">
            <strong>{portalLabel} Portal</strong>
            <span>Real-time Firebase monitoring</span>
          </div>

          <div className="topbar-actions">
            <WebNotificationBell portal={portal} />
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
