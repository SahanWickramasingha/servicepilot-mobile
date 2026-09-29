import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useAdminAuth } from "../auth/AdminAuthContext";

export default function AdminRoute({
  allowedRoles,
}: {
  allowedRoles: string[];
}) {
  const { loading, profile } = useAdminAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-logo">SP</div>
          <h1>Checking Access</h1>
          <p>Loading your administrator profile.</p>
        </div>
      </div>
    );
  }

  if (!profile) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (!allowedRoles.includes(profile.role ?? "")) {
    return (
      <Navigate
        to={
          profile.role === "dispatcher"
            ? "/dispatcher/dashboard"
            : "/admin/dashboard"
        }
        replace
      />
    );
  }

  return <Outlet />;
}
