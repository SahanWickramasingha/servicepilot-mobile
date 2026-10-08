import { router } from "expo-router";
import { useMemo, useRef, useState } from "react";
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
  Modal,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { normalizeRequestStatus } from "@/src/constants/serviceRequests";
import { useTechnicianWorkspace } from "@/src/hooks/useTechnicianWorkspace";
import { availabilityDisplay } from "@/functions/src/domain/availability";
import { AvailabilityBadge } from "@/src/components/technicians/AvailabilityBadge";
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
  isRequestScheduledToday,
  sortRequestsBySchedule,
} from "@/src/utils/technicianRequests";

type FilterType =
  | "all"
  | "requested"
  | "accepted"
  | "in_progress";
type TechnicianActionStatus =
  | "accepted"
  | "rejected"
  | "in_progress"
  | "completed"
  | "cancelled";
type ReasonAction = "reject" | "cancel";

export default function TechnicianJobsScreen() {
  const { profile, requests, loading, errorMessage } = useTechnicianWorkspace();
  const canAccept = availabilityDisplay(profile?.availability).canRequest;
  const [filter, setFilter] = useState<FilterType>("all");
  const [updatingId, setUpdatingId] = useState("");
  const pendingActions = useRef(new Set<string>());
  const [reasonAction, setReasonAction] =
    useState<ReasonAction | null>(null);
  const [reasonRequest, setReasonRequest] =
    useState<ServiceRequest | null>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState("");

  const jobs = useMemo(
    () =>
      sortRequestsBySchedule(
        getActiveTechnicianRequests(requests).filter(
          isRequestScheduledToday
        )
      ),
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
    status: TechnicianActionStatus,
    actionReason?: string
  ): Promise<boolean> => {
    if (pendingActions.current.has(requestId)) return false;
    pendingActions.current.add(requestId);
    try {
      setUpdatingId(requestId);
      await updateTechnicianRequestStatus(requestId, status, {
        reason: actionReason,
      });
      return true;
    } catch (error: any) {
      Alert.alert(
        "Job Update Failed",
        error?.message ?? "Unable to update this job."
      );
      return false;
    } finally {
      pendingActions.current.delete(requestId);
      setUpdatingId("");
    }
  };

  const openReasonModal = (
    action: ReasonAction,
    request: ServiceRequest
  ) => {
    setReasonAction(action);
    setReasonRequest(request);
    setReason("");
    setReasonError("");
  };

  const closeReasonModal = () => {
    setReasonAction(null);
    setReasonRequest(null);
    setReason("");
    setReasonError("");
  };

  const submitReasonAction = async () => {
    const trimmedReason = reason.trim();

    if (!reasonRequest || !reasonAction) {
      return;
    }

    if (!trimmedReason) {
      setReasonError("Please enter a reason.");
      return;
    }

    const status =
      reasonAction === "reject" ? "rejected" : "cancelled";

    const succeeded = await handleStatusUpdate(
      reasonRequest.id,
      status,
      trimmedReason
    );

    if (succeeded) {
      closeReasonModal();
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

        <AvailabilityBadge availability={profile?.availability} showDescription />
        {!canAccept && <TouchableOpacity accessibilityRole="button" onPress={() => router.push("/technician")}>
          <Text style={styles.viewButtonText}>Set Available on your dashboard to accept requests. Existing jobs remain accessible.</Text>
        </TouchableOpacity>}
        <View style={styles.jobsList}>
          {filteredJobs.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              updating={updatingId === job.id}
              canAccept={canAccept}
              onAccept={() =>
                handleStatusUpdate(job.id, "accepted")
              }
              onReject={() =>
                openReasonModal("reject", job)
              }
              onStart={() =>
                handleStatusUpdate(job.id, "in_progress")
              }
              onCancel={() =>
                openReasonModal("cancel", job)
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

      <ReasonModal
        action={reasonAction}
        visible={Boolean(reasonAction && reasonRequest)}
        reason={reason}
        errorMessage={reasonError}
        submitting={Boolean(reasonRequest && updatingId === reasonRequest.id)}
        onChangeReason={(value) => {
          setReason(value);
          setReasonError("");
        }}
        onClose={closeReasonModal}
        onSubmit={submitReasonAction}
      />
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
  canAccept,
  onAccept,
  onReject,
  onStart,
  onCancel,
}: {
  job: ServiceRequest;
  updating: boolean;
  canAccept: boolean;
  onAccept: () => void;
  onReject: () => void;
  onStart: () => void;
  onCancel: () => void;
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
                Reject Request
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.acceptButton, !canAccept && { opacity: 0.45 }]}
              activeOpacity={0.85}
              onPress={onAccept}
              disabled={updating || !canAccept}
            >
              <CheckCircle2 size={17} color="#FFFFFF" />
              <Text style={styles.acceptButtonText}>
                Accept Request
              </Text>
            </TouchableOpacity>
          </>
        )}

        {normalizedStatus === "accepted" && (
          <>
            <TouchableOpacity
              style={styles.rejectButton}
              activeOpacity={0.85}
              onPress={onCancel}
              disabled={updating}
            >
              <Text style={styles.rejectButtonText}>
                Cancel Job
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.startButton}
              activeOpacity={0.85}
              onPress={onStart}
              disabled={updating}
            >
              <Wrench size={17} color="#FFFFFF" />
              <Text style={styles.startButtonText}>Start Job</Text>
            </TouchableOpacity>
          </>
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

function ReasonModal({
  action,
  visible,
  reason,
  errorMessage,
  submitting,
  onChangeReason,
  onClose,
  onSubmit,
}: {
  action: ReasonAction | null;
  visible: boolean;
  reason: string;
  errorMessage: string;
  submitting: boolean;
  onChangeReason: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const isReject = action === "reject";

  return (
    <Modal
      transparent
      animationType="fade"
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.reasonModal}>
          <Text style={styles.modalTitle}>
            {isReject ? "Reject Request" : "Cancel Job"}
          </Text>

          <Text style={styles.modalText}>
            {isReject
              ? "Enter the reason the customer request cannot be accepted."
              : "Enter the reason this accepted job must be cancelled."}
          </Text>

          <TextInput
            style={styles.reasonInput}
            value={reason}
            onChangeText={onChangeReason}
            placeholder="Reason"
            placeholderTextColor="#64748B"
            multiline
            textAlignVertical="top"
          />

          {errorMessage ? (
            <Text style={styles.reasonError}>{errorMessage}</Text>
          ) : null}

          <View style={styles.modalActions}>
            <TouchableOpacity
              style={styles.modalSecondaryButton}
              activeOpacity={0.85}
              onPress={onClose}
              disabled={submitting}
            >
              <Text style={styles.modalSecondaryText}>
                Keep Job
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.modalDangerButton}
              activeOpacity={0.85}
              onPress={onSubmit}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.modalDangerText}>
                  {isReject ? "Reject Request" : "Cancel Job"}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
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
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(2,6,23,0.78)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  reasonModal: {
    width: "100%",
    maxWidth: 460,
    borderRadius: 18,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#243247",
    padding: 18,
  },
  modalTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "800",
  },
  modalText: {
    color: "#94A3B8",
    fontSize: 11,
    lineHeight: 18,
    marginTop: 8,
  },
  reasonInput: {
    minHeight: 112,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#273750",
    backgroundColor: "#101F30",
    color: "#E2E8F0",
    fontSize: 12,
    lineHeight: 18,
    paddingHorizontal: 12,
    paddingVertical: 11,
    marginTop: 14,
  },
  reasonError: {
    color: "#FCA5A5",
    fontSize: 10,
    marginTop: 8,
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },
  modalSecondaryButton: {
    flex: 1,
    height: 46,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#273750",
    alignItems: "center",
    justifyContent: "center",
  },
  modalSecondaryText: {
    color: "#CBD5E1",
    fontSize: 11,
    fontWeight: "700",
  },
  modalDangerButton: {
    flex: 1,
    height: 46,
    borderRadius: 11,
    backgroundColor: "#DC2626",
    alignItems: "center",
    justifyContent: "center",
  },
  modalDangerText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
  },
});
