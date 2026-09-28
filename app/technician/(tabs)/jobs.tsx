import { router } from "expo-router";
import { useMemo, useState } from "react";
import {
  CheckCircle2,
  Clock3,
  MapPin,
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
import { useTechnicianWorkspace } from "@/src/hooks/useTechnicianWorkspace";
import {
  ServiceRequest,
  updateTechnicianRequestStatus,
} from "@/src/services/request.service";
import {
  getActiveTechnicianRequests,
  getPriorityUi,
  getRequestDisplayTitle,
  getRequestTimeLabel,
  getStatusUi,
  sortRequestsBySchedule,
} from "@/src/utils/technicianRequests";

type FilterType =
  | "all"
  | "requested"
  | "accepted"
  | "in_progress";

export default function TechnicianJobsScreen() {
  const { requests, loading, errorMessage } = useTechnicianWorkspace();
  const [filter, setFilter] = useState<FilterType>("all");
  const [updatingId, setUpdatingId] = useState("");

  const jobs = useMemo(
    () => sortRequestsBySchedule(getActiveTechnicianRequests(requests)),
    [requests]
  );

  const filteredJobs = useMemo(() => {
    if (filter === "all") {
      return jobs;
    }

    return jobs.filter(
      (job) => normalizeRequestStatus(job.status) === filter
    );
  }, [filter, jobs]);

  const handleStatusUpdate = async (
    requestId: string,
    status: "accepted" | "rejected" | "in_progress" | "completed"
  ) => {
    try {
      setUpdatingId(requestId);
      await updateTechnicianRequestStatus(requestId, status);
    } catch (error: any) {
      Alert.alert(
        "Job Update Failed",
        error?.message ?? "Unable to update this job."
      );
    } finally {
      setUpdatingId("");
    }
  };

  if (loading) {
    return <StateScreen message="Loading jobs..." />;
  }

  if (errorMessage) {
    return (
      <StateScreen
        title="Jobs unavailable"
        message={errorMessage}
      />
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
          <View>
            <Text style={styles.title}>Today&apos;s Jobs</Text>

            <Text style={styles.subtitle}>
              Manage your assigned service jobs
            </Text>
          </View>

          <View style={styles.totalBadge}>
            <Text style={styles.totalValue}>{jobs.length}</Text>
            <Text style={styles.totalLabel}>Jobs</Text>
          </View>
        </View>

        <View style={styles.overviewRow}>
          <OverviewCard
            value={
              jobs.filter(
                (job) =>
                  normalizeRequestStatus(job.status) === "requested"
              ).length
            }
            label="Requested"
            color="#F59E0B"
          />

          <OverviewCard
            value={
              jobs.filter(
                (job) =>
                  normalizeRequestStatus(job.status) === "accepted"
              ).length
            }
            label="Accepted"
            color="#22C55E"
          />

          <OverviewCard
            value={
              jobs.filter(
                (job) =>
                  normalizeRequestStatus(job.status) === "in_progress"
              ).length
            }
            label="Active"
            color="#3B82F6"
          />
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filters}
        >
          <FilterButton
            label="All"
            active={filter === "all"}
            onPress={() => setFilter("all")}
          />

          <FilterButton
            label="Requested"
            active={filter === "requested"}
            onPress={() => setFilter("requested")}
          />

          <FilterButton
            label="Accepted"
            active={filter === "accepted"}
            onPress={() => setFilter("accepted")}
          />

          <FilterButton
            label="In Progress"
            active={filter === "in_progress"}
            onPress={() => setFilter("in_progress")}
          />
        </ScrollView>

        <View style={styles.listHeader}>
          <Text style={styles.sectionTitle}>Job Schedule</Text>

          <Text style={styles.resultCount}>
            {filteredJobs.length} job
            {filteredJobs.length !== 1 ? "s" : ""}
          </Text>
        </View>

        <View style={styles.jobsList}>
          {filteredJobs.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              updating={updatingId === job.id}
              onAccept={() =>
                handleStatusUpdate(job.id, "accepted")
              }
              onReject={() =>
                handleStatusUpdate(job.id, "rejected")
              }
              onStart={() =>
                handleStatusUpdate(job.id, "in_progress")
              }
            />
          ))}
        </View>

        {filteredJobs.length === 0 && (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIcon}>
              <CheckCircle2 size={38} color="#22C55E" />
            </View>

            <Text style={styles.emptyTitle}>No Jobs Here</Text>

            <Text style={styles.emptyText}>
              There are currently no jobs matching this status.
            </Text>
          </View>
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

function OverviewCard({
  value,
  label,
  color,
}: {
  value: number;
  label: string;
  color: string;
}) {
  return (
    <View style={styles.overviewCard}>
      <Text style={[styles.overviewValue, { color }]}>{value}</Text>
      <Text style={styles.overviewLabel}>{label}</Text>
    </View>
  );
}

function FilterButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.filterButton,
        active && styles.filterButtonActive,
      ]}
      activeOpacity={0.8}
      onPress={onPress}
    >
      <Text
        style={[
          styles.filterText,
          active && styles.filterTextActive,
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function JobCard({
  job,
  updating,
  onAccept,
  onReject,
  onStart,
}: {
  job: ServiceRequest;
  updating: boolean;
  onAccept: () => void;
  onReject: () => void;
  onStart: () => void;
}) {
  const status = getStatusUi(job.status);
  const priority = getPriorityUi(job.priority);
  const normalizedStatus = normalizeRequestStatus(job.status);
  const openJob = () =>
    router.push({
      pathname: "/technician/job-details",
      params: { id: job.id },
    });

  return (
    <View style={styles.jobCard}>
      <TouchableOpacity activeOpacity={0.8} onPress={openJob}>
        <View style={styles.jobTopRow}>
          <View style={styles.timeColumn}>
            <Clock3 size={16} color="#F59E0B" />
            <Text style={styles.jobTime}>
              {getRequestTimeLabel(job)}
            </Text>
          </View>

          <View style={styles.jobMainInfo}>
            <Text style={styles.serviceName} numberOfLines={1}>
              {getRequestDisplayTitle(job)}
            </Text>

            <Text style={styles.jobId}>{job.id}</Text>
          </View>

          <View
            style={[
              styles.priorityBadge,
              {
                backgroundColor: `${priority.color}15`,
                borderColor: `${priority.color}40`,
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

        <View style={styles.divider} />

        <InfoRow
          icon={<UserRound size={16} color="#64748B" />}
          label="Customer"
          value={job.customerName || "Customer"}
        />

        <InfoRow
          icon={<MapPin size={16} color="#64748B" />}
          label="Location"
          value={job.address || "Address not provided"}
        />

        <View style={styles.statusRow}>
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

            <Text
              style={[
                styles.statusText,
                { color: status.color },
              ]}
            >
              {status.label}
            </Text>
          </View>
        </View>
      </TouchableOpacity>

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.viewButton}
          activeOpacity={0.8}
          onPress={openJob}
        >
          <Text style={styles.viewButtonText}>View Details</Text>
        </TouchableOpacity>

        {normalizedStatus === "requested" && (
          <>
            <TouchableOpacity
              style={styles.rejectButton}
              activeOpacity={0.85}
              onPress={onReject}
              disabled={updating}
            >
              <Text style={styles.rejectButtonText}>
                Reject
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.acceptButton}
              activeOpacity={0.85}
              onPress={onAccept}
              disabled={updating}
            >
              <CheckCircle2 size={17} color="#FFFFFF" />
              <Text style={styles.acceptButtonText}>
                Accept
              </Text>
            </TouchableOpacity>
          </>
        )}

        {normalizedStatus === "accepted" && (
          <TouchableOpacity
            style={styles.startButton}
            activeOpacity={0.85}
            onPress={onStart}
            disabled={updating}
          >
            <Wrench size={17} color="#FFFFFF" />
            <Text style={styles.startButtonText}>Start Job</Text>
          </TouchableOpacity>
        )}

        {normalizedStatus === "in_progress" && (
          <TouchableOpacity
            style={styles.continueButton}
            activeOpacity={0.85}
            onPress={() =>
              router.push({
                pathname: "/technician/job-action",
                params: { id: job.id },
              })
            }
          >
            <Text style={styles.continueButtonText}>
              Continue Job
            </Text>
          </TouchableOpacity>
        )}
      </View>
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
      {icon}
      <View style={styles.infoContent}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue} numberOfLines={1}>
          {value}
        </Text>
      </View>
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
  stateTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "800",
    marginTop: 12,
  },
  stateText: {
    color: "#94A3B8",
    fontSize: 12,
    marginTop: 8,
    textAlign: "center",
  },
  content: {
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    paddingHorizontal: 18,
    paddingTop: 54,
    paddingBottom: 120,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 23,
  },
  title: { color: "#FFFFFF", fontSize: 27, fontWeight: "800" },
  subtitle: { color: "#64748B", fontSize: 11, marginTop: 4 },
  totalBadge: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: "rgba(34,197,94,0.08)",
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.20)",
    alignItems: "center",
    justifyContent: "center",
  },
  totalValue: { color: "#22C55E", fontSize: 18, fontWeight: "800" },
  totalLabel: { color: "#64748B", fontSize: 8, marginTop: 1 },
  overviewRow: { flexDirection: "row", gap: 9, marginBottom: 22 },
  overviewCard: {
    flex: 1,
    minHeight: 80,
    borderRadius: 15,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    alignItems: "center",
    justifyContent: "center",
  },
  overviewValue: { fontSize: 22, fontWeight: "800" },
  overviewLabel: { color: "#94A3B8", fontSize: 9, marginTop: 4 },
  filters: { gap: 8, paddingBottom: 24 },
  filterButton: {
    height: 38,
    paddingHorizontal: 15,
    borderRadius: 10,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#1E2D42",
    alignItems: "center",
    justifyContent: "center",
  },
  filterButtonActive: {
    backgroundColor: "#15803D",
    borderColor: "#22C55E",
  },
  filterText: { color: "#94A3B8", fontSize: 10, fontWeight: "600" },
  filterTextActive: { color: "#FFFFFF" },
  listHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sectionTitle: { color: "#F8FAFC", fontSize: 14, fontWeight: "800" },
  resultCount: { color: "#64748B", fontSize: 9 },
  jobsList: { gap: 13 },
  jobCard: {
    borderRadius: 18,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    padding: 15,
  },
  jobTopRow: { flexDirection: "row", alignItems: "center" },
  timeColumn: { width: 65, alignItems: "center", marginRight: 8 },
  jobTime: {
    color: "#F59E0B",
    fontSize: 9,
    fontWeight: "700",
    marginTop: 5,
    textAlign: "center",
  },
  jobMainInfo: { flex: 1 },
  serviceName: { color: "#F8FAFC", fontSize: 14, fontWeight: "700" },
  jobId: { color: "#475569", fontSize: 8, marginTop: 4 },
  priorityBadge: {
    minHeight: 27,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  priorityText: { fontSize: 8, fontWeight: "700" },
  divider: {
    height: 1,
    backgroundColor: "#17263A",
    marginVertical: 13,
  },
  infoRow: { flexDirection: "row", alignItems: "center", minHeight: 44 },
  infoContent: { flex: 1, marginLeft: 9 },
  infoLabel: { color: "#475569", fontSize: 8 },
  infoValue: {
    color: "#CBD5E1",
    fontSize: 10,
    fontWeight: "600",
    marginTop: 2,
  },
  statusRow: { flexDirection: "row", marginTop: 7 },
  statusBadge: {
    minHeight: 28,
    borderRadius: 9,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 9,
  },
  statusDot: { width: 6, height: 6, borderRadius: 6, marginRight: 6 },
  statusText: { fontSize: 8, fontWeight: "700" },
  actions: { flexDirection: "row", gap: 9, marginTop: 14 },
  viewButton: {
    flex: 1,
    height: 44,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#273750",
    alignItems: "center",
    justifyContent: "center",
  },
  viewButtonText: { color: "#CBD5E1", fontSize: 10, fontWeight: "700" },
  acceptButton: {
    flex: 1,
    height: 44,
    borderRadius: 11,
    backgroundColor: "#15803D",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  acceptButtonText: { color: "#FFFFFF", fontSize: 10, fontWeight: "700" },
  rejectButton: {
    flex: 1,
    height: 44,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.24)",
    alignItems: "center",
    justifyContent: "center",
  },
  rejectButtonText: { color: "#EF4444", fontSize: 10, fontWeight: "700" },
  startButton: {
    flex: 1,
    height: 44,
    borderRadius: 11,
    backgroundColor: "#15803D",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  startButtonText: { color: "#FFFFFF", fontSize: 10, fontWeight: "700" },
  continueButton: {
    flex: 1,
    height: 44,
    borderRadius: 11,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
  },
  continueButtonText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "700",
  },
  emptyCard: {
    minHeight: 270,
    borderRadius: 18,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 30,
  },
  emptyIcon: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: "rgba(34,197,94,0.07)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  emptyTitle: { color: "#FFFFFF", fontSize: 17, fontWeight: "800" },
  emptyText: {
    color: "#64748B",
    fontSize: 10,
    lineHeight: 17,
    textAlign: "center",
    marginTop: 6,
  },
});
