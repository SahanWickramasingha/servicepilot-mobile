import { LockKeyhole, Mail } from "lucide-react";
import type { FormEvent } from "react";
import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";

import {
  getPortalHomeForRole,
  useAdminAuth,
} from "../auth/AdminAuthContext";
import servicePilotLogo from "../assets/images/servicepilot-logo.png";

export default function Login() {
  const { signIn, profile, loading, accessDenied } = useAdminAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const from =
    (location.state as { from?: { pathname?: string } } | null)?.from
      ?.pathname ?? "";

  if (profile) {
    return <Navigate to={from || getPortalHomeForRole(profile.role)} replace />;
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    if (!email.trim() || !password) {
      setError("Please enter your email and password.");
      return;
    }

    try {
      setSubmitting(true);
      const signedInProfile = await signIn(email, password);
      navigate(from || getPortalHomeForRole(signedInProfile.role), {
        replace: true,
      });
    } catch (signInError) {
      if (
        signInError instanceof Error &&
        signInError.message === "Access denied."
      ) {
        setError(
          "Access denied. This portal is restricted to active Super Admin and Dispatcher accounts."
        );
      } else if (
        signInError instanceof Error &&
        [
          "Your ServicePilot account has been disabled. Please contact support.",
          "This ServicePilot account is no longer active.",
          "Admin profile not found.",
        ].includes(signInError.message)
      ) {
        setError(signInError.message);
      } else {
        setError("Invalid email or password.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <img src={servicePilotLogo} alt="ServicePilot" className="auth-image" />
        <div className="auth-brand">SERVICEPILOT</div>
        <h1>Admin Portal</h1>
        <p>Sign in with an active Super Admin or Dispatcher account.</p>

        <label className="auth-field">
          <span>Email</span>
          <div>
            <Mail size={18} />
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={submitting || loading}
            />
          </div>
        </label>

        <label className="auth-field">
          <span>Password</span>
          <div>
            <LockKeyhole size={18} />
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={submitting || loading}
            />
          </div>
        </label>

        {(error || accessDenied) && (
          <div className="auth-error">{error || accessDenied}</div>
        )}

        <button className="primary-action" disabled={submitting || loading}>
          {submitting ? "Signing In..." : "Sign In"}
        </button>
      </form>
    </div>
  );
}
