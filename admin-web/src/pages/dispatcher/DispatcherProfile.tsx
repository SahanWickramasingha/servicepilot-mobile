import { ShieldCheck } from "lucide-react";

import { useAdminAuth } from "../../auth/AdminAuthContext";
import { StatusChip } from "../../components/DataState";
import { displayText, formatDateTime } from "../../utils/format";

export default function DispatcherProfile() {
  const { profile } = useAdminAuth();

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Profile</h1>
          <p>Your Dispatcher account details.</p>
        </div>
      </div>

      <section className="dashboard-card">
        <div className="modal-hero">
          <div className="modal-avatar">
            <ShieldCheck size={26} />
          </div>
          <div>
            <strong>{displayText(profile?.fullName)}</strong>
            <span>{displayText(profile?.email)}</span>
          </div>
        </div>

        <div className="detail-grid">
          <Detail label="Dispatcher ID" value={profile?.dispatcherId} />
          <Detail label="Role" value="Dispatcher" />
          <div className="detail-item">
            <span>Invitation</span>
            <strong>
              <StatusChip
                value={
                  profile?.invitationStatus === "accepted"
                    ? "Accepted"
                    : "Pending"
                }
                tone={
                  profile?.invitationStatus === "accepted"
                    ? "green"
                    : "yellow"
                }
              />
            </strong>
          </div>
          <div className="detail-item">
            <span>Account Status</span>
            <strong>
              <StatusChip
                value={
                  profile?.accountStatus === "disabled"
                    ? "Disabled"
                    : "Active"
                }
                tone={
                  profile?.accountStatus === "disabled"
                    ? "neutral"
                    : "green"
                }
              />
            </strong>
          </div>
          <Detail label="Created By" value={profile?.createdBy} />
          <Detail label="Created" value={formatDateTime(profile?.createdAt)} />
        </div>
      </section>
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
