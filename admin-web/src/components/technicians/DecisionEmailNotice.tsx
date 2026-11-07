import { useEffect, useRef, useState } from "react";
import type { DecisionEmailResult } from "../../../../functions/src/domain/technicianDecisionEmailTypes";
import { getTechnicianDecisionEmailStatus, requestTechnicianDecisionEmail } from "../../services/dispatcherProvisioningService";

const descriptions = {
  not_requested: "Decision saved. No decision email has been requested yet.",
  pending: "Email request in progress. Inbox delivery is not yet confirmed.",
  submitted: "Email submitted to the provider. This does not confirm inbox delivery.",
  failed: "Decision saved. The email request failed; the decision has not been repeated or rolled back.",
  not_configured: "Decision saved. Email was not sent because the server’s decision-email provider is not configured.",
  unknown: "Decision saved. The email provider outcome could not be confirmed.",
};

export function DecisionEmailNotice({ technicianUid, requestOnMount = false }: { technicianUid: string; requestOnMount?: boolean }) {
  const [result, setResult] = useState<DecisionEmailResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const started = useRef<Promise<DecisionEmailResult> | null>(null);
  const alive = useRef(false);
  const submitting = useRef(false);
  useEffect(() => {
    alive.current = true;
    // StrictMode reuses the promise rather than requesting a second notification.
    started.current ??= requestOnMount ? requestTechnicianDecisionEmail(technicianUid) : getTechnicianDecisionEmailStatus(technicianUid);
    let active = true;
    started.current.then(next => { if (active) { setResult(next); setError(""); } }, cause => {
      if (active) setError(cause instanceof Error ? cause.message : "Unable to confirm email status.");
    }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; alive.current = false; };
  }, [technicianUid, requestOnMount]);
  return <section className="tm-email-notice" aria-label="Decision email" aria-busy={busy}>
    <strong>Decision email</strong><p role="status">{busy ? (requestOnMount ? "Requesting the decision email…" : "Checking decision email status…") : error || (result ? descriptions[result.status] : "Email status unavailable.")}</p>
    {result?.status === "unknown" && !result.retryable && <p>The safe provider retry window has ended. An operator must check the provider record before any further send.</p>}
    {!busy && (!result || result.retryable) && <button type="button" className="tm-button secondary" onClick={async () => {
      if (submitting.current) return;
      submitting.current = true; setBusy(true); setError("");
      try {
        const next = await requestTechnicianDecisionEmail(technicianUid, result?.revision);
        if (alive.current) setResult(next);
      } catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : "Unable to request the email. The saved decision is unchanged."); }
      finally { submitting.current = false; if (alive.current) setBusy(false); }
    }}>{result?.status === "not_requested" ? "Request decision email" : result?.status === "pending" ? "Check / retry email" : "Retry email"}</button>}
  </section>;
}
