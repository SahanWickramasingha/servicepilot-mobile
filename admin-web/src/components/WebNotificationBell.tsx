import {
  Bell,
  CheckCheck,
  ExternalLink,
  MailOpen,
  Megaphone,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { useAdminAuth } from "../auth/AdminAuthContext";
import { useReceivedSystemMessages } from "../hooks/useReceivedSystemMessages";
import {
  markSystemMessageRead,
  type ReceivedSystemMessage,
} from "../services/receivedMessageService";
import {
  displayText,
  formatDateTime,
  statusLabel,
} from "../utils/format";

export default function WebNotificationBell({
  portal,
}: {
  portal: "admin" | "dispatcher";
}) {
  const { profile } = useAdminAuth();
  const messages = useReceivedSystemMessages(profile);
  const [open, setOpen] = useState(false);
  const [selectedMessage, setSelectedMessage] =
    useState<ReceivedSystemMessage | null>(null);
  const [markingAll, setMarkingAll] = useState(false);
  const userId = profile?.uid ?? profile?.id;
  const inboxPath =
    portal === "admin"
      ? "/admin/messages?view=received"
      : "/dispatcher/messages?view=received";
  const unreadMessages = useMemo(
    () => messages.data.filter((item) => !item.read),
    [messages.data]
  );
  const recentMessages = messages.data.slice(0, 5);

  const openMessage = async (message: ReceivedSystemMessage) => {
    setSelectedMessage(message);

    if (!message.read && userId) {
      await markSystemMessageRead({
        userId,
        messageId: message.id,
      });
    }
  };

  const markAllRead = async () => {
    if (!userId || unreadMessages.length === 0) {
      return;
    }

    try {
      setMarkingAll(true);
      await Promise.all(
        unreadMessages.map((message) =>
          markSystemMessageRead({
            userId,
            messageId: message.id,
          })
        )
      );
    } finally {
      setMarkingAll(false);
    }
  };

  return (
    <div className="web-notification">
      <button
        type="button"
        className="notification-button"
        aria-label={
          unreadMessages.length > 0
            ? `${unreadMessages.length} unread message notification${
                unreadMessages.length === 1 ? "" : "s"
              }`
            : "Open message notifications"
        }
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Bell size={18} />
        {unreadMessages.length > 0 && (
          <span className="notification-badge">
            {unreadMessages.length > 99 ? "99+" : unreadMessages.length}
          </span>
        )}
      </button>

      {open && (
        <div className="web-notification-dropdown" role="dialog">
          <div className="web-notification-header">
            <div>
              <strong>Received Messages</strong>
              <span>
                {messages.error
                  ? "Unable to load the latest inbox"
                  : unreadMessages.length > 0
                    ? `${unreadMessages.length} unread`
                    : "No unread messages"}
              </span>
            </div>
            <button
              type="button"
              aria-label="Close notifications"
              onClick={() => setOpen(false)}
            >
              <X size={15} />
            </button>
          </div>

          {messages.error ? (
            <div className="web-notification-state error">
              {messages.error}
            </div>
          ) : messages.loading ? (
            <div className="web-notification-state">
              Loading received messages...
            </div>
          ) : recentMessages.length === 0 ? (
            <div className="web-notification-state">
              No received messages yet.
            </div>
          ) : (
            <div className="web-notification-list">
              {recentMessages.map((message) => (
                <button
                  key={message.id}
                  type="button"
                  className={`web-notification-item ${
                    message.read ? "" : "unread"
                  }`}
                  onClick={() => openMessage(message)}
                >
                  <span className="web-notification-icon">
                    <Megaphone size={16} />
                  </span>
                  <span className="web-notification-copy">
                    <strong>{displayText(message.title, "System Message")}</strong>
                    <span>{displayText(message.message, "No message body.")}</span>
                    <em>
                      {displayText(message.senderName, "Unknown Sender")} -{" "}
                      {statusLabel(message.senderRole)} -{" "}
                      {formatDateTime(message.createdAt)}
                    </em>
                  </span>
                  {!message.read && (
                    <span className="web-notification-unread-dot" />
                  )}
                </button>
              ))}
            </div>
          )}

          <div className="web-notification-footer">
            <button
              type="button"
              className="web-notification-mark-all"
              disabled={
                markingAll ||
                unreadMessages.length === 0 ||
                messages.loading ||
                Boolean(messages.error)
              }
              onClick={markAllRead}
            >
              <CheckCheck size={14} />
              Mark all read
            </button>
            <Link to={inboxPath} onClick={() => setOpen(false)}>
              <ExternalLink size={14} />
              View all
            </Link>
          </div>
        </div>
      )}

      {selectedMessage && (
        <MessageModal
          message={selectedMessage}
          onClose={() => setSelectedMessage(null)}
        />
      )}
    </div>
  );
}

function MessageModal({
  message,
  onClose,
}: {
  message: ReceivedSystemMessage;
  onClose: () => void;
}) {
  return (
    <div className="admin-modal-overlay" role="dialog" aria-modal="true">
      <div className="admin-modal message-detail-modal">
        <div className="admin-modal-header">
          <div>
            <h2>{displayText(message.title, "System Message")}</h2>
            <span>
              From {displayText(message.senderName, "Unknown Sender")} -{" "}
              {statusLabel(message.senderRole)} -{" "}
              {formatDateTime(message.createdAt)}
            </span>
          </div>
          <button
            type="button"
            className="modal-close"
            aria-label="Close message"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>

        <div className="message-detail-body">
          <div className="message-detail-icon">
            <MailOpen size={22} />
          </div>
          <p>{displayText(message.message, "No message body.")}</p>
        </div>
      </div>
    </div>
  );
}
