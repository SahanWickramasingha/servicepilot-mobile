import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Clock3,
  MapPin,
  Star,
  UserRound,
  Wrench,
} from "lucide-react-native";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import {
  getPriorityColor,
  getPriorityLabel,
  getRequestStatusColor,
  getRequestStatusLabel,
  RequestStatus,
} from "@/src/constants/serviceRequests";
import { auth } from "@/src/firebase/config";
import {
  cancelServiceRequest,
  formatRequestDate,
  ServiceRequest,
  subscribeToServiceRequest,
} from "@/src/services/request.service";

const TIMELINE: Array<{
  key: string;
  title: string;
  statuses: RequestStatus[];
}> = [
  {
    key: "submitted",
    title: "Request Submitted",
    statuses: [
      "pending",
      "assigned",
      "in_progress",
      "completed",
      "cancelled",
    ],
  },
  {
    key: "review",
    title: "Dispatcher Review",
    statuses: [
      "pending",
      "assigned",
      "in_progress",
      "completed",
      "cancelled",
    ],
  },
  {
    key: "assigned",
    title: "Technician Assigned",
    statuses: ["assigned", "in_progress", "completed"],
  },
  {
    key: "progress",
    title: "Work In Progress",
    statuses: ["in_progress", "completed"],
  },
  {
    key: "completed",
    title: "Completed",
    statuses: ["completed"],
  },
] as const;

