import { Search } from "lucide-react";
import { useMemo, useState } from "react";

import { DataState, StatusChip } from "../../components/DataState";
import { useTechnicianUsers } from "../../hooks/useTechnicianUsers";
import { displayText, formatDateTime, statusLabel } from "../../utils/format";

export default function DispatcherTechnicians() {
  const technicianQuery = useTechnicianUsers({
    page: "dispatcher/technicians",
    queryType: "all-technicians",
  });
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const technicians = useMemo(
    () =>
      technicianQuery.data.filter((user) => {
        const status = user.technicianApprovalStatus ?? "pending";
        const matchesStatus = statusFilter === "all" || status === statusFilter;
        const matchesSearch = [
          user.fullName,
          user.email,
          user.specialization,
          user.serviceDivision,
          user.experience,
        ]
          .join(" ")
          .toLowerCase()
          .includes(search.toLowerCase());

        return matchesStatus && matchesSearch;
      }),
    [search, statusFilter, technicianQuery.data]
  );

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Technicians</h1>
          <p>Inspect technician approval status and reviewer metadata.</p>
        </div>
      </div>

      <div className="table-toolbar">
        <div className="table-search">
          <Search size={17} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search technicians..."
          />
        </div>
        <select
          className="table-filter"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
        >
          <option value="all">All</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      <section className="dashboard-card">
        <DataState
          loading={technicianQuery.loading}
          error={technicianQuery.error}
          empty={technicians.length === 0}
        >
          <div className="table-wrapper">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Technician</th>
                  <th>Specialization</th>
                  <th>Division</th>
                  <th>Experience</th>
                  <th>Status</th>
                  <th>Reviewed By</th>
                  <th>Reviewed At</th>
                </tr>
              </thead>
              <tbody>
                {technicians.map((technician) => {
                  const status = technician.technicianApprovalStatus ?? "pending";

                  return (
                    <tr key={technician.id}>
                      <td>
                        <strong>{displayText(technician.fullName)}</strong>
                        <span>{displayText(technician.email)}</span>
                      </td>
                      <td>{displayText(technician.specialization)}</td>
                      <td>
                        {displayText(
                          technician.serviceDivision || technician.serviceAreas
                        )}
                      </td>
                      <td>{displayText(technician.experience)}</td>
                      <td>
                        <StatusChip
                          value={statusLabel(status)}
                          tone={
                            status === "approved"
                              ? "green"
                              : status === "rejected"
                                ? "red"
                                : "yellow"
                          }
                        />
                      </td>
                      <td>{displayText(technician.reviewedBy ?? undefined)}</td>
                      <td>{formatDateTime(technician.reviewedAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </DataState>
      </section>
    </>
  );
}
