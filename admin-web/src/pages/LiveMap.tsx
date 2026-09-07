import {
  Clock3,
  LocateFixed,
  MapPin,
  Navigation,
  Phone,
  Search,
  UserCog,
  Wrench,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";

type TechnicianStatus =
  | "Available"
  | "Busy"
  | "Offline";

type Technician = {
  id: string;
  name: string;
  specialty: string;
  phone: string;
  status: TechnicianStatus;
  location: string;
  currentJob: string | null;
  service: string | null;
  lastUpdated: string;
  x: number;
  y: number;
};

const technicians: Technician[] = [
  {
    id: "TECH-001",
    name: "Alex Smith",
    specialty: "AC & Refrigeration",
    phone: "+94 71 234 5678",
    status: "Busy",
    location: "Colombo 07",
    currentJob: "REQ-2026-0012",
    service: "AC Repair",
    lastUpdated: "Just now",
    x: 43,
    y: 37,
  },
  {
    id: "TECH-002",
    name: "Kasun Perera",
    specialty: "Appliance Repair",
    phone: "+94 76 456 2211",
    status: "Available",
    location: "Nugegoda",
    currentJob: null,
    service: null,
    lastUpdated: "1 min ago",
    x: 58,
    y: 62,
  },
  {
    id: "TECH-003",
    name: "Ruwan Silva",
    specialty: "Electrical",
    phone: "+94 77 556 3322",
    status: "Available",
    location: "Rajagiriya",
    currentJob: null,
    service: null,
    lastUpdated: "2 mins ago",
    x: 64,
    y: 43,
  },
  {
    id: "TECH-004",
    name: "Nuwan Fernando",
    specialty: "Plumbing",
    phone: "+94 75 667 1100",
    status: "Busy",
    location: "Dehiwala",
    currentJob: "REQ-2026-0009",
    service: "Emergency Plumbing",
    lastUpdated: "Just now",
    x: 36,
    y: 72,
  },
  {
    id: "TECH-005",
    name: "Sajith Perera",
    specialty: "General Services",
    phone: "+94 72 998 4400",
    status: "Offline",
    location: "Kotte",
    currentJob: null,
    service: null,
    lastUpdated: "35 mins ago",
    x: 72,
    y: 58,
  },
];

export default function LiveMap() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] =
    useState("All");

  const [
    selectedTechnician,
    setSelectedTechnician,
  ] = useState<Technician | null>(
    technicians[0]
  );

  const filteredTechnicians = useMemo(() => {
    return technicians.filter(
      (technician) => {
        const value =
          search.toLowerCase();

        const matchesSearch =
          technician.name
            .toLowerCase()
            .includes(value) ||
          technician.id
            .toLowerCase()
            .includes(value) ||
          technician.location
            .toLowerCase()
            .includes(value) ||
          technician.specialty
            .toLowerCase()
            .includes(value);

        const matchesStatus =
          statusFilter === "All" ||
          technician.status ===
            statusFilter;

        return (
          matchesSearch &&
          matchesStatus
        );
      }
    );
  }, [search, statusFilter]);

  const availableCount =
    technicians.filter(
      (technician) =>
        technician.status ===
        "Available"
    ).length;

  const busyCount =
    technicians.filter(
      (technician) =>
        technician.status === "Busy"
    ).length;

  const offlineCount =
    technicians.filter(
      (technician) =>
        technician.status ===
        "Offline"
    ).length;

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>
            Live Technician Map
          </h1>

          <p>
            Monitor technician locations,
            availability and active jobs.
          </p>
        </div>

        <div className="live-status-badge">
          <span />
          Live Tracking
        </div>
      </div>

      <div className="live-map-stats">
        <MapStat
          value={technicians.length}
          label="Total Technicians"
          tone="blue"
        />

        <MapStat
          value={availableCount}
          label="Available"
          tone="green"
        />

        <MapStat
          value={busyCount}
          label="On Job"
          tone="orange"
        />

        <MapStat
          value={offlineCount}
          label="Offline"
          tone="gray"
        />
      </div>

      <div className="live-map-toolbar">
        <div className="live-map-search">
          <Search size={17} />

          <input
            value={search}
            onChange={(event) =>
              setSearch(
                event.target.value
              )
            }
            placeholder="Search technician, location or specialty..."
          />
        </div>

        <select
          className="live-map-filter"
          value={statusFilter}
          onChange={(event) =>
            setStatusFilter(
              event.target.value
            )
          }
        >
          <option>All</option>
          <option>Available</option>
          <option>Busy</option>
          <option>Offline</option>
        </select>

        <button
          className="center-map-button"
          onClick={() =>
            setSelectedTechnician(
              technicians[0]
            )
          }
        >
          <LocateFixed size={16} />
          Center Map
        </button>
      </div>

      <div className="live-map-layout">
        {/* Technician List */}

        <section className="live-technician-panel">
          <div className="live-panel-heading">
            <div>
              <h2>Technicians</h2>

              <span>
                {
                  filteredTechnicians.length
                }{" "}
                technicians shown
              </span>
            </div>
          </div>

          <div className="live-technician-list">
            {filteredTechnicians.map(
              (technician) => (
                <button
                  key={technician.id}
                  className={`live-technician-item ${
                    selectedTechnician?.id ===
                    technician.id
                      ? "selected"
                      : ""
                  }`}
                  onClick={() =>
                    setSelectedTechnician(
                      technician
                    )
                  }
                >
                  <div
                    className={`live-tech-avatar ${technician.status.toLowerCase()}`}
                  >
                    <UserCog
                      size={18}
                    />

                    <span />
                  </div>

                  <div className="live-tech-main">
                    <strong>
                      {technician.name}
                    </strong>

                    <span>
                      {
                        technician.specialty
                      }
                    </span>

                    <small>
                      <MapPin
                        size={11}
                      />
                      {
                        technician.location
                      }
                    </small>
                  </div>

                  <TechnicianStatus
                    status={
                      technician.status
                    }
                  />
                </button>
              )
            )}
          </div>
        </section>

        {/* Map */}

        <section className="technician-map">
          <div className="map-grid-background" />

          <div className="map-road road-one" />
          <div className="map-road road-two" />
          <div className="map-road road-three" />
          <div className="map-road road-four" />

          <div className="map-area-label label-colombo">
            Colombo
          </div>

          <div className="map-area-label label-nugegoda">
            Nugegoda
          </div>

          <div className="map-area-label label-dehiwala">
            Dehiwala
          </div>

          <div className="map-area-label label-kotte">
            Kotte
          </div>

          {filteredTechnicians.map(
            (technician) => (
              <button
                key={technician.id}
                className={`technician-map-marker ${
                  technician.status.toLowerCase()
                } ${
                  selectedTechnician?.id ===
                  technician.id
                    ? "selected"
                    : ""
                }`}
                style={{
                  left: `${technician.x}%`,
                  top: `${technician.y}%`,
                }}
                onClick={() =>
                  setSelectedTechnician(
                    technician
                  )
                }
              >
                <UserCog size={17} />

                <span className="marker-tooltip">
                  {technician.name}
                </span>
              </button>
            )
          )}

          <div className="map-live-indicator">
            <span />
            Location updates active
          </div>

          <div className="map-zoom-controls">
            <button>+</button>
            <button>−</button>
          </div>
        </section>

        {/* Selected Details */}

        <section className="live-detail-panel">
          {selectedTechnician ? (
            <>
              <div className="live-detail-heading">
                <span>
                  Technician Details
                </span>

                <button
                  onClick={() =>
                    setSelectedTechnician(
                      null
                    )
                  }
                >
                  <X size={16} />
                </button>
              </div>

              <div className="live-detail-profile">
                <div className="live-detail-avatar">
                  <UserCog
                    size={24}
                  />
                </div>

                <div>
                  <strong>
                    {
                      selectedTechnician.name
                    }
                  </strong>

                  <span>
                    {
                      selectedTechnician.id
                    }
                  </span>
                </div>
              </div>

              <TechnicianStatus
                status={
                  selectedTechnician.status
                }
              />

              <div className="live-detail-divider" />

              <DetailLine
                icon={
                  <Wrench
                    size={15}
                  />
                }
                title="Specialty"
                value={
                  selectedTechnician.specialty
                }
              />

              <DetailLine
                icon={
                  <MapPin
                    size={15}
                  />
                }
                title="Current Location"
                value={
                  selectedTechnician.location
                }
              />

              <DetailLine
                icon={
                  <Phone
                    size={15}
                  />
                }
                title="Contact"
                value={
                  selectedTechnician.phone
                }
              />

              <DetailLine
                icon={
                  <Clock3
                    size={15}
                  />
                }
                title="Last Updated"
                value={
                  selectedTechnician.lastUpdated
                }
              />

              <div className="live-detail-divider" />

              {selectedTechnician.currentJob ? (
                <div className="live-current-job">
                  <div className="live-current-job-header">
                    <span>
                      Active Job
                    </span>

                    <strong>
                      {
                        selectedTechnician.currentJob
                      }
                    </strong>
                  </div>

                  <div>
                    <Wrench
                      size={15}
                    />

                    <span>
                      {
                        selectedTechnician.service
                      }
                    </span>
                  </div>

                  <div>
                    <MapPin
                      size={15}
                    />

                    <span>
                      {
                        selectedTechnician.location
                      }
                    </span>
                  </div>
                </div>
              ) : (
                <div className="live-no-job">
                  <CheckIcon />
                  <strong>
                    No active job
                  </strong>
                  <span>
                    Technician is currently
                    available for assignment.
                  </span>
                </div>
              )}

              <button className="track-technician-button">
                <Navigation
                  size={16}
                />

                Focus Technician
              </button>
            </>
          ) : (
            <div className="live-detail-empty">
              <MapPin size={34} />

              <strong>
                Select a technician
              </strong>

              <span>
                Select a marker or technician
                to view live information.
              </span>
            </div>
          )}
        </section>
      </div>
    </>
  );
}

function MapStat({
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
      className={`live-map-stat ${tone}`}
    >
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function TechnicianStatus({
  status,
}: {
  status: TechnicianStatus;
}) {
  return (
    <span
      className={`live-tech-status live-tech-status-${status.toLowerCase()}`}
    >
      <span />
      {status}
    </span>
  );
}

function DetailLine({
  icon,
  title,
  value,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
}) {
  return (
    <div className="live-detail-line">
      <div className="live-detail-line-icon">
        {icon}
      </div>

      <div>
        <span>{title}</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function CheckIcon() {
  return (
    <div className="live-check-icon">
      ✓
    </div>
  );
}