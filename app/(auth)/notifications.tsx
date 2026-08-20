import { router } from "expo-router";
import { useState } from "react";
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
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

type NotificationItem = {
  id: number;
  title: string;
  message: string;
  time: string;
  type: "job" | "schedule" | "system" | "info";
  unread: boolean;
};

const initialNotifications: NotificationItem[] = [
  {
    id: 1,
    title: "Technician Assigned",
    message:
      "A technician has been assigned to your air conditioner service request.",
    time: "5 min ago",
    type: "job",
    unread: true,
  },
  {
    id: 2,
    title: "Schedule Updated",
    message:
      "Your service appointment has been rescheduled to 3:30 PM today.",
    time: "30 min ago",
    type: "schedule",
    unread: true,
  },
  {
    id: 3,
    title: "Service Request Created",
    message:
      "Your service request has been submitted successfully.",
    time: "2 hrs ago",
    type: "info",
    unread: false,
  },
  {
    id: 4,
    title: "Account Security",
    message:
      "Your account password was changed successfully.",
    time: "Yesterday",
    type: "system",
    unread: false,
  },
];

export default function NotificationsScreen() {
  const [notifications, setNotifications] =
    useState<NotificationItem[]>(initialNotifications);

  const unreadCount = notifications.filter(
    (item) => item.unread
  ).length;

  const markAllAsRead = () => {
    setNotifications((current) =>
      current.map((item) => ({
        ...item,
        unread: false,
      }))
    );
  };

  const openNotification = (id: number) => {
    setNotifications((current) =>
      current.map((item) =>
        item.id === id
          ? { ...item, unread: false }
          : item
      )
    );

    /*
      Later:
      Deep-link to related request/job based on notification entityId.
    */
  };

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
        {/* Header */}
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>
              Notifications
            </Text>

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
              <CheckCheck
                size={17}
                color="#3B82F6"
              />

              <Text style={styles.readAllText}>
                Read All
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Notification List */}
        {notifications.length > 0 ? (
          <View style={styles.list}>
            {notifications.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={[
                  styles.notificationCard,
                  item.unread &&
                    styles.notificationCardUnread,
                ]}
                activeOpacity={0.8}
                onPress={() =>
                  openNotification(item.id)
                }
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

                    {item.unread && (
                      <View style={styles.unreadDot} />
                    )}
                  </View>

                  <Text style={styles.notificationMessage}>
                    {item.message}
                  </Text>

                  <Text style={styles.notificationTime}>
                    {item.time}
                  </Text>
                </View>

                <ChevronRight
                  size={18}
                  color="#475569"
                />
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIcon}>
              <Bell
                size={38}
                color="#64748B"
              />
            </View>

            <Text style={styles.emptyTitle}>
              No Notifications
            </Text>

            <Text style={styles.emptyText}>
              New job updates, schedule changes and
              important alerts will appear here.
            </Text>
          </View>
        )}

        {/* Information Card */}
        <View style={styles.infoCard}>
          <Info
            size={18}
            color="#38BDF8"
          />

          <Text style={styles.infoText}>
            Important service and security alerts may
            still be sent even if optional notifications
            are disabled.
          </Text>
        </View>

        <TouchableOpacity
          style={styles.backButton}
          activeOpacity={0.8}
          onPress={() => router.back()}
        >
          <Text style={styles.backButtonText}>
            Back
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function getTypeIcon(type: NotificationItem["type"]) {
  switch (type) {
    case "job":
      return (
        <BriefcaseBusiness
          size={21}
          color="#60A5FA"
        />
      );

    case "schedule":
      return (
        <CalendarClock
          size={21}
          color="#F59E0B"
        />
      );

    case "system":
      return (
        <CircleAlert
          size={21}
          color="#A78BFA"
        />
      );

    default:
      return (
        <Info
          size={21}
          color="#38BDF8"
        />
      );
  }
}

function getTypeBackground(
  type: NotificationItem["type"]
) {
  switch (type) {
    case "job":
      return {
        backgroundColor:
          "rgba(37,99,235,0.12)",
      };

    case "schedule":
      return {
        backgroundColor:
          "rgba(245,158,11,0.10)",
      };

    case "system":
      return {
        backgroundColor:
          "rgba(124,58,237,0.12)",
      };

    default:
      return {
        backgroundColor:
          "rgba(56,189,248,0.10)",
      };
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#06101D",
  },

  content: {
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    paddingHorizontal: 20,
    paddingTop: 58,
    paddingBottom: 60,
  },

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 28,
  },

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
    backgroundColor:
      "rgba(37,99,235,0.08)",
    borderWidth: 1,
    borderColor:
      "rgba(37,99,235,0.20)",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  readAllText: {
    color: "#3B82F6",
    fontSize: 12,
    fontWeight: "700",
  },

  list: {
    gap: 12,
  },

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
    borderColor:
      "rgba(37,99,235,0.38)",
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

  notificationContent: {
    flex: 1,
  },

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

  infoCard: {
    minHeight: 70,
    borderRadius: 14,
    backgroundColor:
      "rgba(56,189,248,0.06)",
    borderWidth: 1,
    borderColor:
      "rgba(56,189,248,0.15)",
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 15,
    marginTop: 22,
  },

  infoText: {
    color: "#94A3B8",
    fontSize: 11,
    lineHeight: 17,
    flex: 1,
    marginLeft: 10,
  },

  backButton: {
    height: 52,
    borderRadius: 12,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 20,
  },

  backButtonText: {
    color: "#CBD5E1",
    fontSize: 13,
    fontWeight: "700",
  },
});