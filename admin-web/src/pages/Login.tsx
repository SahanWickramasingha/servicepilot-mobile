import { Eye, EyeOff, LockKeyhole, Mail, ShieldCheck, UserRoundCheck } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAdminAuth } from "../auth/AdminAuthContext";
import { portalDestination, type PortalRole } from "../auth/portalAccess";
import servicePilotLogo from "../assets/images/servicepilot-logo.png";
import "./login.css";

export default function Login() {
  const { signIn, profile, loading, accessDenied } = useAdminAuth();
  const location = useLocation(), navigate = useNavigate();
  const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? "";
  const [role, setRole] = useState<PortalRole>(from.startsWith("/dispatcher/") ? "dispatcher" : "super_admin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState("");
  const [suggestion, setSuggestion] = useState<PortalRole | null>(null);
  const [dismissedDenied, setDismissedDenied] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const guard = useRef(false);
  const label = role === "super_admin" ? "Super Admin" : "Dispatcher";
  const choose = (next: PortalRole) => { if (guard.current) return; setRole(next); setError(""); setSuggestion(null); setDismissedDenied(accessDenied); };
  if (profile && !submitting) return <Navigate to={portalDestination(profile.role as PortalRole, from)} replace />;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (guard.current || loading) return;
    setError(""); setSuggestion(null); setDismissedDenied("");
    if (!email.trim() || !password) { setError("Please enter your email and password."); return; }
    guard.current = true; setSubmitting(true);
    try {
      const saved = await signIn(email, password, role);
      if (saved.role !== role) throw Object.assign(new Error("This account uses a different portal. Switch your selection and sign in again."), { code: "auth/portal-mismatch", actualRole: saved.role });
      setPassword(""); navigate(portalDestination(role, from), { replace: true });
    } catch (cause) {
      const failure = cause as { code?: string; actualRole?: string; message?: string };
      if (failure.code === "auth/portal-mismatch") {
        setError(failure.message ?? "Choose the portal assigned to your account.");
        if (failure.actualRole === "super_admin" || failure.actualRole === "dispatcher") setSuggestion(failure.actualRole);
        setPassword("");
      } else if (failure.code === "auth/network-request-failed") setError("Unable to connect. Check your connection and try again.");
      else if (failure.code === "auth/user-disabled") setError("Your ServicePilot account has been disabled or deleted. Please contact support.");
      else if (failure.code?.startsWith("auth/")) setError("Unable to sign in. Check your email and password, then try again.");
      else setError(cause instanceof Error ? cause.message : "Unable to verify portal access. Please try again.");
    } finally { guard.current = false; setSubmitting(false); }
  };
  return <div className="auth-page"><form className="auth-card portal-login" onSubmit={submit} aria-busy={submitting}>
    <img src={servicePilotLogo} alt="ServicePilot" className="auth-image" />
    <div className="auth-brand">SERVICEPILOT PORTAL</div><h1>Welcome back</h1>
    <p>Choose your portal to continue.</p>
    <fieldset className="portal-options" disabled={submitting || loading} aria-describedby="portal-selection-note"><legend>Sign in to</legend>
      {(["super_admin", "dispatcher"] as const).map(option => {
        const Icon = option === "super_admin" ? ShieldCheck : UserRoundCheck;
        return <label className={`portal-option ${role === option ? "selected" : ""}`} key={option}>
          <input type="radio" name="portal" value={option} checked={role === option} onChange={() => choose(option)} />
          <Icon size={24} aria-hidden="true" /><strong>{option === "super_admin" ? "Super Admin" : "Dispatcher"}</strong>
          <span>{option === "super_admin" ? "Administration & accounts" : "Applications & technicians"}</span>
        </label>;
      })}
    </fieldset>
    <p id="portal-selection-note" className="portal-selection-note">Your account’s assigned role determines access.</p>
    <h2>Sign in as {label}</h2>
    <label className="auth-field"><span>Email</span><div><Mail size={18} aria-hidden="true" />
      <input type="email" autoComplete="username" required value={email} onChange={event => setEmail(event.target.value)} disabled={submitting || loading} /></div></label>
    <label className="auth-field"><span>Password</span><div><LockKeyhole size={18} aria-hidden="true" />
      <input type={visible ? "text" : "password"} autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} disabled={submitting || loading} />
      <button type="button" className="password-visibility" aria-label={visible ? "Hide password" : "Show password"} aria-pressed={visible} onClick={() => setVisible(!visible)} disabled={submitting || loading}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>
    {(error || accessDenied !== dismissedDenied && accessDenied) && <div className="auth-error" role="alert">{error || accessDenied}</div>}
    {suggestion && <button type="button" className="portal-switch" onClick={() => choose(suggestion)}>Switch to {suggestion === "super_admin" ? "Super Admin" : "Dispatcher"}</button>}
    <button className="primary-action" type="submit" disabled={submitting || loading}>{submitting ? "Verifying your account…" : `Sign in as ${label}`}</button>
  </form></div>;
}
