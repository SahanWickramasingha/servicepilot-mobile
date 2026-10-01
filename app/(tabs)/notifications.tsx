import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  Bell,
  BriefcaseBusiness,
  CalendarClock,
  CheckCheck,
  ChevronRight,
  CircleAlert,
  Info,
  Megaphone,
} from "lucide-react-native";
import {
  ActivityIndicator,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { auth } from "@/src/firebase/config";
import {
  NotificationCenterItem,
  markNotificationRead,
  NotificationType,
  subscribeToCustomerNotifications,
} from "@/src/services/notification.service";
import { getUserProfile } from "@/src/services/user.service";

type FilterKey = "all" | "unread" | "important" | "system";

export default function NotificationsScreen() {
  const [notifications, setNotifications] = useState<
    NotificationCenterItem[]
  >([]);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const currentUser = auth.currentUser;

    if (!currentUser) {
      setErrorMessage("Please sign in again.");
      setLoading(false);
      return;
    }

    const currentUserId = currentUser.uid;
    let unsubscribe: (() => void) | undefined;

    async function loadNotifications() {
      try {
        const profile = await getUserProfile(currentUserId);

        if (!profile) {
          setErrorMessage("Profile not found.");
          setLoading(false);
          return;
        }

        unsubscribe = subscribeToCustomerNotifications(
          {
            userId: currentUserId,
            role: profile.role,
          },
          (items) => {
            setNotifications(items);
            setLoading(false);
          },
          (error, context) => {
            console.error("Notifications subscription error:", error);
            setErrorMessage(
              context.queryType === "system-messages"
                ? "Unable to load system messages."
                : context.queryType === "personal-notifications"
                  ? "Unable to load personal notifications."
                  : "Unable to load message read status."
            );
            setLoading(false);
          }
        );
      } catch (error) {
        console.error("Notifications profile load error:", error);
        setErrorMessage("Unable to load notifications.");
        setLoading(false);
      }
    }

    loadNotifications();

    return () => unsubscribe?.();
  }, []);

  const unreadCount = notifications.filter(
    (item) => !item.read
  ).length;
  const hasLoadError = errorMessage.length > 0;
  const visibleNotifications = notifications.filter((item) => {
    if (filter === "unread") {
      return !item.read;
    }

    if (filter === "important") {
      return item.priority === "important" || item.priority === "critical";
    }

    if (filter === "system") {
      return item.source === "system";
    }

    return true;
  });

  const markAllAsRead = async () => {
    const currentUser = auth.currentUser;

    if (!currentUser) {
      return;
    }

    await Promise.all(
      notifications
        .filter((item) => !item.read)
        .map((item) => markNotificationRead(item, currentUser.uid))
    );
  };

  const openNotification = async (
    item: NotificationCenterItem
  ) => {
    const currentUser = auth.currentUser;

    if (!item.read) {
      await markNotificationRead(item, currentUser?.uid);
    }

    if (item.source === "personal" && item.relatedRequestId) {
      router.push({
        pathname: "/request-details",
        params: { id: item.relatedRequestId },
      });
    }
  };

  if (loading) {
    return (
      <View style={styles.centerScreen}>
        <ActivityIndicator color="#3B82F6" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar
        barStyle="light-content"
        backgroundColor="#06101D"
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Text style={styles.title}>Notifications</Text>
            <Text style={styles.subtitle}>
              {hasLoadError
                ? "Some notifications couldn't load"
                : unreadCount > 0
                ? `${unreadCount} unread notification${
                    unreadCount > 1 ? "s" : ""
                  }`
                : "You're all caught up"}
            </Text>
          </View>

          {unreadCount > 0 && (
            <TouchableOpacity
              style={styles.readAllButton}
              activeOpacity={0.8}
              onPress={markAllAsRead}
            >
              <CheckCheck size={17} color="#3B82F6" />
              <Text style={styles.readAllText}>
                Read All
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {!!errorMessage && (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>
              {errorMessage}
            </Text>
          </View>
        )}

        <View style={styles.filterRow}>
          {(["all", "unread", "important", "system"] as FilterKey[]).map(
            (item) => (
              <TouchableOpacity
                key={item}
                style={[
                  styles.filterChip,
                  filter === item && styles.filterChipActive,
                ]}
                activeOpacity={0.8}
                onPress={() => setFilter(item)}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    filter === item && styles.filterChipTextActive,
                  ]}
                >
                  {item.charAt(0).toUpperCase() + item.slice(1)}
                </Text>
              </TouchableOpacity>
            )
          )}
        </View>

        {visibleNotifications.length > 0 ? (
          <View style={styles.list}>
            {visibleNotifications.map((item) => (
              <TouchableOpacity
                key={`${item.source}-${item.id}`}
                style={[
                  styles.notificationCard,
                  !item.read &&
                    styles.notificationCardUnread,
                  item.priority === "critical" && styles.notificationCardCritical,
                ]}
                activeOpacity={0.8}
                onPress={() => openNotification(item)}
              >
                <View
                  style={[
                    styles.iconBox,
                    getTypeBackground(item),
                  ]}
                >
                  {getTypeIcon(item)}
                </View>

                <View style={styles.notificationContent}>
                  <View style={styles.notificationHeader}>
                    <Text style={styles.notificationTitle}>
                      {item.title}
                    </Text>
                    {!item.read && (
                      <View style={styles.unreadDot} />
                    )}
                  </View>

                  <Text style={styles.notificationMessage}>
                    {item.message}
                  </Text>
                  <View style={styles.metaRow}>
                    <PriorityBadge priority={item.priority} />
                    <Text style={styles.sourceText}>
                      {item.source === "system"
                        ? `${item.senderName} (${item.senderRole})`
                        : "Service update"}
                    </Text>
                  </View>
                  <Text style={styles.notificationTime}>
                    {item.createdAt
                      ? item.createdAt
                          .toDate()
                          .toLocaleString()
                      : "Just now"}
                  </Text>
                </View>

                {item.source === "personal" && !!item.relatedRequestId && (
                  <ChevronRight
                    size={18}
                    color="#475569"
                  />
                )}
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIcon}>
              <Bell size={38} color="#64748B" />
            </View>
            <Text style={styles.emptyTitle}>
              {hasLoadError ? "Notifications unavailable" : "No Notifications"}
            </Text>
            <Text style={styles.emptyText}>
              {hasLoadError
                ? "We couldn't load every notification source. Please try again in a moment."
                : "New service updates and important alerts will appear here."}
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function PriorityBadge({
  priority,
}: {
  priority: NotificationCenterItem["priority"];
}) {
  return (
    <View style={[styles.priorityBadge, getPriorityStyle(priority)]}>
      <Text style={styles.priorityText}>{priority.toUpperCase()}</Text>
    </View>
  );
}

function getPriorityStyle(priority: NotificationCenterItem["priority"]) {
  if (priority === "critical") {
    return styles.priority_critical;
  }

  if (priority === "important") {
    return styles.priority_important;
  }

  return styles.priority_normal;
}

function getTypeIcon(item: NotificationCenterItem) {
  if (item.source === "system") {
    if (item.priority === "critical") {
      return <CircleAlert size={21} color="#FCA5A5" />;
    }

    return <Megaphone size={21} color="#38BDF8" />;
  }

  const type = item.type as NotificationType;

  switch (type) {
    case "request_submitted":
    case "technician_assigned":
    case "work_started":
    case "request_completed":
    case "request_cancelled":
      return (
        <BriefcaseBusiness size={21} color="#60A5FA" />
      );
    case "schedule_updated":
      return <CalendarClock size={21} color="#F59E0B" />;
    case "system":
    default:
      return <Info size={21} color="#38BDF8" />;
  }
}

function getTypeBackground(item: NotificationCenterItem) {
  if (item.priority === "critical") {
    return { backgroundColor: "rgba(239,68,68,0.13)" };
  }

  if (item.priority === "important") {
    return { backgroundColor: "rgba(245,158,11,0.12)" };
  }

  if (item.source === "system") {
    return { backgroundColor: "rgba(14,165,233,0.12)" };
  }

  const type = item.type as NotificationType;

  switch (type) {
    case "request_cancelled":
      return { backgroundColor: "rgba(239,68,68,0.10)" };
    case "schedule_updated":
      return { backgroundColor: "rgba(245,158,11,0.10)" };
    case "system":
      return { backgroundColor: "rgba(124,58,237,0.12)" };
    default:
      return { backgroundColor: "rgba(37,99,235,0.12)" };
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#06101D" },
  centerScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#06101D",
  },
  content: {
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    paddingHorizontal: 20,
    paddingTop: 58,
    paddingBottom: 120,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 28,
    gap: 12,
  },
  headerText: { flex: 1 },
  title: {
    color: "#FFFFFF",
    fontSize: 29,
    fontWeight: "800",
  },
  subtitle: {
    color: "#64748B",
    fontSize: 12,
    marginTop: 5,
  },
  readAllButton: {
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: 11,
    backgroundColor: "rgba(37,99,235,0.08)",
    borderWidth: 1,
    borderColor: "rgba(37,99,235,0.20)",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  readAllText: {
    color: "#3B82F6",
    fontSize: 12,
    fontWeight: "700",
  },
  errorCard: {
    backgroundColor: "rgba(239,68,68,0.08)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.22)",
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  errorText: {
    color: "#FCA5A5",
    fontSize: 12,
    textAlign: "center",
  },
  filterRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 14,
    flexWrap: "wrap",
  },
  filterChip: {
    height: 35,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#17263A",
    backgroundColor: "#0D1B2A",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  filterChipActive: {
    backgroundColor: "#2563EB",
    borderColor: "#2563EB",
  },
  filterChipText: {
    color: "#94A3B8",
    fontSize: 10,
    fontWeight: "800",
  },
  filterChipTextActive: { color: "#FFFFFF" },
  list: { gap: 12 },
  notificationCard: {
    minHeight: 108,
    backgroundColor: "#0D1B2A",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#17263A",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 15,
  },
  notificationCardUnread: {
    borderColor: "rgba(37,99,235,0.38)",
    backgroundColor: "#0D1D30",
  },
  notificationCardCritical: {
    borderColor: "rgba(239,68,68,0.42)",
  },
  iconBox: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  notificationContent: { flex: 1 },
  notificationHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  notificationTitle: {
    color: "#F8FAFC",
    fontSize: 14,
    fontWeight: "700",
    flexShrink: 1,
  },
  unreadDot: {
    width: 7,
    height: 7,
    borderRadius: 7,
    backgroundColor: "#3B82F6",
    marginLeft: 7,
  },
  notificationMessage: {
    color: "#94A3B8",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 6,
    paddingRight: 8,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginTop: 8,
    flexWrap: "wrap",
  },
  priorityBadge: {
    minHeight: 22,
    borderRadius: 7,
    justifyContent: "center",
    paddingHorizontal: 7,
  },
  priority_normal: {
    backgroundColor: "rgba(59,130,246,0.12)",
  },
  priority_important: {
    backgroundColor: "rgba(245,158,11,0.14)",
  },
  priority_critical: {
    backgroundColor: "rgba(239,68,68,0.16)",
  },
  priorityText: {
    color: "#E2E8F0",
    fontSize: 8,
    fontWeight: "900",
  },
  sourceText: {
    color: "#64748B",
    fontSize: 9,
    flexShrink: 1,
  },
  notificationTime: {
    color: "#475569",
    fontSize: 10,
    marginTop: 7,
  },
  emptyCard: {
    minHeight: 260,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 30,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#101F30",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  emptyTitle: {
    color: "#FFFFFF",
    fontSize: 19,
    fontWeight: "800",
  },
  emptyText: {
    color: "#64748B",
    fontSize: 12,
    lineHeight: 19,
    textAlign: "center",
    marginTop: 8,
  },
});
