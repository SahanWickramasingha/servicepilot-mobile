import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  MapPin,
  TrendingUp,
  UserCog,
  Users,
  Wrench,
} from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

const recentRequests = [
  {
    id: "REQ-2026-0012",
    service: "AC Repair",
    customer: "Emma Johnson",
    technician: "Alex Smith",
    priority: "High",
    status: "In Progress",
  },
  {
    id: "REQ-2026-0011",
    service: "Washing Machine Repair",
    customer: "Sarah Wilson",
    technician: "Kasun Perera",
    priority: "Medium",
    status: "Assigned",
  },
  {
    id: "REQ-2026-0010",
    service: "Electrical Installation",
    customer: "David Perera",
    technician: "Not Assigned",
    priority: "Low",
    status: "Pending",
  },
  {
    id: "REQ-2026-0009",
    service: "Plumbing",
    customer: "Nimal Fernando",
    technician: "Ruwan Silva",
    priority: "Emergency",
    status: "In Progress",
  },
];

export default function Dashboard() {
  return (
    <>
      {/* Page heading */}
      <div className="page-heading">
        <div>
          <h1>Dashboard</h1>

          <p>
            Monitor ServicePilot operations and field service activity.
          </p>
        </div>

        <div className="dashboard-date">
          <CalendarDays size={17} />
          <span>07 Sep 2026</span>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid">
        <StatCard
          title="Total Requests"
          value="248"
          change="+12.4% this month"
          icon={<Wrench size={23} />}
          tone="blue"
        />

        <StatCard
          title="Active Jobs"
          value="18"
          change="+6 today"
          icon={<Clock3 size={23} />}
          tone="orange"
        />

        <StatCard
          title="Technicians"
          value="42"
          change="36 available"
          icon={<UserCog size={23} />}
          tone="green"
        />

        <StatCard
          title="Customers"
          value="1,284"
          change="+28 this month"
          icon={<Users size={23} />}
          tone="purple"
        />
      </div>

      {/* Overview and Alerts */}
      <div className="dashboard-grid">
        <section className="dashboard-card">
          <div className="card-heading">
            <div>
              <h2>Service Overview</h2>
              <p>Current request status distribution</p>
            </div>

            <TrendingUp size={21} />
          </div>

          <div className="overview-list">
            <OverviewRow
              label="Pending Requests"
              value={14}
              percentage={32}
              type="warning"
            />

            <OverviewRow
              label="Assigned"
              value={21}
              percentage={48}
              type="blue"
            />

            <OverviewRow
              label="In Progress"
              value={18}
              percentage={42}
              type="purple"
            />

            <OverviewRow
              label="Completed Today"
              value={31}
              percentage={72}
              type="success"
            />
          </div>
        </section>

        <section className="dashboard-card alerts-card">
          <div className="card-heading">
            <div>
              <h2>Action Required</h2>
              <p>Items requiring administrator attention</p>
            </div>

            <AlertTriangle size={21} />
          </div>

          <AlertItem
            icon={<AlertTriangle size={18} />}
            title="Emergency Requests"
            text="3 requests need immediate assignment."
            type="danger"
          />

          <AlertItem
            icon={<Clock3 size={18} />}
            title="Unassigned Requests"
            text="7 jobs have not been assigned."
            type="warning"
          />

          <AlertItem
            icon={<CheckCircle2 size={18} />}
            title="Technician Availability"
            text="36 technicians are currently available."
            type="success"
          />
        </section>
      </div>

      {/* Recent requests header */}
      <div className="section-header">
        <div>
          <h2>Recent Service Requests</h2>
          <p>Latest requests submitted by customers</p>
        </div>

        <Link
          to="/requests"
          className="view-all-link"
        >
          View All
          <ArrowRight size={16} />
        </Link>
      </div>

      {/* Requests table */}
      <section className="dashboard-card table-card">
        <div className="table-wrapper">
          <table className="requests-table">
            <thead>
              <tr>
                <th>Request ID</th>
                <th>Service</th>
                <th>Customer</th>
                <th>Technician</th>
                <th>Priority</th>
                <th>Status</th>
              </tr>
            </thead>

            <tbody>
              {recentRequests.map((request) => (
                <tr key={request.id}>
                  <td className="request-id">
                    {request.id}
                  </td>

                  <td>{request.service}</td>

                  <td>{request.customer}</td>

                  <td>{request.technician}</td>

                  <td>
                    <PriorityBadge
                      priority={request.priority}
                    />
                  </td>

                  <td>
                    <StatusBadge
                      status={request.status}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Quick Actions */}
      <div className="section-header quick-heading">
        <div>
          <h2>Quick Actions</h2>
          <p>Common administrator operations</p>
        </div>
      </div>

      <div className="quick-actions-grid">
        <QuickAction
          icon={<Wrench size={22} />}
          title="Manage Requests"
          description="Assign and monitor service jobs"
          path="/requests"
        />

        <QuickAction
          icon={<UserCog size={22} />}
          title="Technicians"
          description="Availability and assignments"
          path="/technicians"
        />

        <QuickAction
          icon={<MapPin size={22} />}
          title="Live Map"
          description="Track active technicians"
          path="/live-map"
        />

        <QuickAction
          icon={<CalendarDays size={22} />}
          title="Schedule"
          description="Manage service schedules"
          path="/schedule"
        />
      </div>
    </>
  );
}

function StatCard({
  title,
  value,
  change,
  icon,
  tone,
}: {
  title: string;
  value: string;
  change: string;
  icon: ReactNode;
  tone: string;
}) {
  return (
    <div className="stat-card">
      <div className={`stat-icon ${tone}`}>
        {icon}
      </div>

      <div className="stat-content">
        <span>{title}</span>
        <strong>{value}</strong>
        <small>{change}</small>
      </div>
    </div>
  );
}

function OverviewRow({
  label,
  value,
  percentage,
  type,
}: {
  label: string;
  value: number;
  percentage: number;
  type: string;
}) {
  return (
    <div className="overview-row">
      <div className="overview-row-top">
        <span>{label}</span>
        <strong>{value}</strong>
      </div>

      <div className="overview-progress">
        <div
          className={`overview-progress-value ${type}`}
          style={{
            width: `${percentage}%`,
          }}
        />
      </div>
    </div>
  );
}

function AlertItem({
  icon,
  title,
  text,
  type,
}: {
  icon: ReactNode;
  title: string;
  text: string;
  type: string;
}) {
  return (
    <div className={`alert-item ${type}`}>
      <div className="alert-icon">
        {icon}
      </div>

      <div>
        <strong>{title}</strong>
        <span>{text}</span>
      </div>
    </div>
  );
}

function PriorityBadge({
  priority,
}: {
  priority: string;
}) {
  const key = priority.toLowerCase();

  return (
    <span className={`badge priority-${key}`}>
      {priority}
    </span>
  );
}

function StatusBadge({
  status,
}: {
  status: string;
}) {
  const key = status
    .toLowerCase()
    .replace(/\s+/g, "-");

  return (
    <span className={`badge status-${key}`}>
      {status}
    </span>
  );
}

function QuickAction({
  icon,
  title,
  description,
  path,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  path: string;
}) {
  return (
    <Link
      to={path}
      className="quick-action-card"
    >
      <div className="quick-action-icon">
        {icon}
      </div>

      <div>
        <strong>{title}</strong>
        <span>{description}</span>
      </div>

      <ArrowRight
        size={18}
        className="quick-action-arrow"
      />
    </Link>
  );
}