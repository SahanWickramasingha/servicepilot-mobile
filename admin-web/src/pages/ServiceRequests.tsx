import { Eye, Search, Wrench, X } from "lucide-react";
import { useMemo, useState } from "react";

import { DataState, StatusChip } from "../components/DataState";
import { useCollectionData } from "../hooks/useCollectionData";
import type { ServiceRequestRecord } from "../types";
import { displayText, formatDateTime, statusLabel } from "../utils/format";

const requestStatuses = [
  "all",
  "requested",
  "accepted",
  "in_progress",
  "completed",
  "rejected",
  "cancelled",
];

export default function ServiceRequests() {
  const requests = useCollectionData<ServiceRequestRecord>("service_requests");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedRequest, setSelectedRequest] =
    useState<ServiceRequestRecord | null>(null);

  const filteredRequests = useMemo(
    () =>
      requests.data.filter((request) => {
        const haystack = [
          request.id,
          request.title,
          request.serviceCategory,
          request.customerName,
          request.technicianName,
          request.address,
          request.division,
        ]
          .join(" ")
          .toLowerCase();

        return (
          haystack.includes(search.toLowerCase()) &&
          (statusFilter === "all" || request.status === statusFilter)
        );
      }),
    [requests.data, search, statusFilter]
  );

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Service Requests</h1>
          <p>Monitor Customer to Technician requests without dispatcher assignment.</p>
        </div>
      </div>

      <div className="table-toolbar">
        <div className="table-search">
          <Search size={17} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search requests..."
          />
        </div>
        <select
          className="table-filter"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
        >
          {requestStatuses.map((status) => (
            <option value={status} key={status}>
              {status === "all" ? "All" : statusLabel(status)}
            </option>
          ))}
        </select>
      </div>

      <section className="dashboard-card">
        <DataState
          loading={requests.loading}
          error={requests.error}
          empty={filteredRequests.length === 0}
        >
          <div className="table-wrapper">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Request</th>
                  <th>Customer</th>
                  <th>Technician</th>
                  <th>Category</th>
                  <th>Schedule</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredRequests.map((request) => (
                  <tr key={request.id}>
                    <td>
                      <strong>{displayText(request.title, request.id)}</strong>
                      <span>{request.id}</span>
                    </td>
                    <td>
                      <strong>{displayText(request.customerName)}</strong>
                      <span>{displayText(request.customerPhone)}</span>
                    </td>
                    <td>{displayText(request.technicianName)}</td>
                    <td>{displayText(request.serviceCategory)}</td>
                    <td>
                      {request.scheduledAt
                        ? formatDateTime(request.scheduledAt)
                        : `${displayText(request.preferredDate)} ${displayText(request.preferredTime, "")}`}
                    </td>
                    <td>
                      <StatusChip
                        value={statusLabel(request.status)}
                        tone={request.status === "completed" ? "green" : "blue"}
                      />
                    </td>
                    <td>{formatDateTime(request.createdAt)}</td>
                    <td>
                      <button
                        className="secondary-action"
                        onClick={() => setSelectedRequest(request)}
                      >
                        <Eye size={15} />
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DataState>
      </section>

      {selectedRequest && (
        <div className="admin-modal-overlay">
          <div className="admin-modal">
            <div className="admin-modal-header">
              <div>
                <h2>Request Details</h2>
                <span>{selectedRequest.id}</span>
              </div>
              <button
                className="modal-close"
                onClick={() => setSelectedRequest(null)}
              >
                <X size={19} />
              </button>
            </div>

            <div className="modal-hero">
              <div className="modal-avatar">
                <Wrench size={26} />
              </div>
              <div>
                <strong>
                  {displayText(selectedRequest.title || selectedRequest.serviceCategory)}
                </strong>
                <span>{statusLabel(selectedRequest.status)}</span>
              </div>
            </div>

            <div className="detail-grid">
              <Detail label="Customer" value={selectedRequest.customerName} />
              <Detail label="Customer Email" value={selectedRequest.customerEmail} />
              <Detail label="Customer Phone" value={selectedRequest.customerPhone} />
              <Detail label="Technician" value={selectedRequest.technicianName} />
              <Detail label="Category" value={selectedRequest.serviceCategory} />
              <Detail label="Division" value={selectedRequest.division || selectedRequest.serviceArea} />
              <Detail label="Address" value={selectedRequest.address} />
              <Detail label="Preferred Date" value={selectedRequest.preferredDate} />
              <Detail label="Preferred Time" value={selectedRequest.preferredTime} />
              <Detail label="Scheduled At" value={formatDateTime(selectedRequest.scheduledAt)} />
              <Detail label="Accepted At" value={formatDateTime(selectedRequest.acceptedAt)} />
              <Detail label="Started At" value={formatDateTime(selectedRequest.startedAt)} />
              <Detail label="Completed At" value={formatDateTime(selectedRequest.completedAt)} />
              <Detail label="Cancelled At" value={formatDateTime(selectedRequest.cancelledAt)} />
              <Detail label="Rejected At" value={formatDateTime(selectedRequest.rejectedAt)} />
              <Detail label="Rejection Reason" value={selectedRequest.rejectionReason} />
              <Detail
                label="Technician Cancellation"
                value={selectedRequest.technicianCancellationReason}
              />
              <Detail
                label="Customer Cancellation"
                value={selectedRequest.customerCancellationReason}
              />
            </div>

            <div className="description-block">
              <span>Description</span>
              <p>{displayText(selectedRequest.description)}</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Detail({ label, value }: { label: string; value?: string }) {
  return (
    <div className="detail-item">
      <span>{label}</span>
      <strong>{displayText(value)}</strong>
    </div>
  );
}
