import {
  Ban,
  CheckCircle2,
  Eye,
  MapPin,
  Search,
  Star,
  UserCog,
  Wrench,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";

type Availability =
  | "Available"
  | "Busy"
  | "Offline";

type AccountStatus =
  | "Active"
  | "Deactivated";

type Technician = {
  id: string;
  name: string;
  phone: string;
  email: string;
  location: string;
  specialty: string;
  rating: number;
  completedJobs: number;
  availability: Availability;
  accountStatus: AccountStatus;
  currentJob: string | null;
  experience: string;
};

const initialTechnicians: Technician[] = [
  {
    id: "TECH-001",
    name: "Alex Smith",
    phone: "+94 71 234 5678",
    email: "alex@servicepilot.lk",
    location: "Colombo 07",
    specialty: "AC & Refrigeration",
    rating: 4.8,
    completedJobs: 124,
    availability: "Busy",
    accountStatus: "Active",
    currentJob: "REQ-2026-0012",
    experience: "4 Years",
  },
  {
    id: "TECH-002",
    name: "Kasun Perera",
    phone: "+94 76 456 2211",
    email: "kasun@servicepilot.lk",
    location: "Nugegoda",
    specialty: "Appliance Repair",
    rating: 4.7,
    completedJobs: 98,
    availability: "Available",
    accountStatus: "Active",
    currentJob: null,
    experience: "3 Years",
  },
  {
    id: "TECH-003",
    name: "Ruwan Silva",
    phone: "+94 77 556 3322",
    email: "ruwan@servicepilot.lk",
    location: "Rajagiriya",
    specialty: "Electrical",
    rating: 4.9,
    completedJobs: 156,
    availability: "Available",
    accountStatus: "Active",
    currentJob: null,
    experience: "6 Years",
  },
  {
    id: "TECH-004",
    name: "Nuwan Fernando",
    phone: "+94 75 667 1100",
    email: "nuwan@servicepilot.lk",
    location: "Dehiwala",
    specialty: "Plumbing",
    rating: 4.8,
    completedJobs: 87,
    availability: "Available",
    accountStatus: "Active",
    currentJob: null,
    experience: "4 Years",
  },
  {
    id: "TECH-005",
    name: "Sajith Perera",
    phone: "+94 72 998 4400",
    email: "sajith@servicepilot.lk",
    location: "Kotte",
    specialty: "General Services",
    rating: 4.5,
    completedJobs: 64,
    availability: "Offline",
    accountStatus: "Active",
    currentJob: null,
    experience: "2 Years",
  },
  {
    id: "TECH-006",
    name: "Dilan Jayasinghe",
    phone: "+94 71 889 2211",
    email: "dilan@servicepilot.lk",
    location: "Maharagama",
    specialty: "Electrical",
    rating: 4.6,
    completedJobs: 71,
    availability: "Offline",
    accountStatus: "Deactivated",
    currentJob: null,
    experience: "3 Years",
  },
];

export default function Technicians() {
  const [technicians, setTechnicians] =
    useState<Technician[]>(
      initialTechnicians
    );

  const [search, setSearch] =
    useState("");

  const [
    availabilityFilter,
    setAvailabilityFilter,
  ] = useState("All");

  const [selectedTechnician, setSelectedTechnician] =
    useState<Technician | null>(null);

  const filteredTechnicians =
    useMemo(() => {
      return technicians.filter(
        (technician) => {
          const searchValue =
            search.toLowerCase();

          const matchesSearch =
            technician.name
              .toLowerCase()
              .includes(searchValue) ||
            technician.id
              .toLowerCase()
              .includes(searchValue) ||
            technician.specialty
              .toLowerCase()
              .includes(searchValue) ||
            technician.location
              .toLowerCase()
              .includes(searchValue);

          const matchesAvailability =
            availabilityFilter === "All" ||
            technician.availability ===
              availabilityFilter;

          return (
            matchesSearch &&
            matchesAvailability
          );
        }
      );
    }, [
      technicians,
      search,
      availabilityFilter,
    ]);

  const availableCount =
    technicians.filter(
      (technician) =>
        technician.availability ===
          "Available" &&
        technician.accountStatus ===
          "Active"
    ).length;

  const busyCount =
    technicians.filter(
      (technician) =>
        technician.availability === "Busy"
    ).length;

  const offlineCount =
    technicians.filter(
      (technician) =>
        technician.availability ===
        "Offline"
    ).length;

  const activeCount =
    technicians.filter(
      (technician) =>
        technician.accountStatus ===
        "Active"
    ).length;

  const toggleTechnicianStatus = (
    technicianId: string
  ) => {
    setTechnicians((current) =>
      current.map((technician) => {
        if (
          technician.id !== technicianId
        ) {
          return technician;
        }

        const newStatus =
          technician.accountStatus ===
          "Active"
            ? "Deactivated"
            : "Active";

        return {
          ...technician,
          accountStatus: newStatus,
          availability:
            newStatus === "Deactivated"
              ? "Offline"
              : technician.availability,
          currentJob:
            newStatus === "Deactivated"
              ? null
              : technician.currentJob,
        };
      })
    );

    if (
      selectedTechnician?.id ===
      technicianId
    ) {
      setSelectedTechnician(
        (current) => {
          if (!current) {
            return null;
          }

          const newStatus =
            current.accountStatus ===
            "Active"
              ? "Deactivated"
              : "Active";

          return {
            ...current,
            accountStatus: newStatus,
            availability:
              newStatus === "Deactivated"
                ? "Offline"
                : current.availability,
            currentJob:
              newStatus === "Deactivated"
                ? null
                : current.currentJob,
          };
        }
      );
    }
  };

  return (
    <>
      {/* Header */}

      <div className="page-heading">
        <div>
          <h1>Technicians</h1>

          <p>
            Manage field technicians,
            availability and account status.
          </p>
        </div>

        <div className="technician-total-badge">
          <UserCog size={17} />

          <span>
            {technicians.length} Technicians
          </span>
        </div>
      </div>

      {/* Stats */}

      <div className="technician-stats-grid">
        <TechnicianStat
          label="Active Accounts"
          value={activeCount}
          tone="blue"
        />

        <TechnicianStat
          label="Available"
          value={availableCount}
          tone="green"
        />

        <TechnicianStat
          label="Busy"
          value={busyCount}
          tone="orange"
        />

        <TechnicianStat
          label="Offline"
          value={offlineCount}
          tone="gray"
        />
      </div>

      {/* Toolbar */}

      <div className="technician-toolbar">
        <div className="technician-search">
          <Search size={17} />

          <input
            value={search}
            onChange={(event) =>
              setSearch(
                event.target.value
              )
            }
            placeholder="Search technician, skill, ID or location..."
          />
        </div>

        <select
          className="technician-filter"
          value={availabilityFilter}
          onChange={(event) =>
            setAvailabilityFilter(
              event.target.value
            )
          }
        >
          <option>All</option>
          <option>Available</option>
          <option>Busy</option>
          <option>Offline</option>
        </select>
      </div>

      {/* Table */}

      <section className="dashboard-card technician-table-card">
        <div className="technician-table-heading">
          <div>
            <h2>
              Technician Directory
            </h2>

            <p>
              {filteredTechnicians.length}{" "}
              matching technician
              {filteredTechnicians.length !==
              1
                ? "s"
                : ""}
            </p>
          </div>
        </div>

        <div className="table-wrapper">
          <table className="technician-table">
            <thead>
              <tr>
                <th>Technician</th>
                <th>Specialty</th>
                <th>Location</th>
                <th>Rating</th>
                <th>Jobs</th>
                <th>Availability</th>
                <th>Current Job</th>
                <th>Account</th>
                <th>Action</th>
              </tr>
            </thead>

            <tbody>
              {filteredTechnicians.map(
                (technician) => (
                  <tr
                    key={technician.id}
                  >
                    <td>
                      <div className="technician-person">
                        <div className="technician-avatar">
                          <UserCog
                            size={17}
                          />
                        </div>

                        <div>
                          <strong>
                            {
                              technician.name
                            }
                          </strong>

                          <span>
                            {
                              technician.id
                            }
                          </span>
                        </div>
                      </div>
                    </td>

                    <td>
                      <div className="skill-cell">
                        <Wrench
                          size={14}
                        />

                        {
                          technician.specialty
                        }
                      </div>
                    </td>

                    <td>
                      <div className="location-table-cell">
                        <MapPin
                          size={14}
                        />

                        {
                          technician.location
                        }
                      </div>
                    </td>

                    <td>
                      <div className="rating-cell">
                        <Star
                          size={14}
                          fill="#F59E0B"
                        />

                        <strong>
                          {
                            technician.rating
                          }
                        </strong>
                      </div>
                    </td>

                    <td>
                      <span className="jobs-count">
                        {
                          technician.completedJobs
                        }
                      </span>
                    </td>

                    <td>
                      <AvailabilityBadge
                        status={
                          technician.availability
                        }
                      />
                    </td>

                    <td>
                      {technician.currentJob ? (
                        <span className="current-job">
                          {
                            technician.currentJob
                          }
                        </span>
                      ) : (
                        <span className="no-current-job">
                          —
                        </span>
                      )}
                    </td>

                    <td>
                      <AccountBadge
                        status={
                          technician.accountStatus
                        }
                      />
                    </td>

                    <td>
                      <div className="technician-actions">
                        <button
                          className="icon-action-button"
                          title="View details"
                          onClick={() =>
                            setSelectedTechnician(
                              technician
                            )
                          }
                        >
                          <Eye
                            size={16}
                          />
                        </button>

                        <button
                          className={
                            technician.accountStatus ===
                            "Active"
                              ? "deactivate-tech-button"
                              : "activate-tech-button"
                          }
                          onClick={() =>
                            toggleTechnicianStatus(
                              technician.id
                            )
                          }
                        >
                          {technician.accountStatus ===
                          "Active" ? (
                            <>
                              <Ban
                                size={14}
                              />
                              Deactivate
                            </>
                          ) : (
                            <>
                              <CheckCircle2
                                size={14}
                              />
                              Activate
                            </>
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>

        {filteredTechnicians.length ===
          0 && (
          <div className="requests-empty">
            <UserCog size={34} />

            <strong>
              No technicians found
            </strong>

            <span>
              Try changing the search or
              availability filter.
            </span>
          </div>
        )}
      </section>

      {/* Details Modal */}

      {selectedTechnician && (
        <div className="admin-modal-overlay">
          <div className="admin-modal technician-detail-modal">
            <div className="admin-modal-header">
              <div>
                <h2>
                  Technician Profile
                </h2>

                <span>
                  {
                    selectedTechnician.id
                  }
                </span>
              </div>

              <button
                className="modal-close"
                onClick={() =>
                  setSelectedTechnician(
                    null
                  )
                }
              >
                <X size={19} />
              </button>
            </div>

            <div className="technician-profile-header">
              <div className="technician-profile-avatar">
                <UserCog size={28} />
              </div>

              <div className="technician-profile-name">
                <strong>
                  {
                    selectedTechnician.name
                  }
                </strong>

                <span>
                  {
                    selectedTechnician.specialty
                  }
                </span>
              </div>

              <AccountBadge
                status={
                  selectedTechnician.accountStatus
                }
              />
            </div>

            <div className="technician-profile-stats">
              <ProfileStat
                label="Rating"
                value={`${selectedTechnician.rating}`}
              />

              <ProfileStat
                label="Completed Jobs"
                value={`${selectedTechnician.completedJobs}`}
              />

              <ProfileStat
                label="Experience"
                value={
                  selectedTechnician.experience
                }
              />
            </div>

            <div className="technician-detail-grid">
              <DetailRow
                label="Email"
                value={
                  selectedTechnician.email
                }
              />

              <DetailRow
                label="Phone"
                value={
                  selectedTechnician.phone
                }
              />

              <DetailRow
                label="Location"
                value={
                  selectedTechnician.location
                }
              />

              <DetailRow
                label="Availability"
                value={
                  selectedTechnician.availability
                }
              />

              <DetailRow
                label="Current Job"
                value={
                  selectedTechnician.currentJob ??
                  "No Active Job"
                }
              />

              <DetailRow
                label="Assignable"
                value={
                  selectedTechnician.accountStatus ===
                    "Active" &&
                  selectedTechnician.availability ===
                    "Available"
                    ? "Yes"
                    : "No"
                }
              />
            </div>

            <div className="technician-modal-actions">
              <button
                className="modal-secondary-button"
                onClick={() =>
                  setSelectedTechnician(
                    null
                  )
                }
              >
                Close
              </button>

              <button
                className={
                  selectedTechnician.accountStatus ===
                  "Active"
                    ? "technician-modal-deactivate"
                    : "technician-modal-activate"
                }
                onClick={() =>
                  toggleTechnicianStatus(
                    selectedTechnician.id
                  )
                }
              >
                {selectedTechnician.accountStatus ===
                "Active" ? (
                  <>
                    <Ban size={16} />
                    Deactivate Account
                  </>
                ) : (
                  <>
                    <CheckCircle2
                      size={16}
                    />
                    Activate Account
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function TechnicianStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div
      className={`technician-stat-card ${tone}`}
    >
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function AvailabilityBadge({
  status,
}: {
  status: Availability;
}) {
  return (
    <span
      className={`availability-badge availability-${status.toLowerCase()}`}
    >
      <span className="availability-dot" />
      {status}
    </span>
  );
}

function AccountBadge({
  status,
}: {
  status: AccountStatus;
}) {
  return (
    <span
      className={`account-badge ${
        status === "Active"
          ? "account-active"
          : "account-deactivated"
      }`}
    >
      {status}
    </span>
  );
}

function ProfileStat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="technician-profile-stat">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="technician-detail-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
