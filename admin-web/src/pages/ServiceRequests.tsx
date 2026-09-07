import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Eye,
  Filter,
  MapPin,
  Search,
  UserCog,
  UserRound,
  Wrench,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";

type RequestStatus =
  | "Pending"
  | "Assigned"
  | "In Progress"
  | "Completed"
  | "Cancelled";

type Priority =
  | "Low"
  | "Medium"
  | "High"
  | "Emergency";

type ServiceRequest = {
  id: string;
  service: string;
  customer: string;
  customerPhone: string;
  location: string;
  date: string;
  time: string;
  priority: Priority;
  status: RequestStatus;
  technician: string | null;
  description: string;
};

type Technician = {
  id: string;
  name: string;
  specialty: string;
  rating: number;
  status: "Available" | "Busy" | "Offline";
};

const initialRequests: ServiceRequest[] = [
  {
    id: "REQ-2026-0012",
    service: "AC Repair",
    customer: "Emma Johnson",
    customerPhone: "+94 71 234 5678",
    location: "Colombo 07",
    date: "07 Sep 2026",
    time: "10:00 AM",
    priority: "High",
    status: "In Progress",
    technician: "Alex Smith",
    description:
      "Air conditioner is not cooling properly and makes an unusual noise.",
  },
  {
    id: "REQ-2026-0011",
    service: "Washing Machine Repair",
    customer: "Sarah Wilson",
    customerPhone: "+94 76 456 2211",
    location: "Nugegoda",
    date: "07 Sep 2026",
    time: "12:30 PM",
    priority: "Medium",
    status: "Assigned",
    technician: "Kasun Perera",
    description:
      "Washing machine stops during the spin cycle.",
  },
  {
    id: "REQ-2026-0010",
    service: "Electrical Installation",
    customer: "David Perera",
    customerPhone: "+94 77 556 3322",
    location: "Colombo 03",
    date: "07 Sep 2026",
    time: "03:00 PM",
    priority: "Low",
    status: "Pending",
    technician: null,
    description:
      "Install additional electrical outlets in the office.",
  },
  {
    id: "REQ-2026-0009",
    service: "Plumbing",
    customer: "Nimal Fernando",
    customerPhone: "+94 75 667 1100",
    location: "Dehiwala",
    date: "07 Sep 2026",
    time: "04:30 PM",
    priority: "Emergency",
    status: "Pending",
    technician: null,
    description:
      "Major water leak from the main kitchen pipeline.",
  },
  {
    id: "REQ-2026-0008",
    service: "Refrigerator Repair",
    customer: "Amanda Silva",
    customerPhone: "+94 72 998 4400",
    location: "Rajagiriya",
    date: "06 Sep 2026",
    time: "11:30 AM",
    priority: "Medium",
    status: "Completed",
    technician: "Ruwan Silva",
    description:
      "Refrigerator was not maintaining the correct temperature.",
  },
  {
    id: "REQ-2026-0007",
    service: "TV Repair",
    customer: "Ishara Perera",
    customerPhone: "+94 71 778 9900",
    location: "Kotte",
    date: "06 Sep 2026",
    time: "02:00 PM",
    priority: "Low",
    status: "Cancelled",
    technician: null,
    description:
      "Television display was flickering continuously.",
  },
];

const technicians: Technician[] = [
  {
    id: "TECH-001",
    name: "Alex Smith",
    specialty: "AC & Refrigeration",
    rating: 4.8,
    status: "Busy",
  },
  {
    id: "TECH-002",
    name: "Kasun Perera",
    specialty: "Appliance Repair",
    rating: 4.7,
    status: "Available",
  },
  {
    id: "TECH-003",
    name: "Ruwan Silva",
    specialty: "Electrical",
    rating: 4.9,
    status: "Available",
  },
  {
    id: "TECH-004",
    name: "Nuwan Fernando",
    specialty: "Plumbing",
    rating: 4.8,
    status: "Available",
  },
  {
    id: "TECH-005",
    name: "Sajith Perera",
    specialty: "General Services",
    rating: 4.6,
    status: "Offline",
  },
];

