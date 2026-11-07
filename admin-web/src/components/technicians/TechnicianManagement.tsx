import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Check, ChevronLeft, ChevronRight, ClipboardCheck, Eye, LoaderCircle, Search, X } from "lucide-react";
import { doc, getDocFromServer } from "firebase/firestore";
import { technicianCategoryLabel } from "../../../../functions/src/domain/serviceCategories";
import { useAdminAuth } from "../../auth/AdminAuthContext";
import { auth, db } from "../../firebase/config";
import { useTechnicianUsers } from "../../hooks/useTechnicianUsers";
import { reviewTechnicianApplication } from "../../services/technicianApprovalService";
import { updateManagedAccountLifecycle, type AccountLifecycleAction } from "../../services/accountLifecycleService";
import { AccountLifecycleActions, statusChipLabel, statusChipTone } from "../AccountLifecycleActions";
import { StatusChip } from "../DataState";
import { TechnicianRating } from "../TechnicianRating";
import { displayText, formatDateTime, initials, statusLabel } from "../../utils/format";
import type { UserRecord } from "../../types";
import { TechnicianApplicationDialog } from "./TechnicianApplicationDialog";
import { TechnicianDialog } from "./TechnicianDialog";
import { DecisionEmailNotice } from "./DecisionEmailNotice";
import { approvalFilters, canReviewApplication, isReviewConflict, reviewerLabel, serviceAreaLabel, type ApprovalFilter, type ReviewMode } from "./technicianPresentation";
import "./technicians.css";

