import { Search, UserRound, X } from "lucide-react";
import { useMemo, useState } from "react";

import { useAdminAuth } from "../auth/AdminAuthContext";
import {
  AccountLifecycleActions,
  AccountLifecycleDialog,
  statusChipLabel,
  statusChipTone,
} from "../components/AccountLifecycleActions";
import { DataState, StatusChip } from "../components/DataState";
import { useCollectionData } from "../hooks/useCollectionData";
import {
  updateManagedAccountLifecycle,
  type AccountLifecycleAction,
} from "../services/accountLifecycleService";
import type { ServiceRequestRecord, UserRecord } from "../types";
import { displayText, formatDateTime } from "../utils/format";

export default function Customers() {
  const { firebaseUser } = useAdminAuth();
  const users = useCollectionData<UserRecord>("users");
  const requests = useCollectionData<ServiceRequestRecord>("service_requests");
  const [search, setSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<UserRecord | null>(null);
  const [lifecycleDialog, setLifecycleDialog] = useState<{
    account: UserRecord;
    action: AccountLifecycleAction;
  } | null>(null);
  const [savingLifecycle, setSavingLifecycle] = useState(false);
  const [lifecycleError, setLifecycleError] = useState("");
  const [message, setMessage] = useState("");

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

      {message && <div className="form-success">{message}</div>}

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
                  <th>Account</th>
                  <th>Email</th>
                  <th>Created</th>
                  <th>Actions</th>
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
                        value={statusChipLabel(customer.accountStatus)}
                        tone={statusChipTone(customer.accountStatus)}
                      />
                    </td>
                    <td>
                      <StatusChip
                        value={customer.emailVerified ? "Verified" : "Unverified"}
                        tone={customer.emailVerified ? "green" : "yellow"}
                      />
                    </td>
                    <td>{formatDateTime(customer.createdAt)}</td>
                    <td>
                      <AccountLifecycleActions
                        account={customer}
                        busy={savingLifecycle}
                        onView={() => setSelectedCustomer(customer)}
                        onAction={(action) => {
                          setLifecycleError("");
                          setMessage("");
                          setLifecycleDialog({ account: customer, action });
                        }}
                      />
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
              <Detail
                label="Account Status"
                value={statusChipLabel(selectedCustomer.accountStatus)}
              />
              <Detail label="Created" value={formatDateTime(selectedCustomer.createdAt)} />
              <Detail label="Disabled At" value={formatDateTime(selectedCustomer.disabledAt)} />
              <Detail label="Deleted At" value={formatDateTime(selectedCustomer.deletedAt)} />
            </div>
          </div>
        </div>
      )}

      {lifecycleDialog && (
        <AccountLifecycleDialog
          action={lifecycleDialog.action}
          account={lifecycleDialog.account}
          busy={savingLifecycle}
          error={lifecycleError}
          onCancel={() => {
            if (!savingLifecycle) {
              setLifecycleDialog(null);
              setLifecycleError("");
            }
          }}
          onConfirm={async () => {
            if (!firebaseUser) {
              setLifecycleError("Please sign in as Super Admin first.");
              return;
            }

            try {
              setSavingLifecycle(true);
              setLifecycleError("");
              await updateManagedAccountLifecycle({
                actorUid: firebaseUser.uid,
                target: lifecycleDialog.account,
                action: lifecycleDialog.action,
              });
              setMessage(
                `Customer account ${lifecycleDialog.action === "enable" ? "enabled" : `${lifecycleDialog.action}d`}.`
              );
              setLifecycleDialog(null);
            } catch (error) {
              setLifecycleError(
                error instanceof Error
                  ? error.message
                  : "Unable to update this account."
              );
            } finally {
              setSavingLifecycle(false);
            }
          }}
        />
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
