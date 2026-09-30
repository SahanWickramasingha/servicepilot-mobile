import { Search, UserCog, X } from "lucide-react";
import { useMemo, useState } from "react";

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
import type { UserRecord } from "../types";
import { displayText, formatDateTime, statusLabel } from "../utils/format";

export default function Technicians() {
  const { firebaseUser } = useAdminAuth();
  const users = useCollectionData<UserRecord>("users");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedTechnician, setSelectedTechnician] =
    useState<UserRecord | null>(null);
  const [lifecycleDialog, setLifecycleDialog] = useState<{
    account: UserRecord;
    action: AccountLifecycleAction;
  } | null>(null);
  const [savingLifecycle, setSavingLifecycle] = useState(false);
  const [lifecycleError, setLifecycleError] = useState("");
  const [message, setMessage] = useState("");

  const technicians = useMemo(
    () =>
      users.data.filter((user) => {
        if (user.role !== "technician") {
          return false;
        }

        const approval = user.technicianApprovalStatus ?? "pending";
        const haystack = [
          user.fullName,
          user.email,
          user.phone,
          user.specialization,
          user.serviceDivision,
          user.experience,
        ]
          .join(" ")
          .toLowerCase();

        return (
          haystack.includes(search.toLowerCase()) &&
          (statusFilter === "all" || approval === statusFilter)
        );
      }),
    [search, statusFilter, users.data]
  );

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Technicians</h1>
          <p>Monitor technician applications and approval state.</p>
        </div>
      </div>

      <div className="table-toolbar">
        <div className="table-search">
          <Search size={17} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search technicians..."
          />
        </div>
        <select
          className="table-filter"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
        >
          <option value="all">All</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      {message && <div className="form-success">{message}</div>}

      <section className="dashboard-card">
        <DataState
          loading={users.loading}
          error={users.error}
          empty={technicians.length === 0}
        >
          <div className="table-wrapper">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Technician</th>
                  <th>Specialization</th>
                  <th>Division</th>
                  <th>Experience</th>
                  <th>Rating</th>
                  <th>Approval</th>
                  <th>Account</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {technicians.map((technician) => {
                  const approval = technician.technicianApprovalStatus ?? "pending";

                  return (
                    <tr key={technician.id}>
                      <td>
                        <strong>{displayText(technician.fullName)}</strong>
                        <span>{displayText(technician.email)}</span>
                      </td>
                      <td>{displayText(technician.specialization)}</td>
                      <td>
                        {displayText(
                          technician.serviceDivision || technician.serviceAreas
                        )}
                      </td>
                      <td>{displayText(technician.experience)}</td>
                      <td>
                        {technician.averageRating
                          ? `${technician.averageRating.toFixed(1)} (${technician.reviewCount ?? 0})`
                          : "0"}
                      </td>
                      <td>
                        <StatusChip
                          value={statusLabel(approval)}
                          tone={
                            approval === "approved"
                              ? "green"
                              : approval === "rejected"
                                ? "red"
                                : "yellow"
                          }
                        />
                      </td>
                      <td>
                        <StatusChip
                          value={statusChipLabel(technician.accountStatus)}
                          tone={statusChipTone(technician.accountStatus)}
                        />
                      </td>
                      <td>{formatDateTime(technician.createdAt)}</td>
                      <td>
                        <AccountLifecycleActions
                          account={technician}
                          busy={savingLifecycle}
                          onView={() => setSelectedTechnician(technician)}
                          onAction={(action) => {
                            setLifecycleError("");
                            setMessage("");
                            setLifecycleDialog({ account: technician, action });
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

      {selectedTechnician && (
        <div className="admin-modal-overlay">
          <div className="admin-modal">
            <div className="admin-modal-header">
              <div>
                <h2>Technician Profile</h2>
                <span>{selectedTechnician.uid ?? selectedTechnician.id}</span>
              </div>
              <button
                className="modal-close"
                onClick={() => setSelectedTechnician(null)}
              >
                <X size={19} />
              </button>
            </div>

            <div className="modal-hero">
              <div className="modal-avatar">
                <UserCog size={26} />
              </div>
              <div>
                <strong>{displayText(selectedTechnician.fullName)}</strong>
                <span>{displayText(selectedTechnician.email)}</span>
              </div>
            </div>

            <div className="detail-grid">
              <Detail label="Phone" value={selectedTechnician.phone} />
              <Detail label="Address" value={selectedTechnician.address} />
              <Detail label="Specialization" value={selectedTechnician.specialization} />
              <Detail label="Experience" value={selectedTechnician.experience} />
              <Detail label="Qualifications" value={selectedTechnician.qualifications} />
              <Detail label="Certifications" value={selectedTechnician.certifications} />
              <Detail
                label="Service Division"
                value={selectedTechnician.serviceDivision || selectedTechnician.serviceAreas}
              />
              <Detail
                label="Reviewed By"
                value={selectedTechnician.reviewedBy ?? undefined}
              />
              <Detail
                label="Reviewed At"
                value={formatDateTime(selectedTechnician.reviewedAt)}
              />
              <Detail
                label="Rejection Reason"
                value={selectedTechnician.rejectionReason ?? undefined}
              />
              <Detail
                label="Account Status"
                value={statusChipLabel(selectedTechnician.accountStatus)}
              />
              <Detail label="Disabled At" value={formatDateTime(selectedTechnician.disabledAt)} />
              <Detail label="Deleted At" value={formatDateTime(selectedTechnician.deletedAt)} />
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
                `Technician account ${lifecycleDialog.action === "enable" ? "enabled" : `${lifecycleDialog.action}d`}.`
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
