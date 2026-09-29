import { Eye, Search, UserRound, X } from "lucide-react";
import { useMemo, useState } from "react";

import { DataState, StatusChip } from "../components/DataState";
import { useCollectionData } from "../hooks/useCollectionData";
import type { ServiceRequestRecord, UserRecord } from "../types";
import { displayText, formatDateTime } from "../utils/format";

export default function Customers() {
  const users = useCollectionData<UserRecord>("users");
  const requests = useCollectionData<ServiceRequestRecord>("service_requests");
  const [search, setSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<UserRecord | null>(null);

  const customers = useMemo(
    () =>
      users.data.filter((user) => {
        if (user.role !== "customer") {
          return false;
        }

        return [user.fullName, user.email, user.phone, user.address]
          .join(" ")
          .toLowerCase()
          .includes(search.toLowerCase());
      }),
    [search, users.data]
  );

  const requestCountFor = (uid?: string) =>
    requests.data.filter((request) => request.customerId === uid).length;

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Customers</h1>
          <p>View customer profiles and request activity.</p>
        </div>
      </div>

      <div className="table-toolbar">
        <div className="table-search">
          <Search size={17} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search customers..."
          />
        </div>
      </div>

      <section className="dashboard-card">
        <DataState
          loading={users.loading || requests.loading}
          error={users.error || requests.error}
          empty={customers.length === 0}
        >
          <div className="table-wrapper">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Phone</th>
                  <th>Address</th>
                  <th>Requests</th>
                  <th>Email</th>
                  <th>Created</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((customer) => (
                  <tr key={customer.id}>
                    <td>
                      <strong>{displayText(customer.fullName)}</strong>
                      <span>{displayText(customer.email)}</span>
                    </td>
                    <td>{displayText(customer.phone)}</td>
                    <td>{displayText(customer.address)}</td>
                    <td>{requestCountFor(customer.uid ?? customer.id)}</td>
                    <td>
                      <StatusChip
                        value={customer.emailVerified ? "Verified" : "Unverified"}
                        tone={customer.emailVerified ? "green" : "yellow"}
                      />
                    </td>
                    <td>{formatDateTime(customer.createdAt)}</td>
                    <td>
                      <button
                        className="secondary-action"
                        onClick={() => setSelectedCustomer(customer)}
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

      {selectedCustomer && (
        <div className="admin-modal-overlay">
          <div className="admin-modal">
            <div className="admin-modal-header">
              <div>
                <h2>Customer Profile</h2>
                <span>{selectedCustomer.uid ?? selectedCustomer.id}</span>
              </div>
              <button
                className="modal-close"
                onClick={() => setSelectedCustomer(null)}
              >
                <X size={19} />
              </button>
            </div>

            <div className="modal-hero">
              <div className="modal-avatar">
                <UserRound size={26} />
              </div>
              <div>
                <strong>{displayText(selectedCustomer.fullName)}</strong>
                <span>{displayText(selectedCustomer.email)}</span>
              </div>
            </div>

            <div className="detail-grid">
              <Detail label="Phone" value={selectedCustomer.phone} />
              <Detail label="Address" value={selectedCustomer.address} />
              <Detail
                label="Request Count"
                value={`${requestCountFor(selectedCustomer.uid ?? selectedCustomer.id)}`}
              />
              <Detail
                label="Email Status"
                value={selectedCustomer.emailVerified ? "Verified" : "Unverified"}
              />
              <Detail label="Created" value={formatDateTime(selectedCustomer.createdAt)} />
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
