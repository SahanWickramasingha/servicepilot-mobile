import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  CheckCircle2,
  ClipboardCheck,
  RefreshCw,
  UserRound,
  XCircle,
} from "lucide-react-native";

import { auth } from "@/src/firebase/config";
import {
  getPendingTechnicians,
  updateTechnicianApprovalStatus,
  UserProfile,
} from "@/src/services/user.service";

export default function DispatcherDashboard() {
  const [technicians, setTechnicians] = useState<
    UserProfile[]
  >([]);
  const [selectedTechnician, setSelectedTechnician] =
    useState<UserProfile | null>(null);
  const [rejectionReason, setRejectionReason] =
    useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadPendingTechnicians = async () => {
    try {
      setLoading(true);
      const pendingTechnicians =
        await getPendingTechnicians();
      setTechnicians(pendingTechnicians);
      setSelectedTechnician((current) =>
        current &&
        pendingTechnicians.some(
          (item) => item.uid === current.uid
        )
          ? current
          : pendingTechnicians[0] ?? null
      );
    } catch (error) {
      console.error(
        "Load pending technicians error:",
        error
      );
      Alert.alert(
        "Unable to Load",
        "Pending technicians could not be loaded."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPendingTechnicians();
  }, []);

  const handleApproval = async (
    status: "approved" | "rejected"
  ) => {
    const dispatcherUid = auth.currentUser?.uid;

    if (!dispatcherUid || !selectedTechnician) {
      return;
    }

    if (
      status === "rejected" &&
      !rejectionReason.trim()
    ) {
      Alert.alert(
        "Reason Required",
        "Please add a safe rejection reason."
      );
      return;
    }

    try {
      setSaving(true);

      await updateTechnicianApprovalStatus({
        technicianUid: selectedTechnician.uid,
        dispatcherUid,
        status,
        rejectionReason,
      });

      setRejectionReason("");
      await loadPendingTechnicians();

      Alert.alert(
        status === "approved"
          ? "Technician Approved"
          : "Technician Rejected",
        status === "approved"
          ? "The technician can now sign in."
          : "The technician has been notified through their login status."
      );
    } catch (error) {
      console.error(
        "Technician review error:",
        error
      );
      Alert.alert(
        "Review Failed",
        "Unable to update this technician review."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar
        barStyle="light-content"
        backgroundColor="#06101D"
      />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.pageTitle}>
              Dispatcher
            </Text>
            <Text style={styles.pageSubtitle}>
              Review pending technician registrations
            </Text>
          </View>

          <TouchableOpacity
            style={styles.iconButton}
            activeOpacity={0.8}
            onPress={loadPendingTechnicians}
            disabled={loading}
          >
            <RefreshCw
              size={20}
              color="#FFFFFF"
            />
          </TouchableOpacity>
        </View>

        <View style={styles.summaryCard}>
          <View style={styles.summaryIcon}>
            <ClipboardCheck
              size={28}
              color="#F59E0B"
            />
          </View>

          <View>
            <Text style={styles.summaryValue}>
              {technicians.length}
            </Text>
            <Text style={styles.summaryLabel}>
              Pending Technicians
            </Text>
          </View>
        </View>

        {loading ? (
          <View style={styles.loadingArea}>
            <ActivityIndicator color="#3B82F6" />
          </View>
        ) : technicians.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>
              No Pending Reviews
            </Text>
            <Text style={styles.emptyText}>
              Technician registrations awaiting approval
              will appear here.
            </Text>
          </View>
        ) : (
          <>
            <Text style={styles.sectionTitle}>
              Pending Technicians
            </Text>

            <View style={styles.listCard}>
              {technicians.map((technician) => (
                <TouchableOpacity
                  key={technician.uid}
                  style={[
                    styles.technicianRow,
                    selectedTechnician?.uid ===
                      technician.uid &&
                      styles.technicianRowActive,
                  ]}
                  activeOpacity={0.8}
                  onPress={() =>
                    setSelectedTechnician(technician)
                  }
                >
                  <View style={styles.avatar}>
                    <UserRound
                      size={21}
                      color="#FFFFFF"
                    />
                  </View>

                  <View style={styles.technicianInfo}>
                    <Text style={styles.technicianName}>
                      {technician.fullName}
                    </Text>
                    <Text style={styles.technicianEmail}>
                      {technician.email}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>

            {selectedTechnician && (
              <>
                <Text style={styles.sectionTitle}>
                  Technician Details
                </Text>

                <View style={styles.detailCard}>
                  <DetailRow
                    label="Full Name"
                    value={selectedTechnician.fullName}
                  />
                  <DetailRow
                    label="Email"
                    value={selectedTechnician.email}
                  />
                  <DetailRow
                    label="Phone"
                    value={selectedTechnician.phone}
                  />
                  <DetailRow
                    label="Address"
                    value={selectedTechnician.address}
                  />
                  <DetailRow
                    label="Specialization"
                    value={
                      selectedTechnician.specialization
                    }
                  />
                  <DetailRow
                    label="Experience"
                    value={
                      selectedTechnician.experience
                    }
                  />
                  <DetailRow
                    label="Qualifications"
                    value={
                      selectedTechnician.qualifications
                    }
                  />
                  <DetailRow
                    label="Certifications"
                    value={
                      selectedTechnician.certifications
                    }
                  />
                  <DetailRow
                    label="Service Area"
                    value={
                      selectedTechnician.serviceAreas
                    }
                  />
                  <DetailRow
                    label="Email Status"
                    value={
                      selectedTechnician.emailVerified
                        ? "Verified"
                        : "Not verified"
                    }
                  />
                  <DetailRow
                    label="Approval"
                    value={
                      selectedTechnician.technicianApprovalStatus ??
                      "pending"
                    }
                  />

                  <TextInput
                    value={rejectionReason}
                    onChangeText={setRejectionReason}
                    placeholder="Safe rejection reason"
                    placeholderTextColor="#64748B"
                    style={styles.reasonInput}
                    editable={!saving}
                    multiline
                  />

                  <View style={styles.actionRow}>
                    <TouchableOpacity
                      style={[
                        styles.actionButton,
                        styles.rejectButton,
                        saving &&
                          styles.actionButtonDisabled,
                      ]}
                      activeOpacity={0.85}
                      onPress={() =>
                        handleApproval("rejected")
                      }
                      disabled={saving}
                    >
                      <XCircle
                        size={18}
                        color="#FFFFFF"
                      />
                      <Text style={styles.actionText}>
                        Reject
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.actionButton,
                        styles.approveButton,
                        saving &&
                          styles.actionButtonDisabled,
                      ]}
                      activeOpacity={0.85}
                      onPress={() =>
                        handleApproval("approved")
                      }
                      disabled={saving}
                    >
                      <CheckCircle2
                        size={18}
                        color="#FFFFFF"
                      />
                      <Text style={styles.actionText}>
                        Approve
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value?: string;
}) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>
        {value || "Not provided"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#06101D",
  },

  content: {
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
    paddingHorizontal: 20,
    paddingTop: 58,
    paddingBottom: 44,
  },

  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 22,
  },

  pageTitle: {
    color: "#FFFFFF",
    fontSize: 29,
    fontWeight: "800",
  },

  pageSubtitle: {
    color: "#64748B",
    fontSize: 12,
    marginTop: 4,
  },

  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    alignItems: "center",
    justifyContent: "center",
  },

  summaryCard: {
    minHeight: 84,
    borderRadius: 18,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    marginBottom: 24,
  },

  summaryIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: "rgba(245, 158, 11, 0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },

  summaryValue: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "800",
  },

  summaryLabel: {
    color: "#94A3B8",
    fontSize: 12,
    marginTop: 2,
  },

  sectionTitle: {
    color: "#F8FAFC",
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 10,
    marginLeft: 2,
  },

  loadingArea: {
    minHeight: 180,
    alignItems: "center",
    justifyContent: "center",
  },

  emptyCard: {
    borderRadius: 18,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    padding: 22,
    alignItems: "center",
  },

  emptyTitle: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "800",
  },

  emptyText: {
    color: "#94A3B8",
    fontSize: 12,
    lineHeight: 19,
    textAlign: "center",
    marginTop: 8,
  },

  listCard: {
    borderRadius: 17,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    overflow: "hidden",
    marginBottom: 24,
  },

  technicianRow: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#17263A",
  },

  technicianRowActive: {
    backgroundColor: "rgba(37, 99, 235, 0.11)",
  },

  avatar: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },

  technicianInfo: {
    flex: 1,
  },

  technicianName: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },

  technicianEmail: {
    color: "#94A3B8",
    fontSize: 11,
    marginTop: 4,
  },

  detailCard: {
    borderRadius: 17,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    padding: 16,
  },

  detailRow: {
    paddingVertical: 9,
  },

  detailLabel: {
    color: "#64748B",
    fontSize: 11,
  },

  detailValue: {
    color: "#E2E8F0",
    fontSize: 13,
    fontWeight: "600",
    marginTop: 4,
  },

  reasonInput: {
    minHeight: 88,
    borderRadius: 12,
    backgroundColor: "#081523",
    borderWidth: 1,
    borderColor: "#1E2D42",
    color: "#FFFFFF",
    fontSize: 13,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 12,
    textAlignVertical: "top",
  },

  actionRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },

  actionButton: {
    flex: 1,
    height: 50,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },

  rejectButton: {
    backgroundColor: "#DC2626",
  },

  approveButton: {
    backgroundColor: "#16A34A",
  },

  actionButtonDisabled: {
    opacity: 0.65,
  },

  actionText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },
});
