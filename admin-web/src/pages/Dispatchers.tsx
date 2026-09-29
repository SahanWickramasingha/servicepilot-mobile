import { Mail, Plus, Search, ShieldCheck, UserRound, X } from "lucide-react";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";

import { DataState, StatusChip } from "../components/DataState";
import { useCollectionData } from "../hooks/useCollectionData";
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
  const users = useCollectionData<UserRecord>("users");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<DispatcherForm>(emptyForm);
  const [previewId, setPreviewId] = useState(generateDispatcherId());
  const [saving, setSaving] = useState(false);
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
          user.accountStatus === "disabled"
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
  const activeCount = allDispatchers.filter(
    (user) =>
      user.accountStatus !== "disabled" &&
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
      const result = await createDispatcherInvitation(form);
      setMessage(
        `Invitation sent. Dispatcher ID: ${result.dispatcherId}`
      );
      setModalOpen(false);
      setForm(emptyForm);
      setPreviewId(generateDispatcherId());
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "Unable to create dispatcher invitation."
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
          <p>Create invitations and manage dispatcher access.</p>
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
                </tr>
              </thead>
              <tbody>
                {dispatchers.map((dispatcher) => {
                  const disabled = dispatcher.accountStatus === "disabled";
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
                          value={disabled ? "Disabled" : "Active"}
                          tone={disabled ? "neutral" : "green"}
                        />
                      </td>
                      <td>{formatDateTime(dispatcher.createdAt)}</td>
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
                <span>Send a Firebase password setup invitation.</span>
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
                {saving ? "Sending..." : "Send Invitation"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
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
