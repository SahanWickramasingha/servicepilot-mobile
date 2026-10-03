import { CheckCircle2, Eye, Search, X, XCircle } from "lucide-react";
import { FirebaseError } from "firebase/app";
import { useMemo, useState } from "react";

import { useAdminAuth } from "../../auth/AdminAuthContext";
import { DataState, StatusChip } from "../../components/DataState";
import { reviewTechnicianApplication } from "../../services/technicianApprovalService";
import { useTechnicianUsers } from "../../hooks/useTechnicianUsers";
import type { UserRecord } from "../../types";
import { displayText, formatDateTime, statusLabel } from "../../utils/format";

export default function DispatcherApplications() {
  const { firebaseUser } = useAdminAuth();
  const technicians = useTechnicianUsers({
    status: "pending",
    page: "dispatcher/applications",
    queryType: "pending-technician-applications",
  });
  const [search, setSearch] = useState("");
  const [selectedTechnician, setSelectedTechnician] =
    useState<UserRecord | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const pendingTechnicians = useMemo(
    () =>
      technicians.data.filter((user) =>
        [
          user.fullName,
          user.email,
          user.specialization,
          user.serviceDivision,
          user.qualifications,
        ]
          .join(" ")
          .toLowerCase()
          .includes(search.toLowerCase())
      ),
    [search, technicians.data]
  );

  const reviewTechnician = async (status: "approved" | "rejected") => {
    if (!firebaseUser || !selectedTechnician) {
      return;
    }

    const reason = rejectionReason.trim();

    if (status === "rejected" && !reason) {
      setError("A rejection reason is required.");
      return;
    }

    try {
      setSaving(true);
      setError("");
      setMessage("");

      await reviewTechnicianApplication({
        technicianUid: selectedTechnician.uid ?? selectedTechnician.id,
        dispatcherUid: firebaseUser.uid,
        status,
        rejectionReason: reason,
      });

      setMessage(
        status === "approved"
          ? "Technician approved."
          : "Technician rejected."
      );
      setSelectedTechnician(null);
      setRejectionReason("");
    } catch (updateError) {
      if (import.meta.env.DEV) {
        const code =
          updateError instanceof FirebaseError
            ? updateError.code
            : "unknown-firestore-error";
        console.warn("Dispatcher technician review failed", {
          page: "dispatcher/applications",
          queryType: "technician-approval-update",
          code,
        });
      }

      setError("Unable to update this technician application.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Applications</h1>
          <p>Review pending technician registrations.</p>
        </div>
      </div>

      <div className="table-toolbar">
        <div className="table-search">
          <Search size={17} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search pending applications..."
          />
        </div>
      </div>

      {message && <div className="form-success">{message}</div>}
      {error && <div className="form-error">{error}</div>}

      <section className="dashboard-card">
        <DataState
          loading={technicians.loading}
          error={technicians.error}
          empty={pendingTechnicians.length === 0}
        >
          <div className="table-wrapper">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Applicant</th>
                  <th>Specialization</th>
                  <th>Division</th>
                  <th>Experience</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {pendingTechnicians.map((technician) => (
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
                      <StatusChip
                        value={statusLabel(technician.technicianApprovalStatus ?? "pending")}
                        tone="yellow"
                      />
                    </td>
                    <td>{formatDateTime(technician.createdAt)}</td>
                    <td>
                      <button
                        className="secondary-action"
                        onClick={() => {
                          setSelectedTechnician(technician);
                          setRejectionReason("");
                          setError("");
                        }}
                      >
                        <Eye size={15} />
                        Review
                      </button>
                    </td>
                  </tr>
                ))}
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
                <h2>Technician Application</h2>
                <span>{selectedTechnician.uid ?? selectedTechnician.id}</span>
              </div>
              <button
                className="modal-close"
                onClick={() => setSelectedTechnician(null)}
              >
                <X size={19} />
              </button>
            </div>

            <div className="detail-grid">
              <Detail label="Full Name" value={selectedTechnician.fullName} />
              <Detail label="Email" value={selectedTechnician.email} />
              <Detail label="Phone" value={selectedTechnician.phone} />
              <Detail label="Specialization" value={selectedTechnician.specialization} />
              <Detail label="Experience" value={selectedTechnician.experience} />
              <Detail label="Qualifications" value={selectedTechnician.qualifications} />
              <Detail label="Certifications" value={selectedTechnician.certifications} />
              <Detail
                label="Service Division"
                value={selectedTechnician.serviceDivision || selectedTechnician.serviceAreas}
              />
            </div>

            <label className="admin-field modal-field">
              <span>Rejection Reason</span>
              <textarea
                value={rejectionReason}
                onChange={(event) => setRejectionReason(event.target.value)}
                placeholder="Required when rejecting"
                disabled={saving}
              />
            </label>

            <div className="modal-actions">
              <button
                className="danger-action"
                onClick={() => reviewTechnician("rejected")}
                disabled={saving}
              >
                <XCircle size={16} />
                Reject
              </button>
              <button
                className="primary-action"
                onClick={() => reviewTechnician("approved")}
                disabled={saving}
              >
                <CheckCircle2 size={16} />
                Approve
              </button>
            </div>
          </div>
        </div>
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
