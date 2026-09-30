import { Mail, Plus, Search, ShieldCheck, UserRound, X } from "lucide-react";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";

import { useAdminAuth } from "../auth/AdminAuthContext";
import {
  AccountLifecycleActions,
  AccountLifecycleDialog,
  statusChipLabel,
  statusChipTone,
} from "../components/AccountLifecycleActions";
import { DataState, StatusChip } from "../components/DataState";
import { useCollectionData } from "../hooks/useCollectionData";
import {
  updateManagedAccountLifecycle,
  type AccountLifecycleAction,
} from "../services/accountLifecycleService";
import {
  createDispatcherInvitation,
  generateDispatcherId,
} from "../services/dispatcherProvisioningService";
import type { UserRecord } from "../types";
import { displayText, formatDateTime } from "../utils/format";

type DispatcherForm = {
  fullName: string;
  email: string;
};

const emptyForm: DispatcherForm = {
  fullName: "",
  email: "",
};

export default function Dispatchers() {
  const { firebaseUser } = useAdminAuth();
  const users = useCollectionData<UserRecord>("users");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedDispatcher, setSelectedDispatcher] =
    useState<UserRecord | null>(null);
  const [lifecycleDialog, setLifecycleDialog] = useState<{
    account: UserRecord;
    action: AccountLifecycleAction;
  } | null>(null);
  const [form, setForm] = useState<DispatcherForm>(emptyForm);
  const [previewId, setPreviewId] = useState(generateDispatcherId());
  const [saving, setSaving] = useState(false);
  const [savingLifecycle, setSavingLifecycle] = useState(false);
  const [lifecycleError, setLifecycleError] = useState("");
  const [message, setMessage] = useState("");
  const [formError, setFormError] = useState("");

  const dispatchers = useMemo(
    () =>
      users.data.filter((user) => {
        if (user.role !== "dispatcher") {
          return false;
        }

        const haystack = [
          user.dispatcherId,
          user.fullName,
          user.email,
          user.uid,
        ]
          .join(" ")
          .toLowerCase();
        const status =
          user.accountStatus === "deleted"
            ? "deleted"
            : user.accountStatus === "disabled"
            ? "disabled"
            : user.invitationStatus === "pending"
              ? "invited"
              : "active";

        return (
          haystack.includes(search.toLowerCase()) &&
          (statusFilter === "all" || status === statusFilter)
        );
      }),
    [search, statusFilter, users.data]
  );

  const allDispatchers = users.data.filter((user) => user.role === "dispatcher");
  const invitedCount = allDispatchers.filter(
    (user) => user.invitationStatus === "pending"
  ).length;
  const disabledCount = allDispatchers.filter(
    (user) => user.accountStatus === "disabled"
  ).length;
  const deletedCount = allDispatchers.filter(
    (user) => user.accountStatus === "deleted"
  ).length;
  const activeCount = allDispatchers.filter(
    (user) =>
      user.accountStatus !== "disabled" &&
      user.accountStatus !== "deleted" &&
      user.invitationStatus !== "pending"
  ).length;

  const openCreateModal = () => {
    setForm(emptyForm);
    setFormError("");
    setMessage("");
    setPreviewId(generateDispatcherId());
    setModalOpen(true);
  };

  const createDispatcher = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError("");
    setMessage("");

    try {
      setSaving(true);
      await createDispatcherInvitation(form);
      setMessage(
        "Dispatcher account created successfully. A password setup link has been sent to the dispatcher's email."
      );
      setModalOpen(false);
      setForm(emptyForm);
      setPreviewId(generateDispatcherId());
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "Unable to create dispatcher account setup link."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Dispatchers</h1>
          <p>Create account setup links and manage dispatcher access.</p>
        </div>
        <button className="primary-action" onClick={openCreateModal}>
          <Plus size={16} />
          Create Dispatcher
        </button>
      </div>

      <div className="stats-grid small">
        <MiniStat label="Active Dispatchers" value={activeCount} icon={<ShieldCheck />} />
        <MiniStat label="Invited Dispatchers" value={invitedCount} icon={<Mail />} />
        <MiniStat label="Disabled Dispatchers" value={disabledCount} icon={<X />} />
        <MiniStat label="Deleted Dispatchers" value={deletedCount} icon={<X />} />
      </div>

      {message && <div className="form-success">{message}</div>}

      <section className="dashboard-card">
        <div className="table-toolbar">
          <div className="table-search">
            <Search size={17} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search dispatcher ID, name or email..."
            />
          </div>
          <select
            className="table-filter"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="invited">Invited</option>
            <option value="disabled">Disabled</option>
            <option value="deleted">Deleted</option>
          </select>
        </div>

        <DataState
          loading={users.loading}
          error={users.error}
          empty={dispatchers.length === 0}
        >
          <div className="table-wrapper">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Dispatcher ID</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Invitation</th>
                  <th>Account</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {dispatchers.map((dispatcher) => {
                  const pending = dispatcher.invitationStatus === "pending";

                  return (
                    <tr key={dispatcher.id}>
                      <td>
                        <strong>{displayText(dispatcher.dispatcherId)}</strong>
                        <span>{dispatcher.uid ?? dispatcher.id}</span>
                      </td>
                      <td>{displayText(dispatcher.fullName)}</td>
                      <td>{displayText(dispatcher.email)}</td>
                      <td>
                        <StatusChip
                          value={pending ? "Invited" : "Accepted"}
                          tone={pending ? "yellow" : "green"}
                        />
                      </td>
                      <td>
                        <StatusChip
                          value={statusChipLabel(dispatcher.accountStatus)}
                          tone={statusChipTone(dispatcher.accountStatus)}
                        />
                      </td>
                      <td>{formatDateTime(dispatcher.createdAt)}</td>
                      <td>
                        <AccountLifecycleActions
                          account={dispatcher}
                          busy={savingLifecycle}
                          onView={() => setSelectedDispatcher(dispatcher)}
                          onAction={(action) => {
                            setLifecycleError("");
                            setMessage("");
                            setLifecycleDialog({ account: dispatcher, action });
                          }}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </DataState>
      </section>

      {modalOpen && (
        <div className="admin-modal-overlay">
          <form className="admin-modal" onSubmit={createDispatcher}>
            <div className="admin-modal-header">
              <div>
                <h2>Create Dispatcher</h2>
                <span>Send a Firebase password setup link.</span>
              </div>
              <button
                className="modal-close"
                type="button"
                onClick={() => setModalOpen(false)}
              >
                <X size={19} />
              </button>
            </div>

            <div className="generated-id-panel">
              <span>Generated Dispatcher ID</span>
              <strong>{previewId}</strong>
              <small>
                The final ID is generated cryptographically during provisioning.
              </small>
            </div>

            <div className="admin-form-grid single">
              <AdminField
                icon={<UserRound size={17} />}
                label="Full Name"
                value={form.fullName}
                onChange={(value) =>
                  setForm((current) => ({ ...current, fullName: value }))
                }
                disabled={saving}
              />
              <AdminField
                icon={<Mail size={17} />}
                label="Email"
                type="email"
                value={form.email}
                onChange={(value) =>
                  setForm((current) => ({ ...current, email: value }))
                }
                disabled={saving}
              />
            </div>

            {formError && <div className="form-error">{formError}</div>}

            <div className="modal-actions">
              <button
                className="secondary-action"
                type="button"
                onClick={() => setModalOpen(false)}
                disabled={saving}
              >
                Cancel
              </button>
              <button className="primary-action" disabled={saving}>
                {saving ? "Sending..." : "Send Account Setup Link"}
              </button>
            </div>
          </form>
        </div>
      )}

      {selectedDispatcher && (
        <div className="admin-modal-overlay">
          <div className="admin-modal">
            <div className="admin-modal-header">
              <div>
                <h2>Dispatcher Profile</h2>
                <span>{selectedDispatcher.uid ?? selectedDispatcher.id}</span>
              </div>
              <button
                className="modal-close"
                onClick={() => setSelectedDispatcher(null)}
              >
                <X size={19} />
              </button>
            </div>

            <div className="modal-hero">
              <div className="modal-avatar">
                <ShieldCheck size={26} />
              </div>
              <div>
                <strong>{displayText(selectedDispatcher.fullName)}</strong>
                <span>{displayText(selectedDispatcher.email)}</span>
              </div>
            </div>

            <div className="detail-grid">
              <Detail label="Dispatcher ID" value={selectedDispatcher.dispatcherId} />
              <Detail
                label="Invitation"
                value={
                  selectedDispatcher.invitationStatus === "pending"
                    ? "Invited"
                    : "Accepted"
                }
              />
              <Detail
                label="Account Status"
                value={statusChipLabel(selectedDispatcher.accountStatus)}
              />
              <Detail label="Created By" value={selectedDispatcher.createdBy} />
              <Detail label="Created" value={formatDateTime(selectedDispatcher.createdAt)} />
              <Detail label="Disabled At" value={formatDateTime(selectedDispatcher.disabledAt)} />
              <Detail label="Enabled At" value={formatDateTime(selectedDispatcher.enabledAt)} />
              <Detail label="Deleted At" value={formatDateTime(selectedDispatcher.deletedAt)} />
            </div>
          </div>
        </div>
      )}

      {lifecycleDialog && (
        <AccountLifecycleDialog
          action={lifecycleDialog.action}
          account={lifecycleDialog.account}
          busy={savingLifecycle}
          error={lifecycleError}
          onCancel={() => {
            if (!savingLifecycle) {
              setLifecycleDialog(null);
              setLifecycleError("");
            }
          }}
          onConfirm={async () => {
            if (!firebaseUser) {
              setLifecycleError("Please sign in as Super Admin first.");
              return;
            }

            try {
              setSavingLifecycle(true);
              setLifecycleError("");
              await updateManagedAccountLifecycle({
                actorUid: firebaseUser.uid,
                target: lifecycleDialog.account,
                action: lifecycleDialog.action,
              });
              setMessage(
                `Dispatcher account ${lifecycleDialog.action === "enable" ? "enabled" : `${lifecycleDialog.action}d`}.`
              );
              setLifecycleDialog(null);
            } catch (error) {
              setLifecycleError(
                error instanceof Error
                  ? error.message
                  : "Unable to update this account."
              );
            } finally {
              setSavingLifecycle(false);
            }
          }}
        />
      )}
    </>
  );
}

function Detail({ label, value }: { label: string; value?: string }) {
  return (
    <div className="detail-item">
      <span>{label}</span>
      <strong>{displayText(value)}</strong>
    </div>
  );
}

function MiniStat({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: ReactNode;
}) {
  return (
    <div className="stat-card compact-stat">
      <div className="stat-icon purple">{icon}</div>
      <div className="stat-content">
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function AdminField({
  icon,
  label,
  value,
  onChange,
  type = "text",
  disabled,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  disabled: boolean;
}) {
  return (
    <label className="admin-field">
      <span>{label}</span>
      <div>
        {icon}
        <input
          value={value}
          type={type}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          required
        />
      </div>
    </label>
  );
}
