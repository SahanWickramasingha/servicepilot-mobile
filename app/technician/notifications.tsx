import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  Bell,
  CheckCheck,
  ChevronRight,
  CircleAlert,
  Megaphone,
  Wrench,
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
  subscribeToNotificationCenter,
} from "@/src/services/notification.service";
import { getUserProfile } from "@/src/services/user.service";

export default function TechnicianNotificationsScreen() {
  const [items, setItems] = useState<NotificationCenterItem[]>([]);
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

        if (!profile || profile.role !== "technician") {
          setErrorMessage("Technician profile not found.");
          setLoading(false);
          return;
        }

        unsubscribe = subscribeToNotificationCenter(
          {
            userId: currentUserId,
            role: "technician",
          },
          (nextItems) => {
            setItems(nextItems);
            setLoading(false);
          },
          (error, context) => {
            console.error("Technician notifications error:", error);
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
        console.error("Technician notification load error:", error);
        setErrorMessage("Unable to load notifications.");
        setLoading(false);
      }
    }

    loadNotifications();

    return () => unsubscribe?.();
  }, []);

  const unreadCount = items.filter((item) => !item.read).length;
  const hasLoadError = errorMessage.length > 0;

  const markAllAsRead = async () => {
    const currentUser = auth.currentUser;

    if (!currentUser) {
      return;
    }

    await Promise.all(
      items
        .filter((item) => !item.read)
        .map((item) => markNotificationRead(item, currentUser.uid))
    );
  };

  const openItem = async (item: NotificationCenterItem) => {
    const currentUser = auth.currentUser;

    if (!item.read) {
      await markNotificationRead(item, currentUser?.uid);
    }

    if (item.source === "personal" && item.requestId) {
      router.push({
        pathname: "/technician/job-details",
        params: { id: item.requestId },
      });
    }
  };

  if (loading) {
    return (
      <View style={styles.centerScreen}>
        <ActivityIndicator color="#22C55E" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#06101D" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>Notifications</Text>
            <Text style={styles.subtitle}>
              {hasLoadError
                ? "Some notifications couldn't load"
                : unreadCount > 0
                  ? `${unreadCount} unread`
                  : "You're all caught up"}
            </Text>
          </View>

          {unreadCount > 0 && (
            <TouchableOpacity style={styles.readAllButton} onPress={markAllAsRead}>
              <CheckCheck size={17} color="#22C55E" />
              <Text style={styles.readAllText}>Read All</Text>
            </TouchableOpacity>
          )}
        </View>

        {!!errorMessage && (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        )}

        {items.length > 0 ? (
          <View style={styles.list}>
            {items.map((item) => (
              <TouchableOpacity
                key={`${item.source}-${item.id}`}
                style={[
                  styles.card,
                  !item.read && styles.cardUnread,
                  item.priority === "critical" && styles.cardCritical,
                ]}
                activeOpacity={0.82}
                onPress={() => openItem(item)}
              >
                <View style={styles.iconBox}>
                  {item.source === "system" ? (
                    item.priority === "critical" ? (
                      <CircleAlert size={22} color="#FCA5A5" />
                    ) : (
                      <Megaphone size={22} color="#38BDF8" />
                    )
                  ) : (
                    <Wrench size={22} color="#60A5FA" />
                  )}
                </View>
                <View style={styles.cardContent}>
                  <Text style={styles.cardTitle}>{item.title}</Text>
                  <Text style={styles.cardMessage}>{item.message}</Text>
                  <View style={styles.metaRow}>
                    <Text style={[styles.priority, getPriorityStyle(item.priority)]}>
                      {item.priority.toUpperCase()}
                    </Text>
                    <Text style={styles.source}>
                      {item.source === "system"
                        ? `${item.senderName} (${item.senderRole})`
                        : "Service update"}
                    </Text>
                  </View>
                </View>
                {item.source === "personal" && item.requestId && (
                  <ChevronRight size={18} color="#475569" />
                )}
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <View style={styles.emptyCard}>
            <Bell size={38} color="#64748B" />
            <Text style={styles.emptyTitle}>
              {hasLoadError ? "Notifications unavailable" : "No Notifications"}
            </Text>
            <Text style={styles.emptyText}>
              {hasLoadError
                ? "We couldn't load every notification source. Please try again in a moment."
                : "New jobs, reviews, and system messages will appear here."}
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function getPriorityStyle(priority: NotificationCenterItem["priority"]) {
  if (priority === "critical") {
    return styles.critical;
  }

  if (priority === "important") {
    return styles.important;
  }

  return styles.normal;
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
    paddingHorizontal: 18,
    paddingTop: 54,
    paddingBottom: 90,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 22,
  },
  title: { color: "#FFFFFF", fontSize: 27, fontWeight: "800" },
  subtitle: { color: "#64748B", fontSize: 12, marginTop: 5 },
  readAllButton: {
    minHeight: 40,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.22)",
    backgroundColor: "rgba(34,197,94,0.08)",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
  },
  readAllText: { color: "#22C55E", fontSize: 12, fontWeight: "800" },
  errorCard: {
    backgroundColor: "rgba(239,68,68,0.08)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.22)",
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  errorText: { color: "#FCA5A5", fontSize: 12, textAlign: "center" },
  list: { gap: 12 },
  card: {
    minHeight: 112,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "#17263A",
    backgroundColor: "#0D1B2A",
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
  },
  cardUnread: {
    borderColor: "rgba(34,197,94,0.35)",
    backgroundColor: "#0D1F2B",
  },
  cardCritical: { borderColor: "rgba(239,68,68,0.42)" },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: "#101F30",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  cardContent: { flex: 1 },
  cardTitle: { color: "#F8FAFC", fontSize: 14, fontWeight: "800" },
  cardMessage: {
    color: "#94A3B8",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 6,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 9,
    flexWrap: "wrap",
  },
  priority: {
    overflow: "hidden",
    borderRadius: 7,
    paddingHorizontal: 7,
    paddingVertical: 4,
    fontSize: 8,
    fontWeight: "900",
  },
  normal: { color: "#93C5FD", backgroundColor: "rgba(59,130,246,0.12)" },
  important: { color: "#FCD34D", backgroundColor: "rgba(245,158,11,0.14)" },
  critical: { color: "#FCA5A5", backgroundColor: "rgba(239,68,68,0.16)" },
  source: { color: "#64748B", fontSize: 9, flexShrink: 1 },
  emptyCard: {
    minHeight: 280,
    borderRadius: 18,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  emptyTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "800",
    marginTop: 14,
  },
  emptyText: {
    color: "#64748B",
    fontSize: 12,
    lineHeight: 19,
    textAlign: "center",
    marginTop: 7,
  },
});