export default function ServiceRequests() {
  const [requests, setRequests] =
    useState<ServiceRequest[]>(initialRequests);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] =
    useState("All");
  const [priorityFilter, setPriorityFilter] =
    useState("All");

  const [selectedRequest, setSelectedRequest] =
    useState<ServiceRequest | null>(null);

  const [assignRequest, setAssignRequest] =
    useState<ServiceRequest | null>(null);

  const [selectedTechnician, setSelectedTechnician] =
    useState("");

  const filteredRequests = useMemo(() => {
    return requests.filter((request) => {
      const searchValue = search.toLowerCase();

      const matchesSearch =
        request.id.toLowerCase().includes(searchValue) ||
        request.service.toLowerCase().includes(searchValue) ||
        request.customer.toLowerCase().includes(searchValue) ||
        request.location.toLowerCase().includes(searchValue);

      const matchesStatus =
        statusFilter === "All" ||
        request.status === statusFilter;

      const matchesPriority =
        priorityFilter === "All" ||
        request.priority === priorityFilter;

      return (
        matchesSearch &&
        matchesStatus &&
        matchesPriority
      );
    });
  }, [
    requests,
    search,
    statusFilter,
    priorityFilter,
  ]);

  const pendingCount = requests.filter(
    (request) => request.status === "Pending"
  ).length;

  const activeCount = requests.filter(
    (request) =>
      request.status === "Assigned" ||
      request.status === "In Progress"
  ).length;

  const emergencyCount = requests.filter(
    (request) =>
      request.priority === "Emergency" &&
      request.status !== "Completed" &&
      request.status !== "Cancelled"
  ).length;

  const completedCount = requests.filter(
    (request) => request.status === "Completed"
  ).length;

  const openAssignModal = (
    request: ServiceRequest
  ) => {
    setAssignRequest(request);
    setSelectedTechnician(
      request.technician ?? ""
    );
  };

  const closeAssignModal = () => {
    setAssignRequest(null);
    setSelectedTechnician("");
  };

  const handleAssign = () => {
    if (!assignRequest || !selectedTechnician) {
      return;
    }

    setRequests((current) =>
      current.map((request) =>
        request.id === assignRequest.id
          ? {
              ...request,
              technician: selectedTechnician,
              status:
                request.status === "Pending"
                  ? "Assigned"
                  : request.status,
            }
          : request
      )
    );

    closeAssignModal();
  };

  return (
    <>
      {/* Header */}

      <div className="page-heading requests-page-heading">
        <div>
          <h1>Service Requests</h1>

          <p>
            Monitor, assign and manage customer service
            requests.
          </p>
        </div>

        <div className="requests-total-badge">
          <Wrench size={17} />
          <span>{requests.length} Requests</span>
        </div>
      </div>

      {/* Stats */}

      <div className="request-stats-grid">
        <RequestStat
          label="Pending"
          value={pendingCount}
          className="request-stat-warning"
          icon={<Clock3 size={20} />}
        />

        <RequestStat
          label="Active Jobs"
          value={activeCount}
          className="request-stat-blue"
          icon={<Wrench size={20} />}
        />

        <RequestStat
          label="Emergency"
          value={emergencyCount}
          className="request-stat-danger"
          icon={<AlertTriangle size={20} />}
        />

        <RequestStat
          label="Completed"
          value={completedCount}
          className="request-stat-success"
          icon={<CheckCircle2 size={20} />}
        />
      </div>

      {/* Search + Filters */}

      <div className="requests-toolbar">
        <div className="request-search">
          <Search size={17} />

          <input
            value={search}
            onChange={(event) =>
              setSearch(event.target.value)
            }
            placeholder="Search ID, service, customer or location..."
          />
        </div>

        <div className="request-filter">
          <Filter size={15} />

          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value)
            }
          >
            <option>All</option>
            <option>Pending</option>
            <option>Assigned</option>
            <option>In Progress</option>
            <option>Completed</option>
            <option>Cancelled</option>
          </select>
        </div>

        <div className="request-filter">
          <AlertTriangle size={15} />

          <select
            value={priorityFilter}
            onChange={(event) =>
              setPriorityFilter(
                event.target.value
              )
            }
          >
            <option>All</option>
            <option>Low</option>
            <option>Medium</option>
            <option>High</option>
            <option>Emergency</option>
          </select>
        </div>
      </div>

      {/* Table */}

      <section className="dashboard-card request-management-card">
        <div className="request-table-header">
          <div>
            <h2>All Requests</h2>

            <p>
              {filteredRequests.length} matching
              request
              {filteredRequests.length !== 1
                ? "s"
                : ""}
            </p>
          </div>
        </div>

        <div className="table-wrapper">
          <table className="service-request-table">
            <thead>
              <tr>
                <th>Request</th>
                <th>Customer</th>
                <th>Schedule</th>
                <th>Location</th>
                <th>Priority</th>
                <th>Technician</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>

            <tbody>
              {filteredRequests.map((request) => (
                <tr
                  key={request.id}
                  className={
                    request.priority === "Emergency"
                      ? "emergency-row"
                      : ""
                  }
                >
                  <td>
                    <div className="request-service-cell">
                      <div className="request-service-icon">
                        <Wrench size={17} />
                      </div>

                      <div>
                        <strong>
                          {request.service}
                        </strong>

                        <span>{request.id}</span>
                      </div>
                    </div>
                  </td>

                  <td>
                    <div className="table-primary">
                      {request.customer}
                    </div>

                    <div className="table-secondary">
                      {request.customerPhone}
                    </div>
                  </td>

                  <td>
                    <div className="table-primary">
                      {request.date}
                    </div>

                    <div className="table-secondary">
                      {request.time}
                    </div>
                  </td>

                  <td>
                    <div className="location-table-cell">
                      <MapPin size={14} />
                      {request.location}
                    </div>
                  </td>

                  <td>
                    <PriorityBadge
                      priority={request.priority}
                    />
                  </td>

                  <td>
                    {request.technician ? (
                      <div className="assigned-tech">
                        <div className="small-tech-avatar">
                          <UserCog size={14} />
                        </div>

                        <span>
                          {request.technician}
                        </span>
                      </div>
                    ) : (
                      <span className="not-assigned">
                        Not Assigned
                      </span>
                    )}
                  </td>

                  <td>
                    <StatusBadge
                      status={request.status}
                    />
                  </td>

                  <td>
                    <div className="request-actions">
                      <button
                        className="icon-action-button"
                        title="View request"
                        onClick={() =>
                          setSelectedRequest(request)
                        }
                      >
                        <Eye size={16} />
                      </button>

                      {request.status !==
                        "Completed" &&
                        request.status !==
                          "Cancelled" && (
                          <button
                            className="assign-action-button"
                            onClick={() =>
                              openAssignModal(request)
                            }
                          >
                            <UserCog size={14} />

                            {request.technician
                              ? "Reassign"
                              : "Assign"}
                          </button>
                        )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredRequests.length === 0 && (
          <div className="requests-empty">
            <Search size={32} />

            <strong>
              No requests found
            </strong>

            <span>
              Try changing your search or filters.
            </span>
          </div>
        )}
      </section>

      {/* Request Details Modal */}

      {selectedRequest && (
        <div className="admin-modal-overlay">
          <div className="admin-modal request-details-modal">
            <div className="admin-modal-header">
              <div>
                <h2>Request Details</h2>

                <span>
                  {selectedRequest.id}
                </span>
              </div>

              <button
                className="modal-close"
                onClick={() =>
                  setSelectedRequest(null)
                }
              >
                <X size={19} />
              </button>
            </div>

            <div className="request-modal-service">
              <div className="request-modal-icon">
                <Wrench size={23} />
              </div>

              <div>
                <span>Service Type</span>
                <strong>
                  {selectedRequest.service}
                </strong>
              </div>

              <PriorityBadge
                priority={
                  selectedRequest.priority
                }
              />
            </div>

            <div className="request-detail-grid">
              <DetailItem
                title="Customer"
                value={selectedRequest.customer}
                icon={<UserRound size={17} />}
              />

              <DetailItem
                title="Phone"
                value={
                  selectedRequest.customerPhone
                }
                icon={<UserRound size={17} />}
              />

              <DetailItem
                title="Date"
                value={selectedRequest.date}
                icon={<Clock3 size={17} />}
              />

              <DetailItem
                title="Time"
                value={selectedRequest.time}
                icon={<Clock3 size={17} />}
              />

              <DetailItem
                title="Location"
                value={selectedRequest.location}
                icon={<MapPin size={17} />}
              />

              <DetailItem
                title="Technician"
                value={
                  selectedRequest.technician ??
                  "Not Assigned"
                }
                icon={<UserCog size={17} />}
              />
            </div>

            <div className="request-description">
              <span>Customer Description</span>

              <p>
                {selectedRequest.description}
              </p>
            </div>

            <div className="modal-status-line">
              <span>Current Status</span>

              <StatusBadge
                status={selectedRequest.status}
              />
            </div>

            {selectedRequest.status !==
              "Completed" &&
              selectedRequest.status !==
                "Cancelled" && (
                <button
                  className="modal-primary-button"
                  onClick={() => {
                    setSelectedRequest(null);
                    openAssignModal(
                      selectedRequest
                    );
                  }}
                >
                  <UserCog size={17} />

                  {selectedRequest.technician
                    ? "Reassign Technician"
                    : "Assign Technician"}
                </button>
              )}
          </div>
        </div>
      )}

      {/* Assign Technician Modal */}

      {assignRequest && (
        <div className="admin-modal-overlay">
          <div className="admin-modal assign-modal">
            <div className="admin-modal-header">
              <div>
                <h2>
                  {assignRequest.technician
                    ? "Reassign Technician"
                    : "Assign Technician"}
                </h2>

                <span>
                  {assignRequest.id} •{" "}
                  {assignRequest.service}
                </span>
              </div>

              <button
                className="modal-close"
                onClick={closeAssignModal}
              >
                <X size={19} />
              </button>
            </div>

            {assignRequest.priority ===
              "Emergency" && (
              <div className="emergency-warning">
                <AlertTriangle size={18} />

                <div>
                  <strong>
                    Emergency Request
                  </strong>

                  <span>
                    Prioritize an available
                    technician for this job.
                  </span>
                </div>
              </div>
            )}

            <div className="assign-request-summary">
              <div>
                <span>Customer</span>
                <strong>
                  {assignRequest.customer}
                </strong>
              </div>

              <div>
                <span>Location</span>
                <strong>
                  {assignRequest.location}
                </strong>
              </div>

              <div>
                <span>Schedule</span>
                <strong>
                  {assignRequest.time}
                </strong>
              </div>
            </div>

            <div className="technician-selection-title">
              <h3>Available Technicians</h3>

              <span>
                Select the most suitable
                technician
              </span>
            </div>

            <div className="technician-selection-list">
              {technicians.map(
                (technician) => (
                  <button
                    key={technician.id}
                    disabled={
                      technician.status ===
                      "Offline"
                    }
                    className={`technician-option ${
                      selectedTechnician ===
                      technician.name
                        ? "selected"
                        : ""
                    } ${
                      technician.status ===
                      "Offline"
                        ? "disabled"
                        : ""
                    }`}
                    onClick={() =>
                      setSelectedTechnician(
                        technician.name
                      )
                    }
                  >
                    <div className="technician-option-avatar">
                      <UserCog size={18} />
                    </div>

                    <div className="technician-option-info">
                      <strong>
                        {technician.name}
                      </strong>

                      <span>
                        {technician.specialty}
                      </span>
                    </div>

                    <div className="technician-option-meta">
                      <span>
                        ⭐ {technician.rating}
                      </span>

                      <small
                        className={`tech-status tech-status-${technician.status.toLowerCase()}`}
                      >
                        {technician.status}
                      </small>
                    </div>

                    <ChevronRight size={17} />
                  </button>
                )
              )}
            </div>

            <div className="assign-modal-actions">
              <button
                className="modal-secondary-button"
                onClick={closeAssignModal}
              >
                Cancel
              </button>

              <button
                className="modal-primary-button"
                disabled={!selectedTechnician}
                onClick={handleAssign}
              >
                <CheckCircle2 size={17} />

                Confirm Assignment
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function RequestStat({
  label,
  value,
  icon,
  className,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  className: string;
}) {
  return (
    <div
      className={`request-stat-card ${className}`}
    >
      <div className="request-stat-icon">
        {icon}
      </div>

      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </div>
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

function StatusBadge({
  status,
}: {
  status: RequestStatus;
}) {
  const className = status
    .toLowerCase()
    .replace(/\s+/g, "-");

  return (
    <span
      className={`badge status-${className}`}
    >
      {status}
    </span>
  );
}

function DetailItem({
  icon,
  title,
  value,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
}) {
  return (
    <div className="request-detail-item">
      <div className="request-detail-icon">
        {icon}
      </div>

      <div>
        <span>{title}</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}