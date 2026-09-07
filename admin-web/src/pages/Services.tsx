import {
  CheckCircle2,
  Edit3,
  Plus,
  Search,
  Wrench,
  X,
  XCircle,
} from "lucide-react";
import { useMemo, useState } from "react";

type ServiceStatus = "Active" | "Disabled";

type Service = {
  id: string;
  name: string;
  category: string;
  description: string;
  basePrice: number;
  estimatedTime: string;
  requests: number;
  status: ServiceStatus;
};

const initialServices: Service[] = [
  {
    id: "SER-001",
    name: "AC Repair",
    category: "Air Conditioning",
    description:
      "Diagnosis, maintenance and repair of residential air conditioning systems.",
    basePrice: 3500,
    estimatedTime: "1 - 2 Hours",
    requests: 48,
    status: "Active",
  },
  {
    id: "SER-002",
    name: "Plumbing",
    category: "Plumbing",
    description:
      "Pipe leaks, blocked drains and general plumbing maintenance.",
    basePrice: 2500,
    estimatedTime: "1 - 3 Hours",
    requests: 39,
    status: "Active",
  },
  {
    id: "SER-003",
    name: "Electrical Installation",
    category: "Electrical",
    description:
      "Electrical wiring, outlets, switches and installation services.",
    basePrice: 4000,
    estimatedTime: "2 - 4 Hours",
    requests: 31,
    status: "Active",
  },
  {
    id: "SER-004",
    name: "Washing Machine Repair",
    category: "Appliances",
    description:
      "Troubleshooting and repair of washing machine faults.",
    basePrice: 3000,
    estimatedTime: "1 - 2 Hours",
    requests: 27,
    status: "Active",
  },
  {
    id: "SER-005",
    name: "Refrigerator Repair",
    category: "Appliances",
    description:
      "Cooling, compressor and refrigerator maintenance services.",
    basePrice: 3500,
    estimatedTime: "1 - 3 Hours",
    requests: 34,
    status: "Active",
  },
  {
    id: "SER-006",
    name: "TV Repair",
    category: "Electronics",
    description:
      "Display, sound and general television repair services.",
    basePrice: 2800,
    estimatedTime: "1 - 2 Hours",
    requests: 16,
    status: "Disabled",
  },
];

const emptyForm = {
  name: "",
  category: "",
  description: "",
  basePrice: "",
  estimatedTime: "",
};

