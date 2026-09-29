import { FileClock, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { DataState } from "../components/DataState";
import { useCollectionData } from "../hooks/useCollectionData";
import type { AuditLogRecord } from "../types";
import { displayText, formatDateTime, statusLabel } from "../utils/format";

export default function AuditLogs() {
  const auditLogs = useCollectionData<AuditLogRecord>("audit_logs");
  const [search, setSearch] = useState("");

  const filteredLogs = useMemo(
    () =>
      auditLogs.data.filter((log) =>
        [
          log.action,
          log.actorUid,
          log.actorRole,
          log.targetUid,
          log.targetType,
          JSON.stringify(log.metadata ?? {}),
        ]
          .join(" ")
          .toLowerCase()
          .includes(search.toLowerCase())
      ),
    [auditLogs.data, search]
  );

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Audit Logs</h1>
          <p>Review privileged administrative actions.</p>
        </div>
      </div>

      <div className="table-toolbar">
        <div className="table-search">
          <Search size={17} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search audit logs..."
          />
        </div>
      </div>

      <section className="dashboard-card">
        <DataState
          loading={auditLogs.loading}
          error={auditLogs.error}
          empty={filteredLogs.length === 0}
        >
          <div className="table-wrapper">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Action</th>
                  <th>Actor</th>
                  <th>Target</th>
                  <th>Metadata</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((log) => (
                  <tr key={log.id}>
                    <td>
                      <strong>{statusLabel(log.action)}</strong>
                    </td>
                    <td>
                      <span>{displayText(log.actorRole)}</span>
                      <strong>{displayText(log.actorUid)}</strong>
                    </td>
                    <td>
                      <span>{displayText(log.targetType)}</span>
                      <strong>{displayText(log.targetUid)}</strong>
                    </td>
                    <td>
                      <code>{JSON.stringify(log.metadata ?? {})}</code>
                    </td>
                    <td>{formatDateTime(log.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DataState>
      </section>

      <div className="dashboard-card note-card">
        <FileClock size={19} />
        <span>Audit logs are append-only for clients. Dispatcher provisioning and technician review metadata are stored on their source records.</span>
      </div>
    </>
  );
}
