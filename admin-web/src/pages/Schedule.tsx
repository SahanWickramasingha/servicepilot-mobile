import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Filter,
  MapPin,
  Search,
  UserCog,
  Wrench,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";

type ScheduleStatus =
  | "Pending"
  | "Scheduled"
  | "In Progress"
  | "Completed";

type Priority =
  | "Low"
  | "Medium"
  | "High"
  | "Emergency";

type ScheduleJob = {
  id: string;
  service: string;
  customer: string;
  location: string;
  date: string;
  time: string;
  duration: string;
  technician: string | null;
  status: ScheduleStatus;
  priority: Priority;
};

type Technician = {
  name: string;
  specialty: string;
  availability: "Available" | "Busy" | "Offline";
};

const technicians: Technician[] = [
  {
    name: "Alex Smith",
    specialty: "AC & Refrigeration",
    availability: "Busy",
  },
  {
    name: "Kasun Perera",
    specialty: "Appliance Repair",
    availability: "Available",
  },
  {
    name: "Ruwan Silva",
    specialty: "Electrical",
    availability: "Available",
  },
  {
    name: "Nuwan Fernando",
    specialty: "Plumbing",
    availability: "Available",
  },
];

const initialJobs: ScheduleJob[] = [
  {
    id: "REQ-2026-0012",
    service: "AC Repair",
    customer: "Emma Johnson",
    location: "Colombo 07",
    date: "2026-09-07",
    time: "10:00 AM",
    duration: "2 Hours",
    technician: "Alex Smith",
    status: "In Progress",
    priority: "High",
  },
  {
    id: "REQ-2026-0011",
    service: "Washing Machine Repair",
    customer: "Sarah Wilson",
    location: "Nugegoda",
    date: "2026-09-07",
    time: "12:30 PM",
    duration: "1.5 Hours",
    technician: "Kasun Perera",
    status: "Scheduled",
    priority: "Medium",
  },
  {
    id: "REQ-2026-0010",
    service: "Electrical Installation",
    customer: "David Perera",
    location: "Colombo 03",
    date: "2026-09-07",
    time: "03:00 PM",
    duration: "3 Hours",
    technician: null,
    status: "Pending",
    priority: "Low",
  },
  {
    id: "REQ-2026-0009",
    service: "Plumbing",
    customer: "Nimal Fernando",
    location: "Dehiwala",
    date: "2026-09-07",
    time: "04:30 PM",
    duration: "2 Hours",
    technician: null,
    status: "Pending",
    priority: "Emergency",
  },
  {
    id: "REQ-2026-0008",
    service: "Refrigerator Repair",
    customer: "Amanda Silva",
    location: "Rajagiriya",
    date: "2026-09-07",
    time: "08:30 AM",
    duration: "2 Hours",
    technician: "Ruwan Silva",
    status: "Completed",
    priority: "Medium",
  },
  {
    id: "REQ-2026-0013",
    service: "Electrical Repair",
    customer: "Kamal Silva",
    location: "Kotte",
    date: "2026-09-08",
    time: "09:00 AM",
    duration: "1 Hour",
    technician: "Ruwan Silva",
    status: "Scheduled",
    priority: "Medium",
  },
];