export function TechnicianManagement({ applications = false }: { applications?: boolean }) {
  const { firebaseUser, profile, accessDenied } = useAdminAuth();
  const isSuperAdmin = profile?.role === "super_admin";
  const activeReviewer = !!firebaseUser && !accessDenied && profile?.lifecyclePending !== true &&
    (isSuperAdmin ? profile?.accountStatus === "active" : profile?.role === "dispatcher" && (profile.accountStatus === undefined || profile.accountStatus === "active"));
  const portal = isSuperAdmin ? "admin" : "dispatcher";
  const [filter, setFilter] = useState<ApprovalFilter>(applications ? "pending" : "all");
  const [search, setSearch] = useState("");
  const query = useTechnicianUsers({ paginated: true, status: filter === "all" ? undefined : filter,
    page: `${portal}/${applications ? "applications" : "technicians"}`, queryType: `${filter}-technicians` });
  const [selection, setSelection] = useState<{ technician: UserRecord; mode: ReviewMode } | null>(null);
  const [lifecycle, setLifecycle] = useState<{ technician: UserRecord; action: AccountLifecycleAction } | null>(null);
  const [ratingUid, setRatingUid] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  const [decisionEmail, setDecisionEmail] = useState<{ uid: string; key: string } | null>(null);
  const submitting = useRef(false);
  const alive = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const current = () => alive.current && firebaseUser?.uid === auth.currentUser?.uid;
  const technicians = useMemo(() => query.data.filter(technician =>
    (!applications || technician.technicianApprovalStatus !== "pending" || canReviewApplication(technician)) &&
    [technician.fullName, technician.email, technician.phone, technicianCategoryLabel(technician), serviceAreaLabel(technician),
      technician.experience, technician.qualifications].join(" ").toLowerCase().includes(search.trim().toLowerCase())
  ), [query.data, search, applications]);
  const open = (technician: UserRecord, mode: ReviewMode) => { if (saving) return; setError(""); setNotice(null); setSelection({ technician, mode }); };
  const review = async (status: "approved" | "rejected", reason: string) => {
    if (!selection || !activeReviewer || !firebaseUser || submitting.current || !canReviewApplication(selection.technician)) return;
    submitting.current = true; setSaving(true); setError("");
    const technician = selection.technician;
    try {
      await reviewTechnicianApplication({ technicianUid: technician.uid ?? technician.id, dispatcherUid: firebaseUser.uid, status, rejectionReason: reason });
      if (!current()) return;
      setSelection(null); setNotice({ text: `${displayText(technician.fullName)} ${status}. Review saved; the lists will refresh.` });
      setDecisionEmail({ uid: technician.uid ?? technician.id, key: `${technician.id}:${Date.now()}` });
      query.retry();
    } catch (cause) {
      if (!current()) return;
      if (isReviewConflict(cause)) {
        query.retry();
        try {
          const refreshed = await getDocFromServer(doc(db, "users", technician.uid ?? technician.id));
          if (!current()) return;
          if (refreshed.exists()) {
            setSelection({ technician: { ...refreshed.data(), id: refreshed.id } as UserRecord, mode: "view" });
            setError("This application changed or was already reviewed by someone else. The latest record is now shown; check its status before continuing.");
          } else {
            setSelection(null); setNotice({ error: true, text: "This application is no longer available. The list has been refreshed." });
          }
        } catch {
          if (current()) { setSelection(null); setNotice({ error: true, text: "This application changed. Its latest details could not be confirmed. Refresh the list and open it again." }); }
        }
      } else setError(cause instanceof Error ? cause.message : "Unable to save this review. Check your connection and try again.");
    } finally { submitting.current = false; if (current()) setSaving(false); }
  };
  return <div className="technician-management">
    <div className="tm-heading"><div><p className="tm-eyebrow">Technician management</p>
      <h1 tabIndex={-1} data-technician-heading>{applications ? "Applications" : "Technicians"}</h1>
      <p>{applications ? "Review the person behind the application. Approve when they’re ready." : "Manage technician approvals and keep account access in view."}</p>
    </div><Link className="tm-button secondary" to={`/${portal}/${applications ? "technicians" : "applications"}`}>
      <ClipboardCheck size={17} aria-hidden="true" />{applications ? "All technicians" : "Review applications"}</Link></div>

    {notice && <div className={`tm-notice ${notice.error ? "error" : "success"}`} role={notice.error ? "alert" : "status"}>{notice.text}</div>}
    {decisionEmail && activeReviewer && <DecisionEmailNotice key={decisionEmail.key} technicianUid={decisionEmail.uid} requestOnMount />}
    <section className="tm-panel" aria-label={applications ? "Technician applications" : "Technician directory"}>
      <div className="tm-toolbar"><div className="tm-filters" role="group" aria-label="Approval status">
        {approvalFilters.map(value => <button key={value} type="button" aria-pressed={filter === value} disabled={saving}
          onClick={() => { setFilter(value); query.firstPage(); }} className={filter === value ? "selected" : ""}>{statusLabel(value)}</button>)}
      </div><label className="tm-search"><Search size={18} aria-hidden="true" /><span className="tm-sr-only">Search this page</span>
        <input type="search" placeholder="Search this page…" value={search} onChange={event => setSearch(event.target.value)} /></label></div>
      <div className="tm-list-heading"><h2>{filter === "pending" ? "Pending review" : filter === "all" ? "All approval statuses" : `${statusLabel(filter)} technicians`}</h2>
        <span>Search applies to this page.</span></div>
      {query.loading ? <div className="tm-state" role="status"><LoaderCircle className="tm-spin" size={24} aria-hidden="true" /><h3>Loading technicians</h3><p>Confirming the latest records.</p></div>
        : query.error ? <div className="tm-state" role="alert"><h3>Unable to load technicians</h3><p>{query.error}</p><button className="tm-button secondary" onClick={query.retry}>Retry</button></div>
        : !technicians.length ? <div className="tm-state" role="status"><ClipboardCheck size={28} aria-hidden="true" /><h3>{search ? "No matching technicians on this page" : filter === "pending" ? "No eligible pending applications on this page" : "No technicians on this page"}</h3>
          <p>{search ? "Try a different name, service or area." : "Change the status filter or browse the next page if available."}</p>{search && <button className="tm-button secondary" onClick={() => setSearch("")}>Clear search</button>}</div>
        : <div className="tm-table-wrap"><table className="tm-table"><caption className="tm-sr-only">Technicians, approval status, account status and available actions</caption>
          <thead><tr><th scope="col">Technician</th><th scope="col">Service & area</th><th scope="col">Approval status</th><th scope="col">Account status</th><th scope="col">Review history</th><th scope="col">Actions</th></tr></thead>
          <tbody>{technicians.map(technician => {
            const eligible = activeReviewer && canReviewApplication(technician);
            const uid = technician.uid ?? technician.id;
            return <tr key={technician.id}>
              <td data-label="Technician"><div className="tm-person"><span className="tm-avatar" aria-hidden="true">{initials(technician.fullName, technician.email)}</span><div>
                <strong>{displayText(technician.fullName)}</strong><span>{displayText(technician.email)}</span><small>Applied {formatDateTime(technician.createdAt)}</small></div></div>
                {isSuperAdmin && !applications && <div className="tm-rating">{ratingUid === uid ? <><TechnicianRating technicianId={uid} /><button className="tm-text-button" onClick={() => setRatingUid(null)}>Close rating</button></>
                  : <button className="tm-text-button" onClick={() => setRatingUid(uid)}>View rating</button>}</div>}
              </td>
              <td data-label="Service & area"><strong>{technicianCategoryLabel(technician)}</strong><span>{serviceAreaLabel(technician)}</span></td>
              <td data-label="Approval status"><StatusChip value={statusLabel(technician.technicianApprovalStatus)} tone={technician.technicianApprovalStatus === "approved" ? "green" : technician.technicianApprovalStatus === "rejected" ? "red" : "yellow"} /></td>
              <td data-label="Account status"><StatusChip value={statusChipLabel(technician.accountStatus)} tone={statusChipTone(technician.accountStatus)} />{technician.lifecyclePending && <span>Account update pending</span>}</td>
              <td data-label="Review history"><strong>{technician.reviewedBy ? reviewerLabel(technician, profile) : "Not yet reviewed"}</strong><span>{technician.reviewedBy ? formatDateTime(technician.reviewedAt) : technician.emailVerified === true ? "Email verified" : "Email not verified"}</span></td>
              <td data-label="Actions"><div className="tm-actions">
                <button className="tm-button secondary view" disabled={saving} onClick={() => open(technician, "view")} aria-label={`View application for ${displayText(technician.fullName)}`}><Eye size={16} aria-hidden="true" />View application</button>
                {eligible && <><button className="tm-button primary" disabled={saving} onClick={() => open(technician, "approve")} aria-label={`Approve ${displayText(technician.fullName)}`}><Check size={17} aria-hidden="true" />Approve</button>
                  <button className="tm-button reject" disabled={saving} onClick={() => open(technician, "reject")} aria-label={`Reject ${displayText(technician.fullName)}`}><X size={17} aria-hidden="true" />Reject</button></>}
              </div>{isSuperAdmin && activeReviewer && !applications && <div className="tm-account-actions"><span>Account access</span><AccountLifecycleActions account={technician} busy={saving} showView={false} onView={() => open(technician, "view")}
                onAction={action => { setError(""); setNotice(null); setLifecycle({ technician, action }); }} /></div>}
              </td></tr>;
          })}</tbody></table></div>}
      <footer className="tm-pagination"><span>Page {query.pageNumber}{!query.loading && !query.error ? ` · ${technicians.length} shown` : ""}</span><nav aria-label="Technician pages">
        <button className="tm-button secondary" disabled={!query.hasPrevious || query.loading || saving} onClick={query.previousPage}><ChevronLeft size={16} aria-hidden="true" />Previous</button>
        <button className="tm-button secondary" disabled={!query.hasMore || query.loading || !!query.error || saving} onClick={query.loadMore}>Next<ChevronRight size={16} aria-hidden="true" /></button>
      </nav></footer>
    </section>
    {selection && <TechnicianApplicationDialog key={selection.technician.id} technician={selection.technician} mode={selection.mode}
      onMode={mode => { setError(""); setSelection({ ...selection, mode }); }} eligible={activeReviewer && canReviewApplication(selection.technician)}
      busy={saving} error={error} canNotify={activeReviewer} reviewer={reviewerLabel(selection.technician, profile)} onClose={() => { if (!saving) setSelection(null); }} onSubmit={review} />}
    {lifecycle && isSuperAdmin && <TechnicianAccountDialog technician={lifecycle.technician} action={lifecycle.action} busy={saving} error={error}
      onClose={() => { if (!saving) setLifecycle(null); }} onConfirm={async () => {
        if (!activeReviewer || !firebaseUser || submitting.current) return;
        submitting.current = true; setSaving(true); setError("");
        try {
          await updateManagedAccountLifecycle({ actorUid: firebaseUser.uid, target: lifecycle.technician, action: lifecycle.action });
          if (current()) { setLifecycle(null); setNotice({ text: `Technician account ${lifecycle.action === "enable" ? "enabled" : lifecycle.action === "disable" ? "disabled" : "deleted"}.` }); query.retry(); }
        } catch (cause) { if (current()) setError(cause instanceof Error ? cause.message : "Unable to update this account."); }
        finally { submitting.current = false; if (current()) setSaving(false); }
      }} />}
  </div>;
}

