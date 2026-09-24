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
  CustomerNotification,
  markNotificationRead,
  NotificationType,
  subscribeToCustomerNotifications,
} from "@/src/services/notification.service";

export default function NotificationsScreen() {
  const [notifications, setNotifications] = useState<
    CustomerNotification[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const currentUser = auth.currentUser;

    if (!currentUser) {
      setErrorMessage("Please sign in again.");
      setLoading(false);
      return;
    }

    return subscribeToCustomerNotifications(
      currentUser.uid,
      (items) => {
        setNotifications(items);
        setLoading(false);
      },
      (error) => {
        console.error("Notifications subscription error:", error);
        setErrorMessage("Unable to load notifications.");
        setLoading(false);
      }
    );
  }, []);

  const unreadCount = notifications.filter(
    (item) => !item.read
  ).length;

  const markAllAsRead = async () => {
    await Promise.all(
      notifications
        .filter((item) => !item.read)
        .map((item) => markNotificationRead(item.id))
    );
  };

  const openNotification = async (
    item: CustomerNotification
  ) => {
    if (!item.read) {
      await markNotificationRead(item.id);
    }

    if (item.relatedRequestId) {
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
              {unreadCount > 0
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

        {notifications.length > 0 ? (
          <View style={styles.list}>
            {notifications.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={[
                  styles.notificationCard,
                  !item.read &&
                    styles.notificationCardUnread,
                ]}
                activeOpacity={0.8}
                onPress={() => openNotification(item)}
              >
                <View
                  style={[
                    styles.iconBox,
                    getTypeBackground(item.type),
                  ]}
                >
                  {getTypeIcon(item.type)}
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
                  <Text style={styles.notificationTime}>
                    {item.createdAt
                      ? item.createdAt
                          .toDate()
                          .toLocaleString()
                      : "Just now"}
                  </Text>
                </View>

                {!!item.relatedRequestId && (
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
              No Notifications
            </Text>
            <Text style={styles.emptyText}>
              New service updates and important alerts will
              appear here.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function getTypeIcon(type: NotificationType) {
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

function getTypeBackground(type: NotificationType) {
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
