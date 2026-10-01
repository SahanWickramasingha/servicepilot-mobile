import { Megaphone, Search, Send } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  collection,
  onSnapshot,
  query,
  where,
  type Unsubscribe,
  type QuerySnapshot,
  type DocumentData,
} from "firebase/firestore";
import { FirebaseError } from "firebase/app";

import { useAdminAuth } from "../auth/AdminAuthContext";
import { DataState, StatusChip } from "../components/DataState";
import { db } from "../firebase/config";
import {
  audienceLabel,
  audienceRolesForOption,
  sendSystemMessage,
  type MessageAudienceOption,
} from "../services/systemMessageService";
import type { MessagePriority, SystemMessageRecord } from "../types";
import {
  displayText,
  formatDateTime,
  statusLabel,
  timestampMillis,
} from "../utils/format";

const priorityOptions: MessagePriority[] = ["normal", "important", "critical"];
const publishedMessageStatuses = ["active", "sent"] as const;

export default function SystemMessages({
  portal,
}: {
  portal: "admin" | "dispatcher";
}) {
  const { profile } = useAdminAuth();
  const messages = useSystemMessages(portal, profile?.uid ?? profile?.id);
  const [search, setSearch] = useState("");
  const [senderFilter, setSenderFilter] = useState("all");
  const [audienceFilter, setAudienceFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [audience, setAudience] = useState<MessageAudienceOption>(
    portal === "admin" ? "all" : "technician"
  );
  const [priority, setPriority] = useState<MessagePriority>("normal");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [success, setSuccess] = useState("");

  const audienceOptions =
    portal === "admin"
      ? (["all", "customer", "technician", "dispatcher"] as MessageAudienceOption[])
      : (["technician", "super_admin"] as MessageAudienceOption[]);

  const filteredMessages = useMemo(
    () =>
      messages.data.filter((item) => {
        const haystack = [
          item.senderName,
          item.senderRole,
          audienceLabel(item.audienceRoles),
          item.title,
          item.message,
          item.priority,
          item.status,
        ]
          .join(" ")
          .toLowerCase();

        const senderMatch =
          senderFilter === "all" || item.senderRole === senderFilter;
        const priorityMatch =
          priorityFilter === "all" ||
          (item.priority ?? "normal") === priorityFilter;
        const audienceMatch =
          audienceFilter === "all" ||
          item.audienceRoles?.includes(audienceFilter as never);

        return (
          haystack.includes(search.toLowerCase()) &&
          senderMatch &&
          priorityMatch &&
          audienceMatch
        );
      }),
    [audienceFilter, messages.data, priorityFilter, search, senderFilter]
  );

  const submitMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!profile) {
      setFormError("Please sign in again.");
      return;
    }

    try {
      setSaving(true);
      setFormError("");
      setSuccess("");
      await sendSystemMessage({
        sender: profile,
        audienceRoles: audienceRolesForOption(audience),
        title,
        message,
        priority,
      });
      setTitle("");
      setMessage("");
      setPriority("normal");
      setAudience(portal === "admin" ? "all" : "technician");
      setSuccess("System message sent.");
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Unable to send message."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>{portal === "admin" ? "System Messages" : "Messages"}</h1>
          <p>
            {portal === "admin"
              ? "Broadcast announcements and review global message history."
              : "Send operational messages to technicians or Super Admin."}
          </p>
        </div>
      </div>

      <form className="dashboard-card message-compose" onSubmit={submitMessage}>
        <div className="card-heading">
          <div>
            <h2>New System Message</h2>
            <p>Messages are stored once and shown to matching role audiences.</p>
          </div>
          <Megaphone size={20} />
        </div>

        <div className="admin-form-grid">
          <label className="admin-field">
            <span>Audience</span>
            <div>
              <select
                value={audience}
                onChange={(event) =>
                  setAudience(event.target.value as MessageAudienceOption)
                }
                disabled={saving}
              >
                {audienceOptions.map((option) => (
                  <option key={option} value={option}>
                    {statusLabel(option)}
                  </option>
                ))}
              </select>
            </div>
          </label>

          <label className="admin-field">
            <span>Priority</span>
            <div>
              <select
                value={priority}
                onChange={(event) =>
                  setPriority(event.target.value as MessagePriority)
                }
                disabled={saving}
              >
                {priorityOptions.map((option) => (
                  <option key={option} value={option}>
                    {statusLabel(option)}
                  </option>
                ))}
              </select>
            </div>
          </label>
        </div>

        <label className="admin-field modal-field">
          <span>Title</span>
          <div>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              disabled={saving}
              required
            />
          </div>
        </label>

        <label className="admin-field modal-field">
          <span>Message</span>
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            disabled={saving}
            required
          />
        </label>

        {formError && <div className="form-error">{formError}</div>}
        {success && <div className="form-success">{success}</div>}

        <div className="modal-actions">
          <button className="primary-action" disabled={saving}>
            <Send size={16} />
            {saving ? "Sending..." : "Send Message"}
          </button>
        </div>
      </form>

      <section className="dashboard-card">
        <div className="table-toolbar">
          <div className="table-search">
            <Search size={17} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search message history..."
            />
          </div>
          <select
            className="table-filter"
            value={senderFilter}
            onChange={(event) => setSenderFilter(event.target.value)}
          >
            <option value="all">All Senders</option>
            <option value="super_admin">Super Admin</option>
            <option value="dispatcher">Dispatcher</option>
          </select>
          <select
            className="table-filter"
            value={audienceFilter}
            onChange={(event) => setAudienceFilter(event.target.value)}
          >
            <option value="all">All Audiences</option>
            <option value="customer">Customers</option>
            <option value="technician">Technicians</option>
            <option value="dispatcher">Dispatchers</option>
            <option value="super_admin">Super Admin</option>
          </select>
          <select
            className="table-filter"
            value={priorityFilter}
            onChange={(event) => setPriorityFilter(event.target.value)}
          >
            <option value="all">All Priorities</option>
            <option value="normal">Normal</option>
            <option value="important">Important</option>
            <option value="critical">Critical</option>
          </select>
        </div>

        <DataState
          loading={messages.loading}
          error={messages.error}
          empty={filteredMessages.length === 0}
        >
          <div className="table-wrapper">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Sender</th>
                  <th>Audience</th>
                  <th>Title</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {filteredMessages.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{displayText(item.senderName, "Unknown Sender")}</strong>
                      <span>{statusLabel(item.senderRole)}</span>
                    </td>
                    <td>{audienceLabel(item.audienceRoles)}</td>
                    <td>
                      <strong>{displayText(item.title)}</strong>
                      <span>{displayText(item.message)}</span>
                    </td>
                    <td>
                      <StatusChip
                        value={statusLabel(item.priority ?? "normal")}
                        tone={priorityTone(item.priority)}
                      />
                    </td>
                    <td>{displayText(item.status, "sent")}</td>
                    <td>{formatDateTime(item.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DataState>
      </section>
    </>
  );
}

function useSystemMessages(portal: "admin" | "dispatcher", uid?: string) {
  const [state, setState] = useState<{
    data: SystemMessageRecord[];
    loading: boolean;
    error: string;
  }>({
    data: [],
    loading: true,
    error: "",
  });

  useEffect(() => {
    if (portal === "dispatcher" && !uid) {
      setState({ data: [], loading: false, error: "Dispatcher profile not found." });
      return;
    }

    const byId = new Map<string, SystemMessageRecord>();
    const dispatcherQueryBuckets = new Map<
      string,
      Map<string, SystemMessageRecord>
    >();
    let pendingSnapshots =
      portal === "admin" ? 1 : publishedMessageStatuses.length * 2;
    const emit = () => {
      pendingSnapshots = Math.max(0, pendingSnapshots - 1);
      setState({
        data: Array.from(byId.values()).sort(
          (first, second) =>
            timestampMillis(second.createdAt) - timestampMillis(first.createdAt)
        ),
        loading: pendingSnapshots > 0,
        error: "",
      });
    };

    const handleError = (error: Error, queryName: string) => {
      if (import.meta.env.DEV) {
        const code =
          error instanceof FirebaseError ? error.code : "unknown-error";
        console.warn("System messages subscription failed", {
          code,
          message: error.message,
          query: queryName,
        });
      }

      const code =
        error instanceof FirebaseError ? error.code : "unknown-error";
      const message =
        code === "permission-denied"
          ? "Permission denied while loading message history."
          : code === "failed-precondition"
            ? "Message history needs a Firestore index for this query."
            : code === "unavailable"
              ? "Network error while loading message history."
              : "Unable to load message history.";

      setState({
        data: Array.from(byId.values()).sort(
          (first, second) =>
            timestampMillis(second.createdAt) - timestampMillis(first.createdAt)
        ),
        loading: false,
        error: message,
      });
    };

    const unsubscribes: Unsubscribe[] = [];

    const applySnapshot = (
      snapshot: QuerySnapshot<DocumentData>,
      bucketKey?: string
    ) => {
      const snapshotById = new Map(
        snapshot.docs.map((item) => [
          item.id,
          {
          id: item.id,
          ...item.data(),
          } as SystemMessageRecord,
        ])
      );

      if (bucketKey) {
        dispatcherQueryBuckets.set(bucketKey, snapshotById);
        byId.clear();
        dispatcherQueryBuckets.forEach((bucket) => {
          bucket.forEach((message, id) => byId.set(id, message));
        });
      } else {
        byId.clear();
        snapshotById.forEach((message, id) => byId.set(id, message));
      }

      emit();
    };

    if (portal === "admin") {
      unsubscribes.push(
        onSnapshot(
          collection(db, "system_messages"),
          (snapshot) => {
            byId.clear();
            applySnapshot(snapshot);
          },
          (error) =>
            handleError(
              error,
              "system_messages full collection (client sorted by createdAt desc)"
            )
        )
      );
    } else {
      publishedMessageStatuses.forEach((status) => {
        unsubscribes.push(
          onSnapshot(
            query(
              collection(db, "system_messages"),
              where("senderId", "==", uid),
              where("senderRole", "==", "dispatcher"),
              where("status", "==", status)
            ),
            (snapshot) => applySnapshot(snapshot, `sender-${status}`),
            (error) =>
              handleError(
                error,
                `system_messages where(senderId == currentDispatcherUid, senderRole == dispatcher, status == ${status})`
              )
          )
        );
        unsubscribes.push(
          onSnapshot(
            query(
              collection(db, "system_messages"),
              where("audienceRoles", "array-contains", "dispatcher"),
              where("status", "==", status)
            ),
            (snapshot) => applySnapshot(snapshot, `audience-dispatcher-${status}`),
            (error) =>
              handleError(
                error,
                `system_messages where(audienceRoles array-contains dispatcher, status == ${status})`
              )
          )
        );
      });
    }

    return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
  }, [portal, uid]);

  return state;
}

function priorityTone(priority?: string) {
  if (priority === "critical") {
    return "red" as const;
  }

  if (priority === "important") {
    return "yellow" as const;
  }

  return "blue" as const;
}
