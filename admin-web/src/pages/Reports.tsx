import { BarChart3, CheckCircle2, Users, Wrench, XCircle } from "lucide-react";
import type { ReactNode } from "react";

import { DataState } from "../components/DataState";
import { useCollectionData } from "../hooks/useCollectionData";
import type {
  ServiceRequestRecord,
  ServiceReviewRecord,
  UserRecord,
} from "../types";
import { average, displayText, statusLabel } from "../utils/format";

export default function Reports() {
  const users = useCollectionData<UserRecord>("users");
  const requests = useCollectionData<ServiceRequestRecord>("service_requests");
  const reviews = useCollectionData<ServiceReviewRecord>("service_reviews");
  const loading = users.loading || requests.loading || reviews.loading;
  const error = users.error || requests.error || reviews.error;
  const completed = requests.data.filter((request) => request.status === "completed");
  const cancelled = requests.data.filter((request) => request.status === "cancelled");
  const avgRating = average(
    reviews.data.map((review) => Number(review.rating ?? 0)).filter(Boolean)
  );

  const byStatus = groupCounts(requests.data, (request) => request.status ?? "unknown");
  const byCategory = groupCounts(
    requests.data,
    (request) => request.serviceCategory ?? "Uncategorized"
  );
  const byDivision = groupCounts(
    requests.data,
    (request) => request.division || request.serviceArea || "Unassigned Division"
  );

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Reports</h1>
          <p>Real Firestore summaries for ServicePilot operations.</p>
        </div>
      </div>

      <DataState loading={loading} error={error} empty={false}>
        <div className="stats-grid">
          <ReportStat title="Total Requests" value={requests.data.length} icon={<Wrench />} />
          <ReportStat title="Completed Jobs" value={completed.length} icon={<CheckCircle2 />} />
          <ReportStat title="Cancelled Jobs" value={cancelled.length} icon={<XCircle />} />
          <ReportStat
            title="Active Customers"
            value={users.data.filter((user) => user.role === "customer").length}
            icon={<Users />}
          />
          <ReportStat
            title="Average Rating"
            value={avgRating ? avgRating.toFixed(1) : "0"}
            icon={<BarChart3 />}
          />
        </div>

        <div className="reports-grid">
          <ReportList title="Requests by Status" rows={byStatus} />
          <ReportList title="Requests by Category" rows={byCategory} />
          <ReportList title="Requests by Division" rows={byDivision} />
        </div>
      </DataState>
    </>
  );
}

function groupCounts<T>(items: T[], keyFn: (item: T) => string) {
  const map = new Map<string, number>();

  for (const item of items) {
    const key = keyFn(item);
    map.set(key, (map.get(key) ?? 0) + 1);
  }

  return Array.from(map.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((first, second) => second.value - first.value);
}

function ReportStat({
  title,
  value,
  icon,
}: {
  title: string;
  value: number | string;
  icon: ReactNode;
}) {
  return (
    <div className="stat-card compact-stat">
      <div className="stat-icon blue">{icon}</div>
      <div className="stat-content">
        <span>{title}</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function ReportList({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; value: number }[];
}) {
  const max = Math.max(...rows.map((row) => row.value), 1);

  return (
    <section className="dashboard-card">
      <div className="card-heading">
        <div>
          <h2>{title}</h2>
          <p>{rows.length === 0 ? "No data" : "Current distribution"}</p>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="inline-empty">No data</div>
      ) : (
        <div className="report-list">
          {rows.map((row) => (
            <div className="report-row" key={row.label}>
              <div>
                <span>{statusLabel(displayText(row.label))}</span>
                <strong>{row.value}</strong>
              </div>
              <div className="report-track">
                <span style={{ width: `${(row.value / max) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