export default function RequestDetailsScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const requestId = String(params.id ?? "");
  const [request, setRequest] =
    useState<ServiceRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    if (!requestId) {
      setErrorMessage("Request not found.");
      setLoading(false);
      return;
    }

    const unsubscribe = subscribeToServiceRequest(
      requestId,
      (item) => {
        const currentUser = auth.currentUser;

        if (
          item &&
          currentUser &&
          item.customerId !== currentUser.uid
        ) {
          setRequest(null);
          setErrorMessage(
            "You do not have access to this request."
          );
          setLoading(false);
          return;
        }

        setRequest(item);
        setErrorMessage(
          item ? "" : "Request could not be found."
        );
        setLoading(false);
      },
      (error) => {
        console.error(
          "Request details subscription error:",
          error
        );
        setErrorMessage("Unable to load request details.");
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [requestId]);

  const statusColor = request
    ? getRequestStatusColor(request.status)
    : "#64748B";

  const canCancel = request?.status === "pending";

  const timelineItems = useMemo(() => {
    if (!request) {
      return [];
    }

    return TIMELINE.map((item) => ({
      ...item,
      completed: item.statuses.includes(request.status),
      active:
        request.status !== "cancelled" &&
        item.statuses[0] === request.status,
    }));
  }, [request]);

  const handleCancel = () => {
    if (!request || !canCancel) {
      return;
    }

    Alert.alert(
      "Cancel Request",
      "Are you sure you want to cancel this service request?",
      [
        { text: "Keep Request", style: "cancel" },
        {
          text: "Cancel Request",
          style: "destructive",
          onPress: async () => {
            try {
              setCancelling(true);
              await cancelServiceRequest(
                request.id,
                request.customerId
              );
            } catch (error: any) {
              console.error("Cancel request error:", error);
              Alert.alert(
                "Unable to Cancel",
                error?.message ||
                  "This request cannot be cancelled."
              );
            } finally {
              setCancelling(false);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.centerScreen}>
        <ActivityIndicator color="#3B82F6" />
      </View>
    );
  }

  if (!request) {
    return (
      <View style={styles.container}>
        <StatusBar
          barStyle="light-content"
          backgroundColor="#06101D"
        />
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>
            Request Unavailable
          </Text>
          <Text style={styles.emptyText}>
            {errorMessage}
          </Text>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => router.replace("/bookings")}
          >
            <Text style={styles.primaryButtonText}>
              Back to Requests
            </Text>
          </TouchableOpacity>
        </View>
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
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
            activeOpacity={0.8}
          >
            <ArrowLeft size={20} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={styles.headerText}>
            <Text style={styles.title}>
              Request Details
            </Text>
            <Text style={styles.subtitle}>
              {request.id}
            </Text>
          </View>
        </View>

        <View style={styles.mainCard}>
          <View style={styles.mainTopRow}>
            <View style={styles.serviceIcon}>
              <Wrench size={25} color="#60A5FA" />
            </View>
            <View style={styles.serviceContent}>
              <Text style={styles.serviceLabel}>
                {request.serviceCategory}
              </Text>
              <Text style={styles.serviceName}>
                {request.title}
              </Text>
            </View>
          </View>

          <View style={styles.divider} />

          <InfoRow
            icon={<CalendarDays size={18} color="#60A5FA" />}
            label="Preferred Date"
            value={request.preferredDate}
          />
          <InfoRow
            icon={<Clock3 size={18} color="#A78BFA" />}
            label="Preferred Time"
            value={request.preferredTime || "Any time"}
          />
          <InfoRow
            icon={<MapPin size={18} color="#22D3EE" />}
            label="Service Address"
            value={request.address}
          />
          <InfoRow
            icon={<Clock3 size={18} color="#64748B" />}
            label="Created"
            value={formatRequestDate(request.createdAt)}
          />
        </View>

        <View style={styles.statusPriorityRow}>
          <View
            style={[
              styles.statusPanel,
              {
                borderColor: `${statusColor}30`,
                backgroundColor: `${statusColor}10`,
              },
            ]}
          >
            <Text style={styles.panelLabel}>
              Current Status
            </Text>
            <Text
              style={[
                styles.panelValue,
                { color: statusColor },
              ]}
            >
              {getRequestStatusLabel(request.status)}
            </Text>
          </View>

          <View
            style={[
              styles.statusPanel,
              {
                borderColor: `${getPriorityColor(
                  request.priority
                )}30`,
                backgroundColor: `${getPriorityColor(
                  request.priority
                )}10`,
              },
            ]}
          >
            <Text style={styles.panelLabel}>Priority</Text>
            <Text
              style={[
                styles.panelValue,
                {
                  color: getPriorityColor(request.priority),
                },
              ]}
            >
              {getPriorityLabel(request.priority)}
            </Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>
          Description
        </Text>
        <View style={styles.descriptionCard}>
          <Text style={styles.descriptionText}>
            {request.description || "No description provided."}
          </Text>
        </View>

        <Text style={styles.sectionTitle}>
          Assigned Technician
        </Text>
        <View style={styles.technicianCard}>
          <View style={styles.avatar}>
            <UserRound size={28} color="#FFFFFF" />
          </View>
          <View style={styles.technicianInfo}>
            <Text style={styles.technicianName}>
              {request.assignedTechnicianName ||
                "Waiting for technician assignment"}
            </Text>
            <Text style={styles.technicianRole}>
              {request.assignedTechnicianId
                ? "Service Technician"
                : "Dispatcher review in progress"}
            </Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>
          Attachments
        </Text>
        <View style={styles.descriptionCard}>
          <Text style={styles.descriptionText}>
            {request.imageUrls.length > 0
              ? `${request.imageUrls.length} attachment(s) added`
              : "No attachments added."}
          </Text>
        </View>

        <Text style={styles.sectionTitle}>
          Status Timeline
        </Text>
        <View style={styles.timelineCard}>
          {timelineItems.map((item, index) => (
            <TimelineItem
              key={item.key}
              title={item.title}
              completed={item.completed}
              active={item.active}
              last={index === timelineItems.length - 1}
            />
          ))}
          {request.status === "cancelled" && (
            <Text style={styles.cancelledTimelineText}>
              This request was cancelled before work started.
            </Text>
          )}
        </View>

        {request.status === "completed" && (
          <TouchableOpacity
            style={styles.reviewButton}
            activeOpacity={0.85}
            onPress={() =>
              router.push({
                pathname: "/review-technician",
                params: { id: request.id },
              })
            }
          >
            <Star size={19} color="#FFFFFF" />
            <Text style={styles.primaryButtonText}>
              Rate Service
            </Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[
            styles.cancelButton,
            !canCancel && styles.cancelButtonDisabled,
          ]}
          activeOpacity={0.8}
          disabled={!canCancel || cancelling}
          onPress={handleCancel}
        >
          {cancelling ? (
            <ActivityIndicator color="#EF4444" />
          ) : (
            <Text style={styles.cancelButtonText}>
              {canCancel
                ? "Cancel Request"
                : "Cancellation Not Available"}
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoIcon}>{icon}</View>
      <View style={styles.infoContent}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>
          {value || "Not available"}
        </Text>
      </View>
    </View>
  );
}

function TimelineItem({
  title,
  completed,
  active,
  last,
}: {
  title: string;
  completed: boolean;
  active: boolean;
  last: boolean;
}) {
  return (
    <View style={styles.timelineRow}>
      <View style={styles.timelineVisual}>
        <View
          style={[
            styles.timelineDot,
            completed && styles.timelineDotCompleted,
            active && styles.timelineDotActive,
          ]}
        >
          {completed && (
            <CheckCircle2 size={14} color="#22C55E" />
          )}
        </View>
        {!last && (
          <View
            style={[
              styles.timelineLine,
              completed && styles.timelineLineCompleted,
            ]}
          />
        )}
      </View>
      <View style={styles.timelineContent}>
        <Text
          style={[
            styles.timelineTitle,
            active && styles.timelineTitleActive,
          ]}
        >
          {title}
        </Text>
      </View>
    </View>
  );
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
    paddingBottom: 120,
  },
  emptyState: {
    flex: 1,
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  emptyTitle: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "800",
  },
  emptyText: {
    color: "#94A3B8",
    fontSize: 12,
    lineHeight: 19,
    textAlign: "center",
    marginTop: 9,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 26,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 13,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  headerText: { flex: 1 },
  title: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "800",
  },
  subtitle: {
    color: "#64748B",
    fontSize: 11,
    marginTop: 4,
  },
  mainCard: {
    backgroundColor: "#0D1B2A",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#17263A",
    padding: 16,
    marginBottom: 16,
  },
  mainTopRow: { flexDirection: "row", alignItems: "center" },
  serviceIcon: {
    width: 50,
    height: 50,
    borderRadius: 15,
    backgroundColor: "#101F30",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  serviceContent: { flex: 1 },
  serviceLabel: { color: "#64748B", fontSize: 9 },
  serviceName: {
    color: "#F8FAFC",
    fontSize: 17,
    fontWeight: "800",
    marginTop: 3,
  },
  divider: {
    height: 1,
    backgroundColor: "#17263A",
    marginVertical: 15,
  },
  infoRow: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
  },
  infoIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#101F30",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 11,
  },
  infoContent: { flex: 1 },
  infoLabel: { color: "#64748B", fontSize: 9 },
  infoValue: {
    color: "#E2E8F0",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 3,
  },
  statusPriorityRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 24,
  },
  statusPanel: {
    flex: 1,
    minHeight: 74,
    borderRadius: 15,
    borderWidth: 1,
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  panelLabel: { color: "#64748B", fontSize: 9 },
  panelValue: {
    fontSize: 14,
    fontWeight: "800",
    marginTop: 5,
  },
  sectionTitle: {
    color: "#F8FAFC",
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 10,
    marginLeft: 2,
  },
  descriptionCard: {
    minHeight: 78,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    borderRadius: 16,
    padding: 15,
    marginBottom: 24,
  },
  descriptionText: {
    color: "#CBD5E1",
    fontSize: 12,
    lineHeight: 20,
  },
  technicianCard: {
    minHeight: 92,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    marginBottom: 24,
  },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  technicianInfo: { flex: 1 },
  technicianName: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  technicianRole: {
    color: "#64748B",
    fontSize: 10,
    marginTop: 3,
  },
  timelineCard: {
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    borderRadius: 17,
    paddingHorizontal: 16,
    paddingVertical: 17,
    marginBottom: 18,
  },
  timelineRow: { flexDirection: "row", minHeight: 54 },
  timelineVisual: { width: 30, alignItems: "center" },
  timelineDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#475569",
    backgroundColor: "#0D1B2A",
    alignItems: "center",
    justifyContent: "center",
  },
  timelineDotCompleted: { borderColor: "#22C55E" },
  timelineDotActive: {
    backgroundColor: "#2563EB",
    borderColor: "#60A5FA",
  },
  timelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: "#243247",
    marginVertical: 4,
  },
  timelineLineCompleted: { backgroundColor: "#22C55E" },
  timelineContent: {
    flex: 1,
    paddingLeft: 10,
    paddingBottom: 10,
  },
  timelineTitle: {
    color: "#CBD5E1",
    fontSize: 12,
    fontWeight: "700",
  },
  timelineTitleActive: { color: "#60A5FA" },
  cancelledTimelineText: {
    color: "#FCA5A5",
    fontSize: 11,
    lineHeight: 17,
  },
  primaryButton: {
    width: "100%",
    height: 54,
    borderRadius: 12,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 22,
  },
  reviewButton: {
    height: 56,
    borderRadius: 12,
    backgroundColor: "#2563EB",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  cancelButton: {
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.30)",
    backgroundColor: "rgba(239,68,68,0.05)",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
  },
  cancelButtonDisabled: { opacity: 0.45 },
  cancelButtonText: {
    color: "#EF4444",
    fontSize: 13,
    fontWeight: "700",
  },
});