export default function Schedule() {
  const [jobs, setJobs] =
    useState<ScheduleJob[]>(initialJobs);

  const [selectedDate, setSelectedDate] =
    useState("2026-09-07");

  const [search, setSearch] = useState("");

  const [statusFilter, setStatusFilter] =
    useState("All");

  const [technicianFilter, setTechnicianFilter] =
    useState("All");

  const [assignJob, setAssignJob] =
    useState<ScheduleJob | null>(null);

  const [selectedTechnician, setSelectedTechnician] =
    useState("");

  const filteredJobs = useMemo(() => {
    return jobs.filter((job) => {
      const value = search.toLowerCase();

      const matchesDate =
        job.date === selectedDate;

      const matchesSearch =
        job.id.toLowerCase().includes(value) ||
        job.service.toLowerCase().includes(value) ||
        job.customer.toLowerCase().includes(value) ||
        job.location.toLowerCase().includes(value);

      const matchesStatus =
        statusFilter === "All" ||
        job.status === statusFilter;

      const matchesTechnician =
        technicianFilter === "All" ||
        (technicianFilter === "Unassigned"
          ? !job.technician
          : job.technician === technicianFilter);

      return (
        matchesDate &&
        matchesSearch &&
        matchesStatus &&
        matchesTechnician
      );
    });
  }, [
    jobs,
    selectedDate,
    search,
    statusFilter,
    technicianFilter,
  ]);

  const dayJobs = jobs.filter(
    (job) => job.date === selectedDate
  );

  const scheduledCount = dayJobs.filter(
    (job) => job.status === "Scheduled"
  ).length;

  const pendingCount = dayJobs.filter(
    (job) => job.status === "Pending"
  ).length;

  const activeCount = dayJobs.filter(
    (job) => job.status === "In Progress"
  ).length;

  const completedCount = dayJobs.filter(
    (job) => job.status === "Completed"
  ).length;

  const changeDate = (days: number) => {
    const current = new Date(
      `${selectedDate}T00:00:00`
    );

    current.setDate(
      current.getDate() + days
    );

    setSelectedDate(
      current.toISOString().slice(0, 10)
    );
  };

  const formatDate = (date: string) => {
    return new Date(
      `${date}T00:00:00`
    ).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const openAssign = (job: ScheduleJob) => {
    setAssignJob(job);
    setSelectedTechnician(
      job.technician ?? ""
    );
  };

  const confirmAssignment = () => {
    if (
      !assignJob ||
      !selectedTechnician
    ) {
      return;
    }

    setJobs((current) =>
      current.map((job) =>
        job.id === assignJob.id
          ? {
              ...job,
              technician:
                selectedTechnician,
              status:
                job.status === "Pending"
                  ? "Scheduled"
                  : job.status,
            }
          : job
      )
    );

    setAssignJob(null);
    setSelectedTechnician("");
  };

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Schedule Management</h1>

          <p>
            Manage technician schedules and
            daily service assignments.
          </p>
        </div>

        <div className="schedule-date-control">
          <button
            onClick={() =>
              changeDate(-1)
            }
          >
            <ChevronLeft size={17} />
          </button>

          <div>
            <CalendarDays size={16} />
            <strong>
              {formatDate(selectedDate)}
            </strong>
          </div>

          <button
            onClick={() =>
              changeDate(1)
            }
          >
            <ChevronRight size={17} />
          </button>
        </div>
      </div>

      <div className="schedule-stats-grid">
        <ScheduleStat
          label="Scheduled"
          value={scheduledCount}
          tone="blue"
        />

        <ScheduleStat
          label="Pending"
          value={pendingCount}
          tone="orange"
        />

        <ScheduleStat
          label="In Progress"
          value={activeCount}
          tone="purple"
        />

        <ScheduleStat
          label="Completed"
          value={completedCount}
          tone="green"
        />
      </div>

      <div className="schedule-toolbar">
        <div className="schedule-search">
          <Search size={17} />

          <input
            value={search}
            onChange={(event) =>
              setSearch(
                event.target.value
              )
            }
            placeholder="Search request, customer, service or location..."
          />
        </div>

        <div className="schedule-filter-box">
          <Filter size={14} />

          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(
                event.target.value
              )
            }
          >
            <option>All</option>
            <option>Pending</option>
            <option>Scheduled</option>
            <option>
              In Progress
            </option>
            <option>Completed</option>
          </select>
        </div>

        <div className="schedule-filter-box">
          <UserCog size={14} />

          <select
            value={technicianFilter}
            onChange={(event) =>
              setTechnicianFilter(
                event.target.value
              )
            }
          >
            <option>All</option>
            <option>Unassigned</option>

            {technicians.map(
              (technician) => (
                <option
                  key={technician.name}
                >
                  {technician.name}
                </option>
              )
            )}
          </select>
        </div>
      </div>

      <section className="dashboard-card schedule-card">
        <div className="schedule-card-heading">
          <div>
            <h2>Daily Schedule</h2>

            <p>
              {filteredJobs.length} service
              jobs for{" "}
              {formatDate(selectedDate)}
            </p>
          </div>
        </div>

        <div className="schedule-timeline">
          {filteredJobs.map((job) => (
            <div
              key={job.id}
              className={`schedule-job ${
                job.priority ===
                "Emergency"
                  ? "schedule-emergency"
                  : ""
              }`}
            >
              <div className="schedule-time">
                <Clock3 size={15} />

                <strong>
                  {job.time}
                </strong>

                <span>
                  {job.duration}
                </span>
              </div>

              <div className="schedule-job-divider" />

              <div className="schedule-job-main">
                <div className="schedule-job-title">
                  <div>
                    <span>
                      {job.id}
                    </span>

                    <h3>
                      {job.service}
                    </h3>
                  </div>

                  <PriorityBadge
                    priority={
                      job.priority
                    }
                  />
                </div>

                <div className="schedule-job-information">
                  <div>
                    <UserCog
                      size={14}
                    />

                    <span>
                      {job.technician ??
                        "Not Assigned"}
                    </span>
                  </div>

                  <div>
                    <MapPin
                      size={14}
                    />

                    <span>
                      {job.location}
                    </span>
                  </div>

                  <div>
                    <Wrench
                      size={14}
                    />

                    <span>
                      {job.customer}
                    </span>
                  </div>
                </div>
              </div>

              <div className="schedule-job-right">
                <ScheduleStatusBadge
                  status={job.status}
                />

                {job.status !==
                  "Completed" && (
                  <button
                    className="schedule-assign-button"
                    onClick={() =>
                      openAssign(job)
                    }
                  >
                    <UserCog
                      size={14}
                    />

                    {job.technician
                      ? "Reassign"
                      : "Assign"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {filteredJobs.length === 0 && (
          <div className="schedule-empty">
            <CalendarDays size={38} />

            <strong>
              No jobs scheduled
            </strong>

            <span>
              There are no matching
              service jobs for this date.
            </span>
          </div>
        )}
      </section>

      {assignJob && (
        <div className="admin-modal-overlay">
          <div className="admin-modal schedule-assign-modal">
            <div className="admin-modal-header">
              <div>
                <h2>
                  {assignJob.technician
                    ? "Reassign Technician"
                    : "Assign Technician"}
                </h2>

                <span>
                  {assignJob.id} •{" "}
                  {assignJob.service}
                </span>
              </div>

              <button
                className="modal-close"
                onClick={() => {
                  setAssignJob(null);
                  setSelectedTechnician(
                    ""
                  );
                }}
              >
                <X size={19} />
              </button>
            </div>

            <div className="schedule-assignment-summary">
              <div>
                <span>Customer</span>
                <strong>
                  {assignJob.customer}
                </strong>
              </div>

              <div>
                <span>Time</span>
                <strong>
                  {assignJob.time}
                </strong>
              </div>

              <div>
                <span>Location</span>
                <strong>
                  {assignJob.location}
                </strong>
              </div>
            </div>

            <h3 className="schedule-tech-title">
              Select Technician
            </h3>

            <div className="schedule-tech-list">
              {technicians.map(
                (technician) => (
                  <button
                    key={technician.name}
                    disabled={
                      technician.availability ===
                      "Offline"
                    }
                    className={`schedule-tech-option ${
                      selectedTechnician ===
                      technician.name
                        ? "selected"
                        : ""
                    }`}
                    onClick={() =>
                      setSelectedTechnician(
                        technician.name
                      )
                    }
                  >
                    <div className="schedule-tech-avatar">
                      <UserCog
                        size={18}
                      />
                    </div>

                    <div className="schedule-tech-info">
                      <strong>
                        {technician.name}
                      </strong>

                      <span>
                        {
                          technician.specialty
                        }
                      </span>
                    </div>

                    <small
                      className={`schedule-tech-status ${technician.availability.toLowerCase()}`}
                    >
                      {
                        technician.availability
                      }
                    </small>
                  </button>
                )
              )}
            </div>

            <div className="schedule-modal-actions">
              <button
                className="modal-secondary-button"
                onClick={() => {
                  setAssignJob(null);
                  setSelectedTechnician(
                    ""
                  );
                }}
              >
                Cancel
              </button>

              <button
                className="modal-primary-button"
                disabled={
                  !selectedTechnician
                }
                onClick={
                  confirmAssignment
                }
              >
                <CheckCircle2
                  size={16}
                />

                Confirm Assignment
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ScheduleStat({
  value,
  label,
  tone,
}: {
  value: number;
  label: string;
  tone: string;
}) {
  return (
    <div
      className={`schedule-stat-card ${tone}`}
    >
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function ScheduleStatusBadge({
  status,
}: {
  status: ScheduleStatus;
}) {
  const key = status
    .toLowerCase()
    .replace(/\s+/g, "-");

  return (
    <span
      className={`schedule-status schedule-status-${key}`}
    >
      {status}
    </span>
  );
}

function PriorityBadge({
  priority,
}: {
  priority: Priority;
}) {
  return (
    <span
      className={`badge priority-${priority.toLowerCase()}`}
    >
      {priority}
    </span>
  );
}