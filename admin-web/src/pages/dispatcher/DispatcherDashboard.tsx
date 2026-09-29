import { CheckCircle2, Clock3, UserCog, XCircle } from "lucide-react";
import type { ReactNode } from "react";

import { DataState, StatusChip } from "../../components/DataState";
import { useTechnicianUsers } from "../../hooks/useTechnicianUsers";
import { displayText, formatDateTime } from "../../utils/format";

export default function DispatcherDashboard() {
  const technicians = useTechnicianUsers({
    page: "dispatcher/dashboard",
    queryType: "all-technicians",
  });
  const pending = useTechnicianUsers({
    status: "pending",
    page: "dispatcher/dashboard",
    queryType: "pending-technicians",
  });
  const approved = useTechnicianUsers({
    status: "approved",
    page: "dispatcher/dashboard",
    queryType: "approved-technicians",
  });
  const rejected = useTechnicianUsers({
    status: "rejected",
    page: "dispatcher/dashboard",
    queryType: "rejected-technicians",
  });
  const loading =
    technicians.loading || pending.loading || approved.loading || rejected.loading;
  const error =
    technicians.error || pending.error || approved.error || rejected.error;

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Dispatcher Dashboard</h1>
          <p>Review technician applications and monitor approval status.</p>
        </div>
      </div>

      <DataState loading={loading} error={error} empty={false}>
        <div className="stats-grid small">
          <Stat title="Pending Applications" value={pending.data.length} icon={<Clock3 />} />
          <Stat title="Approved Technicians" value={approved.data.length} icon={<CheckCircle2 />} />
          <Stat title="Rejected Applications" value={rejected.data.length} icon={<XCircle />} />
          <Stat title="Total Technicians" value={technicians.data.length} icon={<UserCog />} />
        </div>

        <section className="dashboard-card">
          <div className="card-heading">
            <div>
              <h2>Recent Applications</h2>
              <p>Newest technician profiles awaiting review</p>
            </div>
          </div>

          {pending.data.slice(0, 6).length === 0 ? (
            <div className="inline-empty">No pending technician applications.</div>
          ) : (
            <div className="record-list">
              {pending.data.slice(0, 6).map((technician) => (
                <div className="record-row" key={technician.id}>
                  <div>
                    <strong>{displayText(technician.fullName)}</strong>
                    <span>
                      {displayText(technician.specialization)} ·{" "}
                      {displayText(technician.serviceDivision || technician.serviceAreas)}
                    </span>
                  </div>
                  <div className="record-meta">
                    <StatusChip value="Pending" tone="yellow" />
                    <small>{formatDateTime(technician.createdAt)}</small>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </DataState>
    </>
  );
}

function Stat({
  title,
  value,
  icon,
}: {
  title: string;
  value: number;
  icon: ReactNode;
}) {
  return (
    <div className="stat-card compact-stat">
      <div className="stat-icon cyan">{icon}</div>
      <div className="stat-content">
        <span>{title}</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}