function TechnicianAccountDialog({ technician, action, busy, error, onClose, onConfirm }: {
  technician: UserRecord; action: AccountLifecycleAction; busy: boolean; error: string; onClose: () => void; onConfirm: () => Promise<void>;
}) {
  const [confirmation, setConfirmation] = useState("");
  return <TechnicianDialog title={`${statusLabel(action)} technician account?`} subtitle={displayText(technician.fullName)} busy={busy} onClose={onClose}>
    <form className="tm-account-form" onSubmit={event => { event.preventDefault(); if (!busy && (action !== "delete" || confirmation.trim() === "DELETE")) void onConfirm(); }}>
      <p>{action === "enable" ? "The technician must sign in again. Approval and verification are preserved; availability stays offline and location sharing stays off."
        : action === "disable" ? "This blocks account access until the account is enabled again."
          : "This soft-deletes the account and blocks sign-in. Bookings, reviews and audit history are retained. Ordinary Enable cannot restore it."}</p>
      {action === "delete" && <label>Type DELETE to confirm<input required autoFocus value={confirmation} disabled={busy} onChange={event => setConfirmation(event.target.value)} /></label>}
      {error && <div className="tm-notice error" role="alert">{error}</div>}
      <div className="tm-actions"><button type="button" className="tm-button secondary" disabled={busy} onClick={onClose}>Cancel</button>
        <button type="submit" className={`tm-button ${action === "delete" ? "reject" : "primary"}`} disabled={busy || action === "delete" && confirmation.trim() !== "DELETE"}>{busy ? "Saving…" : `${statusLabel(action)} account`}</button></div>
    </form>
  </TechnicianDialog>;
}
