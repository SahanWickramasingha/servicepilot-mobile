import {
  CheckCircle2,
  ClipboardList,
  Clock3,
  MessageSquareText,
  Star,
  UserCog,
  Users,
  XCircle,
} from "lucide-react";
import type { ReactNode } from "react";

import { DataState, StatusChip } from "../components/DataState";
import { useCollectionData } from "../hooks/useCollectionData";
import type {
  ServiceRequestRecord,
  ServiceReviewRecord,
  UserRecord,
} from "../types";
import { average, displayText, formatDateTime, statusLabel } from "../utils/format";

export default function Dashboard() {
  const users = useCollectionData<UserRecord>("users");
  const requests = useCollectionData<ServiceRequestRecord>("service_requests");
  const reviews = useCollectionData<ServiceReviewRecord>("service_reviews");
  const loading = users.loading || requests.loading || reviews.loading;
  const error = users.error || requests.error || reviews.error;

  const customers = users.data.filter((user) => user.role === "customer");
  const technicians = users.data.filter((user) => user.role === "technician");
  const pendingTechnicians = technicians.filter(
    (user) => (user.technicianApprovalStatus ?? "pending") === "pending"
  );
  const approvedTechnicians = technicians.filter(
    (user) => user.technicianApprovalStatus === "approved"
  );
  const rejectedTechnicians = technicians.filter(
    (user) => user.technicianApprovalStatus === "rejected"
  );
  const activeRequests = requests.data.filter((request) =>
    ["requested", "accepted", "in_progress", "pending", "assigned"].includes(
      request.status ?? ""
    )
  );
  const completedJobs = requests.data.filter(
    (request) => request.status === "completed"
  );
  const cancelledJobs = requests.data.filter(
    (request) => request.status === "cancelled"
  );
  const averageRating = average(
    reviews.data
      .map((review) => Number(review.rating ?? 0))
      .filter((rating) => rating > 0)
  );
  const recentApplications = pendingTechnicians.slice(0, 5);
  const recentRequests = requests.data.slice(0, 6);

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Dashboard</h1>
          <p>Monitor ServicePilot accounts, requests, and reviews.</p>
        </div>
      </div>

      <DataState loading={loading} error={error} empty={false}>
        <div className="stats-grid">
          <StatCard title="Total Customers" value={customers.length} icon={<Users />} tone="indigo" />
          <StatCard title="Total Technicians" value={technicians.length} icon={<UserCog />} tone="cyan" />
          <StatCard title="Approved Technicians" value={approvedTechnicians.length} icon={<CheckCircle2 />} tone="green" />
          <StatCard title="Pending Applications" value={pendingTechnicians.length} icon={<Clock3 />} tone="orange" />
          <StatCard title="Rejected Technicians" value={rejectedTechnicians.length} icon={<XCircle />} tone="slate" />
          <StatCard title="Active Requests" value={activeRequests.length} icon={<ClipboardList />} tone="orange" />
          <StatCard title="Completed Jobs" value={completedJobs.length} icon={<CheckCircle2 />} tone="green" />
          <StatCard title="Cancelled Jobs" value={cancelledJobs.length} icon={<XCircle />} tone="slate" />
          <StatCard title="Total Reviews" value={reviews.data.length} icon={<MessageSquareText />} tone="gold" />
          <StatCard
            title="Average Rating"
            value={averageRating ? averageRating.toFixed(1) : "0"}
            icon={<Star />}
            tone="gold"
          />
        </div>

        <div className="dashboard-grid">
          <section className="dashboard-card">
            <div className="card-heading">
              <div>
                <h2>Recent Technician Applications</h2>
                <p>Pending dispatcher review</p>
              </div>
            </div>

            {recentApplications.length === 0 ? (
              <div className="inline-empty">No pending technician applications.</div>
            ) : (
              <div className="record-list">
                {recentApplications.map((technician) => (
                  <div className="record-row" key={technician.id}>
                    <div>
                      <strong>{displayText(technician.fullName)}</strong>
                      <span>{displayText(technician.email)}</span>
                    </div>
                    <StatusChip value="Pending" tone="yellow" />
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="dashboard-card">
            <div className="card-heading">
              <div>
                <h2>Recent Service Requests</h2>
                <p>Customer-selected technician requests</p>
              </div>
            </div>

            {recentRequests.length === 0 ? (
              <div className="inline-empty">No service requests found.</div>
            ) : (
              <div className="record-list">
                {recentRequests.map((request) => (
                  <div className="record-row" key={request.id}>
                    <div>
                      <strong>{displayText(request.title || request.serviceCategory)}</strong>
                      <span>
                        {displayText(request.customerName)} to{" "}
                        {displayText(request.technicianName)}
                      </span>
                    </div>
                    <div className="record-meta">
                      <StatusChip value={statusLabel(request.status)} tone="blue" />
                      <small>{formatDateTime(request.createdAt)}</small>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </DataState>
    </>
  );
}

function StatCard({
  title,
  value,
  icon,
  tone,
}: {
  title: string;
  value: number | string;
  icon: ReactNode;
  tone: string;
}) {
  return (
    <div className="stat-card compact-stat">
      <div className={`stat-icon ${tone}`}>{icon}</div>
      <div className="stat-content">
        <span>{title}</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}
