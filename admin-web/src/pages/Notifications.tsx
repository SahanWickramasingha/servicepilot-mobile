import {
  Bell,
  Check,
  CheckCheck,
  Clock3,
  Megaphone,
  Search,
  Send,
  Trash2,
  UserCog,
  Users,
  Wrench,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";

type RecipientType =
  | "All"
  | "Customers"
  | "Technicians";

type NotificationType =
  | "System"
  | "Service"
  | "Assignment"
  | "Emergency";

type NotificationItem = {
  id: number;
  title: string;
  message: string;
  recipient: RecipientType;
  type: NotificationType;
  time: string;
  read: boolean;
};

const initialNotifications: NotificationItem[] = [
  {
    id: 1,
    title: "Emergency Service Request",
    message:
      "REQ-2026-0009 requires immediate technician assignment.",
    recipient: "All",
    type: "Emergency",
    time: "5 mins ago",
    read: false,
  },
  {
    id: 2,
    title: "Technician Assigned",
    message:
      "Kasun Perera has been assigned to REQ-2026-0011.",
    recipient: "Technicians",
    type: "Assignment",
    time: "18 mins ago",
    read: false,
  },
  {
    id: 3,
    title: "Service Completed",
    message:
      "Refrigerator Repair REQ-2026-0008 has been completed successfully.",
    recipient: "Customers",
    type: "Service",
    time: "1 hour ago",
    read: true,
  },
  {
    id: 4,
    title: "System Maintenance",
    message:
      "Scheduled maintenance will take place tonight at 11:30 PM.",
    recipient: "All",
    type: "System",
    time: "3 hours ago",
    read: true,
  },
  {
    id: 5,
    title: "New Service Available",
    message:
      "Electrical Installation is now available for customer bookings.",
    recipient: "Customers",
    type: "Service",
    time: "Yesterday",
    read: true,
  },
];

export default function Notifications() {
  const [notifications, setNotifications] =
    useState<NotificationItem[]>(
      initialNotifications
    );

  const [search, setSearch] = useState("");
  const [filter, setFilter] =
    useState("All");

  const [showCompose, setShowCompose] =
    useState(false);

  const [title, setTitle] =
    useState("");

  const [message, setMessage] =
    useState("");

  const [recipient, setRecipient] =
    useState<RecipientType>("All");

  const filteredNotifications =
    useMemo(() => {
      return notifications.filter(
        (notification) => {
          const value =
            search.toLowerCase();

          const matchesSearch =
            notification.title
              .toLowerCase()
              .includes(value) ||
            notification.message
              .toLowerCase()
              .includes(value);

          const matchesFilter =
            filter === "All" ||
            (filter === "Unread" &&
              !notification.read) ||
            (filter === "Read" &&
              notification.read) ||
            notification.recipient ===
              filter;

          return (
            matchesSearch &&
            matchesFilter
          );
        }
      );
    }, [
      notifications,
      search,
      filter,
    ]);

  const unreadCount =
    notifications.filter(
      (notification) =>
        !notification.read
    ).length;

  const customerCount =
    notifications.filter(
      (notification) =>
        notification.recipient ===
        "Customers"
    ).length;

  const technicianCount =
    notifications.filter(
      (notification) =>
        notification.recipient ===
        "Technicians"
    ).length;

  const markRead = (id: number) => {
    setNotifications((current) =>
      current.map((notification) =>
        notification.id === id
          ? {
              ...notification,
              read: true,
            }
          : notification
      )
    );
  };

  const markAllRead = () => {
    setNotifications((current) =>
      current.map((notification) => ({
        ...notification,
        read: true,
      }))
    );
  };

  const deleteNotification = (
    id: number
  ) => {
    setNotifications((current) =>
      current.filter(
        (notification) =>
          notification.id !== id
      )
    );
  };

  const sendNotification = () => {
    if (
      !title.trim() ||
      !message.trim()
    ) {
      return;
    }

    const newNotification: NotificationItem =
      {
        id: Date.now(),
        title,
        message,
        recipient,
        type: "System",
        time: "Just now",
        read: false,
      };

    setNotifications((current) => [
      newNotification,
      ...current,
    ]);

    setTitle("");
    setMessage("");
    setRecipient("All");
    setShowCompose(false);
  };

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Notifications</h1>

          <p>
            Monitor system alerts and send
            notifications to ServicePilot users.
          </p>
        </div>

        <button
          className="compose-notification-button"
          onClick={() =>
            setShowCompose(true)
          }
        >
          <Send size={16} />
          Send Notification
        </button>
      </div>

      <div className="notification-stats-grid">
        <NotificationStat
          value={
            notifications.length
          }
          label="Total Notifications"
          tone="blue"
          icon={<Bell size={19} />}
        />

        <NotificationStat
          value={unreadCount}
          label="Unread"
          tone="orange"
          icon={<Clock3 size={19} />}
        />

        <NotificationStat
          value={customerCount}
          label="Customer Alerts"
          tone="purple"
          icon={<Users size={19} />}
        />

        <NotificationStat
          value={technicianCount}
          label="Technician Alerts"
          tone="green"
          icon={<UserCog size={19} />}
        />
      </div>

      <div className="notification-toolbar">
        <div className="notification-search">
          <Search size={17} />

          <input
            value={search}
            onChange={(event) =>
              setSearch(
                event.target.value
              )
            }
            placeholder="Search notifications..."
          />
        </div>

        <select
          className="notification-filter"
          value={filter}
          onChange={(event) =>
            setFilter(
              event.target.value
            )
          }
        >
          <option>All</option>
          <option>Unread</option>
          <option>Read</option>
          <option>Customers</option>
          <option>Technicians</option>
        </select>

        <button
          className="mark-all-button"
          onClick={markAllRead}
        >
          <CheckCheck size={15} />
          Mark All Read
        </button>
      </div>

      <section className="dashboard-card notifications-card">
        <div className="notifications-heading">
          <div>
            <h2>
              Notification Center
            </h2>

            <p>
              {
                filteredNotifications.length
              }{" "}
              notifications shown
            </p>
          </div>
        </div>

        <div className="notification-list">
          {filteredNotifications.map(
            (notification) => (
              <div
                key={notification.id}
                className={`notification-row ${
                  !notification.read
                    ? "unread"
                    : ""
                }`}
              >
                <div
                  className={`notification-type-icon ${notification.type.toLowerCase()}`}
                >
                  <NotificationIcon
                    type={
                      notification.type
                    }
                  />
                </div>

                <div className="notification-main">
                  <div className="notification-title-line">
                    <strong>
                      {
                        notification.title
                      }
                    </strong>

                    {!notification.read && (
                      <span className="notification-unread-dot" />
                    )}
                  </div>

                  <p>
                    {
                      notification.message
                    }
                  </p>

                  <div className="notification-meta">
                    <span>
                      {
                        notification.time
                      }
                    </span>

                    <span>•</span>

                    <span>
                      To:{" "}
                      {
                        notification.recipient
                      }
                    </span>

                    <span>•</span>

                    <span>
                      {
                        notification.type
                      }
                    </span>
                  </div>
                </div>

                <div className="notification-row-actions">
                  {!notification.read && (
                    <button
                      title="Mark as read"
                      onClick={() =>
                        markRead(
                          notification.id
                        )
                      }
                    >
                      <Check
                        size={15}
                      />
                    </button>
                  )}

                  <button
                    className="notification-delete"
                    title="Delete"
                    onClick={() =>
                      deleteNotification(
                        notification.id
                      )
                    }
                  >
                    <Trash2
                      size={15}
                    />
                  </button>
                </div>
              </div>
            )
          )}
        </div>

        {filteredNotifications.length ===
          0 && (
          <div className="notification-empty">
            <Bell size={35} />

            <strong>
              No notifications
            </strong>

            <span>
              No notifications match
              your current filter.
            </span>
          </div>
        )}
      </section>

      {showCompose && (
        <div className="admin-modal-overlay">
          <div className="admin-modal notification-compose-modal">
            <div className="admin-modal-header">
              <div>
                <h2>
                  Send Notification
                </h2>

                <span>
                  Broadcast a message to
                  ServicePilot users
                </span>
              </div>

              <button
                className="modal-close"
                onClick={() =>
                  setShowCompose(false)
                }
              >
                <X size={19} />
              </button>
            </div>

            <div className="notification-recipient-section">
              <label>
                Send To
              </label>

              <div className="recipient-options">
                <RecipientButton
                  label="All Users"
                  icon={
                    <Megaphone
                      size={18}
                    />
                  }
                  selected={
                    recipient === "All"
                  }
                  onClick={() =>
                    setRecipient("All")
                  }
                />

                <RecipientButton
                  label="Customers"
                  icon={
                    <Users
                      size={18}
                    />
                  }
                  selected={
                    recipient ===
                    "Customers"
                  }
                  onClick={() =>
                    setRecipient(
                      "Customers"
                    )
                  }
                />

                <RecipientButton
                  label="Technicians"
                  icon={
                    <UserCog
                      size={18}
                    />
                  }
                  selected={
                    recipient ===
                    "Technicians"
                  }
                  onClick={() =>
                    setRecipient(
                      "Technicians"
                    )
                  }
                />
              </div>
            </div>

            <div className="notification-form-field">
              <label>
                Notification Title
              </label>

              <input
                value={title}
                onChange={(event) =>
                  setTitle(
                    event.target.value
                  )
                }
                placeholder="Example: Scheduled Maintenance"
              />
            </div>

            <div className="notification-form-field">
              <label>
                Message
              </label>

              <textarea
                value={message}
                onChange={(event) =>
                  setMessage(
                    event.target.value
                  )
                }
                placeholder="Write notification message..."
              />

              <span className="message-count">
                {message.length}/500
              </span>
            </div>

            <div className="notification-preview">
              <span>
                Preview
              </span>

              <div>
                <Bell size={18} />

                <div>
                  <strong>
                    {title ||
                      "Notification Title"}
                  </strong>

                  <p>
                    {message ||
                      "Your notification message will appear here."}
                  </p>
                </div>
              </div>
            </div>

            <div className="notification-compose-actions">
              <button
                className="modal-secondary-button"
                onClick={() =>
                  setShowCompose(false)
                }
              >
                Cancel
              </button>

              <button
                className="modal-primary-button"
                disabled={
                  !title.trim() ||
                  !message.trim()
                }
                onClick={
                  sendNotification
                }
              >
                <Send size={16} />
                Send Notification
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function NotificationStat({
  value,
  label,
  tone,
  icon,
}: {
  value: number;
  label: string;
  tone: string;
  icon: React.ReactNode;
}) {
  return (
    <div
      className={`notification-stat ${tone}`}
    >
      <div className="notification-stat-icon">
        {icon}
      </div>

      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </div>
  );
}

function NotificationIcon({
  type,
}: {
  type: NotificationType;
}) {
  if (type === "Assignment") {
    return <UserCog size={18} />;
  }

  if (type === "Service") {
    return <Wrench size={18} />;
  }

  if (type === "Emergency") {
    return <Megaphone size={18} />;
  }

  return <Bell size={18} />;
}

function RecipientButton({
  label,
  icon,
  selected,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`recipient-option ${
        selected ? "selected" : ""
      }`}
      onClick={onClick}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}