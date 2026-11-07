import { useEffect, useRef, useState } from "react";
import { Check, ShieldCheck, X } from "lucide-react";
import { technicianCategoryLabel } from "../../../../functions/src/domain/serviceCategories";
import { statusChipLabel } from "../AccountLifecycleActions";
import { StatusChip } from "../DataState";
import type { UserRecord } from "../../types";
import { displayText, formatDateTime, statusLabel } from "../../utils/format";
import { TechnicianDialog } from "./TechnicianDialog";
import { DecisionEmailNotice } from "./DecisionEmailNotice";
import { serviceAreaLabel, type ReviewMode } from "./technicianPresentation";

export function TechnicianApplicationDialog({ technician, mode, onMode, eligible, busy, error, canNotify, reviewer, onClose, onSubmit }: {
  technician: UserRecord; mode: ReviewMode; onMode: (mode: ReviewMode) => void;
  eligible: boolean; busy: boolean; error: string; canNotify: boolean; reviewer: string; onClose: () => void;
  onSubmit: (status: "approved" | "rejected", reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const focus = useRef<HTMLDivElement>(null);
  const submitting = useRef(false);
  useEffect(() => {
    focus.current?.querySelector<HTMLElement>("[data-review-focus]")?.focus();
  }, [mode]);
  return <TechnicianDialog title={displayText(technician.fullName, "Technician application")}
    subtitle={technicianCategoryLabel(technician)} busy={busy} onClose={onClose}>
    <div className="tm-dialog-body">
      <div className="tm-verification"><ShieldCheck size={18} aria-hidden="true" />
        <span>Email {technician.emailVerified === true ? "verified" : "not verified"}</span>
        <StatusChip value={statusLabel(technician.technicianApprovalStatus)} tone={technician.technicianApprovalStatus === "approved" ? "green" : technician.technicianApprovalStatus === "rejected" ? "red" : "yellow"} />
      </div>
      <section className="tm-detail-section"><h3>Identity & contact</h3><dl className="tm-details">
        <Detail label="Full name" value={technician.fullName} /><Detail label="Email" value={technician.email} />
        <Detail label="Phone" value={technician.phone} /><Detail label="Address (private profile)" value={technician.address} />
        <Detail label="Account status" value={statusChipLabel(technician.accountStatus)} /><Detail label="Applied" value={formatDateTime(technician.createdAt)} />
      </dl></section>
      <section className="tm-detail-section"><h3>Service & background</h3><dl className="tm-details">
        <Detail label="Service category" value={technicianCategoryLabel(technician)} /><Detail label="Declared service area" value={serviceAreaLabel(technician)} />
        <Detail label="Experience" value={technician.experience} /><Detail label="Qualifications" value={technician.qualifications} />
        <Detail label="Certifications" value={technician.certifications} />
      </dl><p className="tm-muted">Experience, qualifications and certifications are shown as submitted by the technician.</p></section>
      <section className="tm-detail-section"><h3>Review history</h3><dl className="tm-details">
        <Detail label="Reviewed by" value={technician.reviewedBy ? reviewer : "Not yet reviewed"} />
        <Detail label="Reviewed at" value={formatDateTime(technician.reviewedAt)} />
        {technician.rejectionReason && <Detail label="Rejection reason" value={technician.rejectionReason} />}
        {technician.disabledAt != null && <Detail label="Disabled at" value={formatDateTime(technician.disabledAt)} />}
        {technician.deletedAt != null && <Detail label="Deleted at" value={formatDateTime(technician.deletedAt)} />}
      </dl><details className="tm-audit"><summary>Audit details</summary><dl className="tm-details">
        <Detail label="Technician ID" value={technician.uid ?? technician.id} /><Detail label="Reviewer ID" value={technician.reviewedBy ?? undefined} />
      </dl></details></section>
      {canNotify && ["approved", "rejected"].includes(technician.technicianApprovalStatus ?? "") && <DecisionEmailNotice technicianUid={technician.uid ?? technician.id} />}
      {error && <div className="tm-notice error" role="alert">{error}</div>}
      {!eligible && technician.technicianApprovalStatus === "pending" && <p className="tm-muted">Review is available only for verified, complete pending applications with an active account.</p>}
    </div>
    <div ref={focus} className="tm-dialog-footer">
      {eligible && mode === "approve" ? <form onSubmit={async event => {
        event.preventDefault(); if (busy || submitting.current) return;
        submitting.current = true; try { await onSubmit("approved", ""); } finally { submitting.current = false; }
      }}>
        <h3>Approve this application?</h3><p>{displayText(technician.fullName)} will become an approved technician. Availability and location sharing stay as saved.</p>
        <div className="tm-actions"><button type="button" data-review-focus className="tm-button secondary" disabled={busy} onClick={() => onMode("view")}>Cancel</button>
          <button type="submit" className="tm-button primary" disabled={busy}><Check size={17} aria-hidden="true" />{busy ? "Approving…" : "Confirm approval"}</button></div>
      </form> : eligible && mode === "reject" ? <form onSubmit={async event => {
        event.preventDefault(); if (busy || submitting.current || !reason.trim() || reason.trim().length > 2000) return;
        submitting.current = true; try { await onSubmit("rejected", reason.trim()); } finally { submitting.current = false; }
      }}>
        <label htmlFor="technician-rejection-reason">Rejection reason <span className="tm-muted">(required)</span></label>
        <textarea id="technician-rejection-reason" data-review-focus required maxLength={2000} rows={3} value={reason} disabled={busy}
          aria-describedby="technician-rejection-hint" onChange={event => setReason(event.target.value)} placeholder="Explain what the applicant needs to address." />
        <p id="technician-rejection-hint" className="tm-muted">{reason.length}/2,000 characters. Saved with the review.</p>
        <div className="tm-actions"><button type="button" className="tm-button secondary" disabled={busy} onClick={() => onMode("view")}>Cancel</button>
          <button type="submit" className="tm-button reject" disabled={busy || !reason.trim()}><X size={17} aria-hidden="true" />{busy ? "Rejecting…" : "Confirm rejection"}</button></div>
      </form> : <div className="tm-actions"><button type="button" data-review-focus className="tm-button secondary" disabled={busy} onClick={onClose}>Close</button>
        {eligible && <><button type="button" className="tm-button primary" disabled={busy} onClick={() => onMode("approve")}><Check size={17} aria-hidden="true" />Approve</button>
          <button type="button" className="tm-button reject" disabled={busy} onClick={() => onMode("reject")}><X size={17} aria-hidden="true" />Reject</button></>}
      </div>}
    </div>
  </TechnicianDialog>;
}

function Detail({ label, value }: { label: string; value?: string }) {
  return <div><dt>{label}</dt><dd>{displayText(value)}</dd></div>;
}
