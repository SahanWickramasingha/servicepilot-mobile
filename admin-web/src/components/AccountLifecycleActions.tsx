import {
  Eye,
  LockKeyhole,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";

import type { UserRecord } from "../types";
import {
  accountRoleLabel,
  type AccountLifecycleAction,
  getEffectiveAccountStatus,
} from "../services/accountLifecycleService";

export function statusChipTone(status?: string) {
  const effectiveStatus = getEffectiveAccountStatus(status);

  if (effectiveStatus === "active") {
    return "green" as const;
  }

  if (effectiveStatus === "disabled") {
    return "yellow" as const;
  }

  return "red" as const;
}

export function statusChipLabel(status?: string) {
  const effectiveStatus = getEffectiveAccountStatus(status);
  return effectiveStatus.charAt(0).toUpperCase() + effectiveStatus.slice(1);
}

export function AccountLifecycleActions({
  account,
  busy,
  onView,
  onAction,
}: {
  account: UserRecord;
  busy: boolean;
  onView: () => void;
  onAction: (action: AccountLifecycleAction) => void;
}) {
  const status = getEffectiveAccountStatus(account.accountStatus);

  return (
    <div className="account-action-row">
      <button className="row-action view" onClick={onView} disabled={busy}>
        <Eye size={14} />
        View
      </button>

      {!account.lifecyclePending && status === "active" && (
        <button
          className="row-action disable"
          onClick={() => onAction("disable")}
          disabled={busy}
        >
          <LockKeyhole size={14} />
          Disable
        </button>
      )}

      {!account.lifecyclePending && status === "disabled" && (
        <button
          className="row-action enable"
          onClick={() => onAction("enable")}
          disabled={busy}
        >
          <RotateCcw size={14} />
          Enable
        </button>
      )}

      {account.lifecyclePending && account.lifecycleAction && (
        <button className="row-action enable" disabled={busy} onClick={() => onAction(account.lifecycleAction!)}>
          <RotateCcw size={14} /> Retry {account.lifecycleAction}
        </button>
      )}
      {!account.lifecyclePending && status !== "deleted" && (
        <button
          className="row-action delete"
          onClick={() => onAction("delete")}
          disabled={busy}
        >
          <Trash2 size={14} />
          Delete
        </button>
      )}
    </div>
  );
}

export function AccountLifecycleDialog({
  action,
  account,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  action: AccountLifecycleAction;
  account: UserRecord;
  busy: boolean;
  error: string;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}) {
  const submitting = useRef(false);
  const [confirmationText, setConfirmationText] = useState("");
  const roleLabel = accountRoleLabel(account.role);
  const requiresDeleteText = action === "delete";
  const canConfirm =
    !busy && (!requiresDeleteText || confirmationText.trim() === "DELETE");

  const copy = useMemo(() => {
    if (action === "disable") {
      return {
        title: `Disable ${roleLabel} Account?`,
        body: "The user will no longer be able to access ServicePilot until the account is re-enabled.",
        button: "Disable Account",
      };
    }

    if (action === "enable") {
      return {
        title: `Enable ${roleLabel} Account?`,
        body: "The user must sign in again after enabling. Technician approval and verification are preserved; location sharing stays off.",
        button: "Enable Account",
      };
    }

    return {
      title: `Delete ${roleLabel} Account?`,
      body: "This soft-deletes the account and blocks sign-in. The profile, bookings, reviews and audit history are retained. Ordinary Enable cannot restore it.",
      button: "Delete Account",
    };
  }, [action, roleLabel]);

  return (
    <div className="admin-modal-overlay">
      <div className="admin-modal lifecycle-modal">
        <div className="admin-modal-header">
          <div>
            <h2>{copy.title}</h2>
            <span>{account.uid ?? account.id}</span>
          </div>
          <button className="modal-close" onClick={onCancel} disabled={busy}>
            <X size={19} />
          </button>
        </div>

        <div className={`lifecycle-warning ${action}`}>
          <strong>{account.fullName || account.email || "Selected account"}</strong>
          <p>{copy.body}</p>
        </div>

        {requiresDeleteText && (
          <label className="admin-field modal-field">
            <span>Type DELETE to confirm</span>
            <div>
              <input
                value={confirmationText}
                onChange={(event) => setConfirmationText(event.target.value)}
                disabled={busy}
                autoFocus
              />
            </div>
          </label>
        )}

        {error && <div className="form-error">{error}</div>}

        <div className="modal-actions">
          <button className="secondary-action" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            className={action === "delete" ? "danger-action" : "primary-action"}
            onClick={async () => {
              if (!canConfirm || submitting.current) return;
              submitting.current = true;
              try { await onConfirm(); } finally { submitting.current = false; }
            }}
            disabled={!canConfirm}
          >
            {busy ? "Saving..." : copy.button}
          </button>
        </div>
      </div>
    </div>
  );
}