export default function Services() {
  const [services, setServices] =
    useState<Service[]>(initialServices);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] =
    useState("All");

  const [showModal, setShowModal] =
    useState(false);

  const [editingService, setEditingService] =
    useState<Service | null>(null);

  const [form, setForm] =
    useState(emptyForm);

  const filteredServices = useMemo(() => {
    return services.filter((service) => {
      const value = search.toLowerCase();

      const matchesSearch =
        service.name
          .toLowerCase()
          .includes(value) ||
        service.category
          .toLowerCase()
          .includes(value) ||
        service.id
          .toLowerCase()
          .includes(value);

      const matchesStatus =
        statusFilter === "All" ||
        service.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [services, search, statusFilter]);

  const activeCount = services.filter(
    (service) =>
      service.status === "Active"
  ).length;

  const disabledCount = services.filter(
    (service) =>
      service.status === "Disabled"
  ).length;

  const totalRequests = services.reduce(
    (total, service) =>
      total + service.requests,
    0
  );

  const openAddModal = () => {
    setEditingService(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const openEditModal = (
    service: Service
  ) => {
    setEditingService(service);

    setForm({
      name: service.name,
      category: service.category,
      description: service.description,
      basePrice: String(service.basePrice),
      estimatedTime:
        service.estimatedTime,
    });

    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingService(null);
    setForm(emptyForm);
  };

  const saveService = () => {
    if (
      !form.name.trim() ||
      !form.category.trim() ||
      !form.basePrice.trim()
    ) {
      return;
    }

    if (editingService) {
      setServices((current) =>
        current.map((service) =>
          service.id ===
          editingService.id
            ? {
                ...service,
                name: form.name,
                category: form.category,
                description:
                  form.description,
                basePrice:
                  Number(
                    form.basePrice
                  ) || 0,
                estimatedTime:
                  form.estimatedTime,
              }
            : service
        )
      );
    } else {
      const newService: Service = {
        id: `SER-${String(
          services.length + 1
        ).padStart(3, "0")}`,
        name: form.name,
        category: form.category,
        description:
          form.description,
        basePrice:
          Number(form.basePrice) || 0,
        estimatedTime:
          form.estimatedTime,
        requests: 0,
        status: "Active",
      };

      setServices((current) => [
        newService,
        ...current,
      ]);
    }

    closeModal();
  };

  const toggleStatus = (
    serviceId: string
  ) => {
    setServices((current) =>
      current.map((service) =>
        service.id === serviceId
          ? {
              ...service,
              status:
                service.status ===
                "Active"
                  ? "Disabled"
                  : "Active",
            }
          : service
      )
    );
  };

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Service Management</h1>

          <p>
            Configure services available
            to ServicePilot customers.
          </p>
        </div>

        <button
          className="add-service-button"
          onClick={openAddModal}
        >
          <Plus size={17} />
          Add Service
        </button>
      </div>

      <div className="service-admin-stats">
        <ServiceStat
          value={services.length}
          label="Total Services"
          tone="blue"
        />

        <ServiceStat
          value={activeCount}
          label="Active Services"
          tone="green"
        />

        <ServiceStat
          value={disabledCount}
          label="Disabled"
          tone="red"
        />

        <ServiceStat
          value={totalRequests}
          label="Service Requests"
          tone="purple"
        />
      </div>

      <div className="service-admin-toolbar">
        <div className="service-admin-search">
          <Search size={17} />

          <input
            value={search}
            onChange={(event) =>
              setSearch(
                event.target.value
              )
            }
            placeholder="Search service, category or ID..."
          />
        </div>

        <select
          value={statusFilter}
          onChange={(event) =>
            setStatusFilter(
              event.target.value
            )
          }
          className="service-admin-filter"
        >
          <option>All</option>
          <option>Active</option>
          <option>Disabled</option>
        </select>
      </div>

      <div className="services-admin-grid">
        {filteredServices.map(
          (service) => (
            <div
              className="service-admin-card"
              key={service.id}
            >
              <div className="service-admin-card-top">
                <div className="service-admin-icon">
                  <Wrench size={21} />
                </div>

                <ServiceStatusBadge
                  status={
                    service.status
                  }
                />
              </div>

              <span className="service-admin-id">
                {service.id}
              </span>

              <h2>{service.name}</h2>

              <span className="service-admin-category">
                {service.category}
              </span>

              <p>
                {service.description}
              </p>

              <div className="service-card-details">
                <div>
                  <span>Base Price</span>
                  <strong>
                    Rs.{" "}
                    {service.basePrice.toLocaleString()}
                  </strong>
                </div>

                <div>
                  <span>Est. Time</span>
                  <strong>
                    {
                      service.estimatedTime
                    }
                  </strong>
                </div>

                <div>
                  <span>Requests</span>
                  <strong>
                    {service.requests}
                  </strong>
                </div>
              </div>

              <div className="service-card-actions">
                <button
                  className="edit-service-button"
                  onClick={() =>
                    openEditModal(
                      service
                    )
                  }
                >
                  <Edit3 size={14} />
                  Edit
                </button>

                <button
                  className={
                    service.status ===
                    "Active"
                      ? "disable-service-button"
                      : "enable-service-button"
                  }
                  onClick={() =>
                    toggleStatus(
                      service.id
                    )
                  }
                >
                  {service.status ===
                  "Active" ? (
                    <>
                      <XCircle
                        size={14}
                      />
                      Disable
                    </>
                  ) : (
                    <>
                      <CheckCircle2
                        size={14}
                      />
                      Enable
                    </>
                  )}
                </button>
              </div>
            </div>
          )
        )}
      </div>

      {filteredServices.length ===
        0 && (
        <div className="services-admin-empty">
          <Wrench size={35} />
          <strong>
            No services found
          </strong>
          <span>
            Try changing your search
            or filter.
          </span>
        </div>
      )}

      {showModal && (
        <div className="admin-modal-overlay">
          <div className="admin-modal service-form-modal">
            <div className="admin-modal-header">
              <div>
                <h2>
                  {editingService
                    ? "Edit Service"
                    : "Add New Service"}
                </h2>

                <span>
                  Configure ServicePilot
                  service details
                </span>
              </div>

              <button
                className="modal-close"
                onClick={closeModal}
              >
                <X size={19} />
              </button>
            </div>

            <div className="service-form-grid">
              <FormField
                label="Service Name"
                value={form.name}
                placeholder="Example: AC Repair"
                onChange={(value) =>
                  setForm({
                    ...form,
                    name: value,
                  })
                }
              />

              <FormField
                label="Category"
                value={form.category}
                placeholder="Example: Air Conditioning"
                onChange={(value) =>
                  setForm({
                    ...form,
                    category: value,
                  })
                }
              />

              <FormField
                label="Base Price (Rs.)"
                value={form.basePrice}
                placeholder="3500"
                type="number"
                onChange={(value) =>
                  setForm({
                    ...form,
                    basePrice: value,
                  })
                }
              />

              <FormField
                label="Estimated Time"
                value={
                  form.estimatedTime
                }
                placeholder="1 - 2 Hours"
                onChange={(value) =>
                  setForm({
                    ...form,
                    estimatedTime:
                      value,
                  })
                }
              />
            </div>

            <div className="service-form-field full">
              <label>
                Description
              </label>

              <textarea
                value={
                  form.description
                }
                onChange={(event) =>
                  setForm({
                    ...form,
                    description:
                      event.target.value,
                  })
                }
                placeholder="Describe the service..."
              />
            </div>

            <div className="service-form-actions">
              <button
                className="modal-secondary-button"
                onClick={closeModal}
              >
                Cancel
              </button>

              <button
                className="modal-primary-button"
                onClick={saveService}
              >
                <CheckCircle2
                  size={16}
                />

                {editingService
                  ? "Save Changes"
                  : "Create Service"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ServiceStat({
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
      className={`service-admin-stat ${tone}`}
    >
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function ServiceStatusBadge({
  status,
}: {
  status: ServiceStatus;
}) {
  return (
    <span
      className={`service-status-badge ${
        status === "Active"
          ? "service-active"
          : "service-disabled"
      }`}
    >
      {status}
    </span>
  );
}

function FormField({
  label,
  value,
  placeholder,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (
    value: string
  ) => void;
  type?: string;
}) {
  return (
    <div className="service-form-field">
      <label>{label}</label>

      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) =>
          onChange(
            event.target.value
          )
        }
      />
    </div>
  );
}