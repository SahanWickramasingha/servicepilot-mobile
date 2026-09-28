import { router } from "expo-router";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Clock3,
  MapPin,
  Navigation,
  Phone,
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

import { normalizeRequestStatus } from "@/src/constants/serviceRequests";
import { useTechnicianRequest } from "@/src/hooks/useTechnicianRequest";
import { updateTechnicianRequestStatus } from "@/src/services/request.service";
import {
  getPriorityUi,
  getRequestDateLabel,
  getRequestDisplayTitle,
  getRequestTimeLabel,
  getStatusUi,
} from "@/src/utils/technicianRequests";

export default function TechnicianJobDetailsScreen() {
  const { request, loading, errorMessage } = useTechnicianRequest();

  const handleCallCustomer = () => {
    if (!request?.customerPhone) {
      Alert.alert("Customer Phone", "No customer phone number is available.");
      return;
    }

    Alert.alert(
      "Call Customer",
      `Call ${request.customerName || "customer"} at ${request.customerPhone}`
    );
  };

  const handleStartJob = async () => {
    if (!request) {
      return;
    }

    try {
      await updateTechnicianRequestStatus(request.id, "in_progress");
      router.push({
        pathname: "/technician/job-action",
        params: { id: request.id },
      });
    } catch (error: any) {
      Alert.alert(
        "Start Job Failed",
        error?.message ?? "Unable to start this job."
      );
    }
  };

  if (loading) {
    return <StateScreen message="Loading job details..." />;
  }

  if (errorMessage || !request) {
    return (
      <StateScreen
        title="Job unavailable"
        message={errorMessage || "Unable to load this job."}
      />
    );
  }

  const status = getStatusUi(request.status);
  const priority = getPriorityUi(request.priority);
  const normalizedStatus = normalizeRequestStatus(request.status);

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
            activeOpacity={0.8}
            onPress={() => router.back()}
          >
            <ArrowLeft size={20} color="#FFFFFF" />
          </TouchableOpacity>

          <View style={styles.headerContent}>
            <Text style={styles.title}>Job Details</Text>
            <Text style={styles.jobId}>{request.id}</Text>
          </View>

          <View
            style={[
              styles.statusBadge,
              {
                backgroundColor: `${status.color}12`,
                borderColor: `${status.color}35`,
              },
            ]}
          >
            <View
              style={[
                styles.statusDot,
                { backgroundColor: status.color },
              ]}
            />
            <Text style={[styles.statusText, { color: status.color }]}>
              {status.label}
            </Text>
          </View>
        </View>

        <View style={styles.serviceCard}>
          <View style={styles.serviceIcon}>
            <Wrench size={27} color="#60A5FA" />
          </View>

          <View style={styles.serviceContent}>
            <Text style={styles.smallLabel}>Service</Text>
            <Text style={styles.serviceName}>
              {getRequestDisplayTitle(request)}
            </Text>
          </View>

          <View
            style={[
              styles.priorityBadge,
              {
                backgroundColor: `${priority.color}12`,
                borderColor: `${priority.color}35`,
              },
            ]}
          >
            <Text
              style={[
                styles.priorityText,
                { color: priority.color },
              ]}
            >
              {priority.label}
            </Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Schedule</Text>

        <View style={styles.scheduleRow}>
          <InfoCard
            icon={<CalendarDays size={20} color="#60A5FA" />}
            label="Date"
            value={getRequestDateLabel(request)}
          />

          <InfoCard
            icon={<Clock3 size={20} color="#A78BFA" />}
            label="Time"
            value={getRequestTimeLabel(request)}
          />
        </View>

        <Text style={styles.sectionTitle}>Customer</Text>

        <View style={styles.customerCard}>
          <View style={styles.avatar}>
            <UserRound size={27} color="#FFFFFF" />
          </View>

          <View style={styles.customerContent}>
            <Text style={styles.customerName}>
              {request.customerName || "Customer"}
            </Text>
            <Text style={styles.customerPhone}>
              {request.customerPhone || "Phone not provided"}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.callButton}
            activeOpacity={0.8}
            onPress={handleCallCustomer}
          >
            <Phone size={19} color="#22C55E" />
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>Service Location</Text>

        <View style={styles.locationCard}>
          <View style={styles.locationIcon}>
            <MapPin size={21} color="#3B82F6" />
          </View>

          <View style={styles.locationContent}>
            <Text style={styles.locationLabel}>Address</Text>
            <Text style={styles.locationValue}>
              {request.address || "Address not provided"}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.navigateButton}
          activeOpacity={0.85}
          onPress={() =>
            router.push({
              pathname: "/technician/navigation",
              params: { id: request.id },
            })
          }
        >
          <Navigation size={18} color="#FFFFFF" />
          <Text style={styles.navigateText}>Open Job Navigation</Text>
        </TouchableOpacity>

        <Text style={styles.sectionTitle}>Service Instructions</Text>

        <View style={styles.instructionsCard}>
          <Text style={styles.instructionsText}>
            {request.description || "No description was provided."}
          </Text>
        </View>

        <View style={styles.noticeCard}>
          <CheckCircle2 size={18} color="#22C55E" />
          <Text style={styles.noticeText}>
            Check the customer location and service instructions before
            starting this job.
          </Text>
        </View>

        {normalizedStatus === "accepted" && (
          <TouchableOpacity
            style={styles.startButton}
            activeOpacity={0.85}
            onPress={handleStartJob}
          >
            <Wrench size={19} color="#FFFFFF" />
            <Text style={styles.startButtonText}>Start Service</Text>
          </TouchableOpacity>
        )}

        {normalizedStatus === "in_progress" && (
          <TouchableOpacity
            style={styles.startButton}
            activeOpacity={0.85}
            onPress={() =>
              router.push({
                pathname: "/technician/job-action",
                params: { id: request.id },
              })
            }
          >
            <Wrench size={19} color="#FFFFFF" />
            <Text style={styles.startButtonText}>Continue Service</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

function StateScreen({
  title = "Please wait",
  message,
}: {
  title?: string;
  message: string;
}) {
  return (
    <View style={styles.stateScreen}>
      {!title.includes("unavailable") && (
        <ActivityIndicator color="#22C55E" />
      )}
      <Text style={styles.stateTitle}>{title}</Text>
      <Text style={styles.stateText}>{message}</Text>
    </View>
  );
}

function InfoCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.scheduleCard}>
      {icon}
      <Text style={styles.scheduleLabel}>{label}</Text>
      <Text style={styles.scheduleValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#06101D" },
  stateScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#06101D",
    paddingHorizontal: 28,
  },
  stateTitle: { color: "#FFFFFF", fontSize: 18, fontWeight: "800" },
  stateText: {
    color: "#94A3B8",
    fontSize: 12,
    marginTop: 10,
    textAlign: "center",
  },
  content: {
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    paddingHorizontal: 18,
    paddingTop: 54,
    paddingBottom: 70,
  },
  header: { flexDirection: "row", alignItems: "center", marginBottom: 24 },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 13,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 13,
  },
  headerContent: { flex: 1 },
  title: { color: "#FFFFFF", fontSize: 24, fontWeight: "800" },
  jobId: { color: "#64748B", fontSize: 10, marginTop: 3 },
  statusBadge: {
    minHeight: 30,
    borderRadius: 9,
    borderWidth: 1,
    paddingHorizontal: 9,
    flexDirection: "row",
    alignItems: "center",
  },
  statusDot: { width: 6, height: 6, borderRadius: 6, marginRight: 6 },
  statusText: { fontSize: 8, fontWeight: "700" },
  serviceCard: {
    minHeight: 92,
    borderRadius: 18,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 15,
    marginBottom: 24,
  },
  serviceIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: "#101F30",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  serviceContent: { flex: 1 },
  smallLabel: { color: "#64748B", fontSize: 8 },
  serviceName: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "800",
    marginTop: 3,
  },
  priorityBadge: {
    height: 28,
    borderRadius: 9,
    borderWidth: 1,
    justifyContent: "center",
    paddingHorizontal: 9,
  },
  priorityText: { fontSize: 8, fontWeight: "700" },
  sectionTitle: {
    color: "#F8FAFC",
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 10,
    marginLeft: 2,
  },
  scheduleRow: { flexDirection: "row", gap: 10, marginBottom: 24 },
  scheduleCard: {
    flex: 1,
    minHeight: 94,
    borderRadius: 15,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    padding: 14,
  },
  scheduleLabel: { color: "#64748B", fontSize: 8, marginTop: 9 },
  scheduleValue: {
    color: "#E2E8F0",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 3,
  },
  customerCard: {
    minHeight: 90,
    borderRadius: 16,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    marginBottom: 24,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#15803D",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 11,
  },
  customerContent: { flex: 1 },
  customerName: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },
  customerPhone: { color: "#64748B", fontSize: 9, marginTop: 4 },
  callButton: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: "rgba(34,197,94,0.07)",
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.20)",
    alignItems: "center",
    justifyContent: "center",
  },
  locationCard: {
    minHeight: 84,
    borderRadius: 15,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
  },
  locationIcon: {
    width: 44,
    height: 44,
    borderRadius: 13,
    backgroundColor: "#101F30",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 11,
  },
  locationContent: { flex: 1 },
  locationLabel: { color: "#64748B", fontSize: 8 },
  locationValue: {
    color: "#CBD5E1",
    fontSize: 10,
    fontWeight: "600",
    marginTop: 4,
  },
  navigateButton: {
    height: 50,
    borderRadius: 12,
    backgroundColor: "#15803D",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    marginTop: 10,
    marginBottom: 24,
  },
  navigateText: { color: "#FFFFFF", fontSize: 11, fontWeight: "700" },
  instructionsCard: {
    minHeight: 125,
    borderRadius: 16,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    padding: 15,
    marginBottom: 24,
  },
  instructionsText: { color: "#CBD5E1", fontSize: 11, lineHeight: 19 },
  noticeCard: {
    minHeight: 70,
    borderRadius: 14,
    backgroundColor: "rgba(34,197,94,0.05)",
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.15)",
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 13,
    marginBottom: 20,
  },
  noticeText: {
    color: "#94A3B8",
    fontSize: 9,
    lineHeight: 15,
    flex: 1,
    marginLeft: 9,
  },
  startButton: {
    height: 56,
    borderRadius: 12,
    backgroundColor: "#15803D",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  startButtonText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },
});
