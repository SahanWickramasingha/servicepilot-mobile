import {
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Download,
  TrendingUp,
  UserCog,
  Users,
  Wrench,
  XCircle,
} from "lucide-react";
import { useState } from "react";

const monthlyData = [
  { month: "Apr", requests: 120 },
  { month: "May", requests: 145 },
  { month: "Jun", requests: 132 },
  { month: "Jul", requests: 168 },
  { month: "Aug", requests: 190 },
  { month: "Sep", requests: 215 },
];

const servicePerformance = [
  { name: "AC Repair", value: 82 },
  { name: "Plumbing", value: 70 },
  { name: "Electrical", value: 64 },
  { name: "Appliance Repair", value: 58 },
  { name: "Refrigerator Repair", value: 48 },
];

const technicianPerformance = [
  {
    name: "Ruwan Silva",
    rating: 4.9,
    jobs: 156,
    completion: 98,
  },
  {
    name: "Alex Smith",
    rating: 4.8,
    jobs: 124,
    completion: 96,
  },
  {
    name: "Nuwan Fernando",
    rating: 4.8,
    jobs: 87,
    completion: 95,
  },
  {
    name: "Kasun Perera",
    rating: 4.7,
    jobs: 98,
    completion: 94,
  },
];

export default function Reports() {
  const [range, setRange] = useState("This Month");

  const maxRequests = Math.max(
    ...monthlyData.map((item) => item.requests)
  );

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Reports & Analytics</h1>

          <p>
            Monitor ServicePilot performance,
            trends and operational metrics.
          </p>
        </div>

        <div className="reports-header-actions">
          <select
            value={range}
            onChange={(event) =>
              setRange(event.target.value)
            }
            className="reports-range"
          >
            <option>This Week</option>
            <option>This Month</option>
            <option>Last 3 Months</option>
            <option>This Year</option>
          </select>

          <button className="export-report-button">
            <Download size={16} />
            Export Report
          </button>
        </div>
      </div>

      <div className="reports-stats-grid">
        <ReportStat
          title="Total Requests"
          value="248"
          subtitle="+12.4% from last month"
          tone="blue"
          icon={<Wrench size={21} />}
        />

        <ReportStat
          title="Completed"
          value="198"
          subtitle="79.8% completion rate"
          tone="green"
          icon={<CheckCircle2 size={21} />}
        />

        <ReportStat
          title="Cancelled"
          value="14"
          subtitle="5.6% cancellation rate"
          tone="red"
          icon={<XCircle size={21} />}
        />

        <ReportStat
          title="Active Customers"
          value="1,284"
          subtitle="+28 new customers"
          tone="purple"
          icon={<Users size={21} />}
        />
      </div>

      <div className="reports-main-grid">
        <section className="dashboard-card report-chart-card">
          <div className="report-card-heading">
            <div>
              <h2>Monthly Service Requests</h2>
              <p>
                Request volume during the selected period
              </p>
            </div>

            <TrendingUp size={20} />
          </div>

          <div className="bar-chart">
            {monthlyData.map((item) => (
              <div
                className="bar-chart-item"
                key={item.month}
              >
                <span className="bar-value">
                  {item.requests}
                </span>

                <div className="bar-track">
                  <div
                    className="bar-value-column"
                    style={{
                      height: `${
                        (item.requests / maxRequests) * 100
                      }%`,
                    }}
                  />
                </div>

                <span className="bar-label">
                  {item.month}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="dashboard-card report-status-card">
          <div className="report-card-heading">
            <div>
              <h2>Request Status</h2>
              <p>Current request distribution</p>
            </div>

            <BarChart3 size={20} />
          </div>

          <StatusRow
            label="Completed"
            value={198}
            total={248}
            tone="green"
          />

          <StatusRow
            label="In Progress"
            value={18}
            total={248}
            tone="blue"
          />

          <StatusRow
            label="Pending"
            value={14}
            total={248}
            tone="orange"
          />

          <StatusRow
            label="Cancelled"
            value={14}
            total={248}
            tone="red"
          />
        </section>
      </div>

      <div className="reports-secondary-grid">
        <section className="dashboard-card">
          <div className="report-card-heading">
            <div>
              <h2>Service Performance</h2>
              <p>
                Most requested service categories
              </p>
            </div>

            <Wrench size={20} />
          </div>

          <div className="service-performance-list">
            {servicePerformance.map(
              (service, index) => (
                <div
                  className="service-performance-row"
                  key={service.name}
                >
                  <div className="service-rank">
                    {index + 1}
                  </div>

                  <div className="service-performance-main">
                    <div className="service-performance-top">
                      <span>{service.name}</span>
                      <strong>{service.value}</strong>
                    </div>

                    <div className="service-performance-track">
                      <div
                        style={{
                          width: `${
                            (service.value / 82) * 100
                          }%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              )
            )}
          </div>
        </section>

        <section className="dashboard-card">
          <div className="report-card-heading">
            <div>
              <h2>Technician Performance</h2>
              <p>
                Highest performing field technicians
              </p>
            </div>

            <UserCog size={20} />
          </div>

          <div className="technician-performance-list">
            {technicianPerformance.map(
              (technician, index) => (
                <div
                  className="technician-performance-row"
                  key={technician.name}
                >
                  <div className="technician-performance-rank">
                    {index + 1}
                  </div>

                  <div className="technician-performance-name">
                    <strong>
                      {technician.name}
                    </strong>

                    <span>
                      {technician.jobs} completed jobs
                    </span>
                  </div>

                  <div className="technician-performance-meta">
                    <strong>
                      ⭐ {technician.rating}
                    </strong>

                    <span>
                      {technician.completion}%
                    </span>
                  </div>
                </div>
              )
            )}
          </div>
        </section>
      </div>

      <section className="dashboard-card report-summary-card">
        <div className="report-card-heading">
          <div>
            <h2>Operational Summary</h2>

            <p>
              Key ServicePilot metrics for {range}
            </p>
          </div>

          <CalendarDays size={20} />
        </div>

        <div className="operational-summary-grid">
          <SummaryItem
            title="Average Response Time"
            value="18 min"
          />

          <SummaryItem
            title="Average Job Duration"
            value="1h 42m"
          />

          <SummaryItem
            title="Customer Satisfaction"
            value="4.8 / 5"
          />

          <SummaryItem
            title="Technician Utilization"
            value="86%"
          />

          <SummaryItem
            title="First Visit Resolution"
            value="91%"
          />

          <SummaryItem
            title="Emergency Jobs"
            value="9"
          />
        </div>
      </section>
    </>
  );
}

function ReportStat({
  title,
  value,
  subtitle,
  icon,
  tone,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ReactNode;
  tone: string;
}) {
  return (
    <div className="report-stat-card">
      <div className={`report-stat-icon ${tone}`}>
        {icon}
      </div>

      <div>
        <span>{title}</span>
        <strong>{value}</strong>
        <small>{subtitle}</small>
      </div>
    </div>
  );
}

function StatusRow({
  label,
  value,
  total,
  tone,
}: {
  label: string;
  value: number;
  total: number;
  tone: string;
}) {
  const percentage = Math.round(
    (value / total) * 100
  );

  return (
    <div className="report-status-row">
      <div className="report-status-top">
        <span>{label}</span>

        <div>
          <strong>{value}</strong>
          <small>{percentage}%</small>
        </div>
      </div>

      <div className="report-status-track">
        <div
          className={tone}
          style={{
            width: `${percentage}%`,
          }}
        />
      </div>
    </div>
  );
}

function SummaryItem({
  title,
  value,
}: {
  title: string;
  value: string;
}) {
  return (
    <div className="operational-summary-item">
      <span>{title}</span>
      <strong>{value}</strong>
    </div>
  );
}