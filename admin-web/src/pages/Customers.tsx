import {
  Ban,
  CheckCircle2,
  Eye,
  Mail,
  MapPin,
  Phone,
  Search,
  UserRound,
  Users,
  Wrench,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";

type CustomerStatus = "Active" | "Blocked";

type Customer = {
  id: string;
  name: string;
  email: string;
  phone: string;
  location: string;
  totalRequests: number;
  completedServices: number;
  lastService: string;
  status: CustomerStatus;
};

const initialCustomers: Customer[] = [
  {
    id: "CUS-001",
    name: "Emma Johnson",
    email: "emma@gmail.com",
    phone: "+94 71 234 5678",
    location: "Colombo 07",
    totalRequests: 8,
    completedServices: 6,
    lastService: "07 Sep 2026",
    status: "Active",
  },
  {
    id: "CUS-002",
    name: "Sarah Wilson",
    email: "sarah@gmail.com",
    phone: "+94 76 456 2211",
    location: "Nugegoda",
    totalRequests: 5,
    completedServices: 4,
    lastService: "07 Sep 2026",
    status: "Active",
  },
  {
    id: "CUS-003",
    name: "David Perera",
    email: "david@gmail.com",
    phone: "+94 77 556 3322",
    location: "Colombo 03",
    totalRequests: 3,
    completedServices: 2,
    lastService: "02 Sep 2026",
    status: "Active",
  },
  {
    id: "CUS-004",
    name: "Nimal Fernando",
    email: "nimal@gmail.com",
    phone: "+94 75 667 1100",
    location: "Dehiwala",
    totalRequests: 11,
    completedServices: 9,
    lastService: "06 Sep 2026",
    status: "Active",
  },
  {
    id: "CUS-005",
    name: "Amanda Silva",
    email: "amanda@gmail.com",
    phone: "+94 72 998 4400",
    location: "Rajagiriya",
    totalRequests: 4,
    completedServices: 4,
    lastService: "06 Sep 2026",
    status: "Active",
  },
  {
    id: "CUS-006",
    name: "Ishara Perera",
    email: "ishara@gmail.com",
    phone: "+94 71 778 9900",
    location: "Kotte",
    totalRequests: 2,
    completedServices: 1,
    lastService: "01 Sep 2026",
    status: "Blocked",
  },
];

export default function Customers() {
  const [customers, setCustomers] =
    useState<Customer[]>(initialCustomers);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] =
    useState("All");

  const [selectedCustomer, setSelectedCustomer] =
    useState<Customer | null>(null);

  const filteredCustomers = useMemo(() => {
    return customers.filter((customer) => {
      const searchValue =
        search.toLowerCase();

      const matchesSearch =
        customer.name
          .toLowerCase()
          .includes(searchValue) ||
        customer.id
          .toLowerCase()
          .includes(searchValue) ||
        customer.email
          .toLowerCase()
          .includes(searchValue) ||
        customer.location
          .toLowerCase()
          .includes(searchValue);

      const matchesStatus =
        statusFilter === "All" ||
        customer.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [customers, search, statusFilter]);

  const activeCount = customers.filter(
    (customer) =>
      customer.status === "Active"
  ).length;

  const blockedCount = customers.filter(
    (customer) =>
      customer.status === "Blocked"
  ).length;

  const totalRequests = customers.reduce(
    (total, customer) =>
      total + customer.totalRequests,
    0
  );

  const completedServices =
    customers.reduce(
      (total, customer) =>
        total +
        customer.completedServices,
      0
    );

  const toggleCustomerStatus = (
    customerId: string
  ) => {
    setCustomers((current) =>
      current.map((customer) =>
        customer.id === customerId
          ? {
              ...customer,
              status:
                customer.status === "Active"
                  ? "Blocked"
                  : "Active",
            }
          : customer
      )
    );

    if (
      selectedCustomer?.id ===
      customerId
    ) {
      setSelectedCustomer((current) =>
        current
          ? {
              ...current,
              status:
                current.status === "Active"
                  ? "Blocked"
                  : "Active",
            }
          : null
      );
    }
  };

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Customers</h1>

          <p>
            Manage ServicePilot customer
            accounts and service history.
          </p>
        </div>

        <div className="customer-total-badge">
          <Users size={17} />
          <span>
            {customers.length} Customers
          </span>
        </div>
      </div>

      <div className="customer-stats-grid">
        <CustomerStat
          label="Active Customers"
          value={activeCount}
          tone="green"
        />

        <CustomerStat
          label="Blocked"
          value={blockedCount}
          tone="red"
        />

        <CustomerStat
          label="Total Requests"
          value={totalRequests}
          tone="blue"
        />

        <CustomerStat
          label="Completed Services"
          value={completedServices}
          tone="purple"
        />
      </div>

      <div className="customer-toolbar">
        <div className="customer-search">
          <Search size={17} />

          <input
            value={search}
            onChange={(event) =>
              setSearch(event.target.value)
            }
            placeholder="Search customer, email, ID or location..."
          />
        </div>

        <select
          className="customer-filter"
          value={statusFilter}
          onChange={(event) =>
            setStatusFilter(
              event.target.value
            )
          }
        >
          <option>All</option>
          <option>Active</option>
          <option>Blocked</option>
        </select>
      </div>

      <section className="dashboard-card customer-table-card">
        <div className="customer-table-heading">
          <div>
            <h2>Customer Directory</h2>

            <p>
              {filteredCustomers.length} matching
              customer
              {filteredCustomers.length !==
              1
                ? "s"
                : ""}
            </p>
          </div>
        </div>

        <div className="table-wrapper">
          <table className="customer-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Contact</th>
                <th>Location</th>
                <th>Total Requests</th>
                <th>Completed</th>
                <th>Last Service</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>

            <tbody>
              {filteredCustomers.map(
                (customer) => (
                  <tr key={customer.id}>
                    <td>
                      <div className="customer-person">
                        <div className="customer-avatar">
                          <UserRound
                            size={17}
                          />
                        </div>

                        <div>
                          <strong>
                            {customer.name}
                          </strong>

                          <span>
                            {customer.id}
                          </span>
                        </div>
                      </div>
                    </td>

                    <td>
                      <div className="customer-contact">
                        <span>
                          <Mail size={12} />
                          {customer.email}
                        </span>

                        <span>
                          <Phone size={12} />
                          {customer.phone}
                        </span>
                      </div>
                    </td>

                    <td>
                      <div className="location-table-cell">
                        <MapPin
                          size={14}
                        />
                        {customer.location}
                      </div>
                    </td>

                    <td>
                      <span className="customer-request-count">
                        {customer.totalRequests}
                      </span>
                    </td>

                    <td>
                      <span className="customer-completed-count">
                        {
                          customer.completedServices
                        }
                      </span>
                    </td>

                    <td>
                      {customer.lastService}
                    </td>

                    <td>
                      <CustomerStatusBadge
                        status={
                          customer.status
                        }
                      />
                    </td>

                    <td>
                      <div className="customer-actions">
                        <button
                          className="icon-action-button"
                          onClick={() =>
                            setSelectedCustomer(
                              customer
                            )
                          }
                        >
                          <Eye size={16} />
                        </button>

                        <button
                          className={
                            customer.status ===
                            "Active"
                              ? "block-customer-button"
                              : "activate-customer-button"
                          }
                          onClick={() =>
                            toggleCustomerStatus(
                              customer.id
                            )
                          }
                        >
                          {customer.status ===
                          "Active" ? (
                            <>
                              <Ban size={14} />
                              Block
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
      </section>

      {selectedCustomer && (
        <div className="admin-modal-overlay">
          <div className="admin-modal customer-detail-modal">
            <div className="admin-modal-header">
              <div>
                <h2>Customer Profile</h2>
                <span>
                  {selectedCustomer.id}
                </span>
              </div>

              <button
                className="modal-close"
                onClick={() =>
                  setSelectedCustomer(null)
                }
              >
                <X size={19} />
              </button>
            </div>

            <div className="customer-profile-header">
              <div className="customer-profile-avatar">
                <UserRound size={28} />
              </div>

              <div className="customer-profile-name">
                <strong>
                  {selectedCustomer.name}
                </strong>

                <span>
                  {
                    selectedCustomer.email
                  }
                </span>
              </div>

              <CustomerStatusBadge
                status={
                  selectedCustomer.status
                }
              />
            </div>

            <div className="customer-profile-stats">
              <ProfileStat
                label="Total Requests"
                value={`${selectedCustomer.totalRequests}`}
              />

              <ProfileStat
                label="Completed"
                value={`${selectedCustomer.completedServices}`}
              />

              <ProfileStat
                label="Completion Rate"
                value={`${Math.round(
                  (selectedCustomer.completedServices /
                    selectedCustomer.totalRequests) *
                    100
                )}%`}
              />
            </div>

            <div className="customer-detail-grid">
              <DetailRow
                label="Email"
                value={
                  selectedCustomer.email
                }
              />

              <DetailRow
                label="Phone"
                value={
                  selectedCustomer.phone
                }
              />

              <DetailRow
                label="Location"
                value={
                  selectedCustomer.location
                }
              />

              <DetailRow
                label="Last Service"
                value={
                  selectedCustomer.lastService
                }
              />
            </div>

            <div className="customer-service-summary">
              <div className="customer-service-icon">
                <Wrench size={19} />
              </div>

              <div>
                <strong>
                  Service Activity
                </strong>

                <span>
                  {
                    selectedCustomer.completedServices
                  }{" "}
                  of{" "}
                  {
                    selectedCustomer.totalRequests
                  }{" "}
                  requests completed
                </span>
              </div>
            </div>

            <div className="customer-modal-actions">
              <button
                className="modal-secondary-button"
                onClick={() =>
                  setSelectedCustomer(null)
                }
              >
                Close
              </button>

              <button
                className={
                  selectedCustomer.status ===
                  "Active"
                    ? "customer-modal-block"
                    : "customer-modal-activate"
                }
                onClick={() =>
                  toggleCustomerStatus(
                    selectedCustomer.id
                  )
                }
              >
                {selectedCustomer.status ===
                "Active" ? (
                  <>
                    <Ban size={16} />
                    Block Customer
                  </>
                ) : (
                  <>
                    <CheckCircle2
                      size={16}
                    />
                    Activate Customer
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

function CustomerStat({
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
      className={`customer-stat-card ${tone}`}
    >
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function CustomerStatusBadge({
  status,
}: {
  status: CustomerStatus;
}) {
  return (
    <span
      className={`customer-status ${
        status === "Active"
          ? "customer-active"
          : "customer-blocked"
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
    <div className="customer-profile-stat">
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
    <div className="customer-detail-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}