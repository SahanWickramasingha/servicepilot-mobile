import { Navigate } from "react-router-dom";

import {
  getPortalHomeForRole,
  useAdminAuth,
} from "../auth/AdminAuthContext";

export default function HomeRedirect() {
  const { loading, profile } = useAdminAuth();

  if (loading) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-logo">SP</div>
          <h1>Loading Portal</h1>
          <p>Checking your ServicePilot access.</p>
        </div>
      </div>
    );
  }

  return <Navigate to={getPortalHomeForRole(profile?.role)} replace />;
}
