import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Camera,
  Check,
  CheckCircle2,
  Clock3,
  FileText,
  Pause,
  Play,
  Signature,
  Wrench,
} from "lucide-react-native";
import {
  Alert,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

export default function TechnicianJobActionScreen() {
  const params = useLocalSearchParams<{
    id?: string;
  }>();

  const jobId = params.id ?? "REQ-2026-0012";

  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(true);

  // UI mock completion states
  const [beforeDone] = useState(false);
  const [notesDone] = useState(false);
  const [afterDone] = useState(false);
  const [signatureDone] = useState(false);

  useEffect(() => {
    if (!running) {
      return;
    }

    const timer = setInterval(() => {
      setSeconds((current) => current + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [running]);

  const formatTime = (totalSeconds: number) => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor(
      (totalSeconds % 3600) / 60
    );
    const secs = totalSeconds % 60;

    return `${hours
      .toString()
      .padStart(2, "0")}:${minutes
      .toString()
      .padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  };

  const handleCompleteJob = () => {
    Alert.alert(
      "Complete Job",
      "Before photos, service notes, after photos and customer signature must be completed before closing the job."
    );
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
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            activeOpacity={0.8}
            onPress={() => router.back()}
          >
            <ArrowLeft
              size={20}
              color="#FFFFFF"
            />
          </TouchableOpacity>

          <View style={styles.headerContent}>
            <Text style={styles.title}>
              Active Service
            </Text>

            <Text style={styles.requestId}>
              {jobId}
            </Text>
          </View>

          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />

            <Text style={styles.liveText}>
              LIVE
            </Text>
          </View>
        </View>

        {/* Service */}
        <View style={styles.serviceCard}>
          <View style={styles.serviceIcon}>
            <Wrench
              size={28}
              color="#60A5FA"
            />
          </View>

          <View style={styles.serviceContent}>
            <Text style={styles.serviceLabel}>
              Current Service
            </Text>

            <Text style={styles.serviceName}>
              AC Repair
            </Text>

            <Text style={styles.customerName}>
              Emma Johnson
            </Text>
          </View>

          <View style={styles.statusBadge}>
            <Text style={styles.statusText}>
              In Progress
            </Text>
          </View>
        </View>

        {/* Timer */}
        <View style={styles.timerCard}>
          <View style={styles.timerIcon}>
            <Clock3
              size={28}
              color="#22C55E"
            />
          </View>

          <Text style={styles.timerLabel}>
            Service Duration
          </Text>

          <Text style={styles.timerValue}>
            {formatTime(seconds)}
          </Text>

          <Text style={styles.timerStatus}>
            {running
              ? "Service timer is running"
              : "Service timer paused"}
          </Text>

          <TouchableOpacity
            style={[
              styles.timerButton,
              !running && styles.resumeButton,
            ]}
            activeOpacity={0.85}
            onPress={() =>
              setRunning((current) => !current)
            }
          >
            {running ? (
              <Pause
                size={18}
                color="#FFFFFF"
              />
            ) : (
              <Play
                size={18}
                color="#FFFFFF"
                fill="#FFFFFF"
              />
            )}

            <Text style={styles.timerButtonText}>
              {running
                ? "Pause Service"
                : "Resume Service"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Progress */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            Service Progress
          </Text>

          <Text style={styles.progressText}>
            0 / 4 Complete
          </Text>
        </View>

        <View style={styles.progressBar}>
          <View style={styles.progressFill} />
        </View>

        {/* Actions */}
        <View style={styles.actionsList}>
          <ActionCard
            icon={
              <Camera
                size={22}
                color="#60A5FA"
              />
            }
            title="Before Service Photos"
            description="Capture photos before starting repairs."
            completed={beforeDone}
            required
            onPress={() =>
              router.push({
                pathname:
                  "/technician/before-photos",
                params: {
                  id: jobId,
                },
              })
            }
          />

          <ActionCard
            icon={
              <FileText
                size={22}
                color="#A78BFA"
              />
            }
            title="Service Notes"
            description="Record diagnostics, repairs and parts used."
            completed={notesDone}
            required
            onPress={() =>
              router.push({
                pathname:
                  "/technician/service-notes",
                params: {
                  id: jobId,
                },
              })
            }
          />

          <ActionCard
            icon={
              <Camera
                size={22}
                color="#22C55E"
              />
            }
            title="After Service Photos"
            description="Capture photos after service completion."
            completed={afterDone}
            required
            onPress={() =>
              router.push({
                pathname:
                  "/technician/after-photos",
                params: {
                  id: jobId,
                },
              })
            }
          />

          <ActionCard
            icon={
              <Signature
                size={22}
                color="#F59E0B"
              />
            }
            title="Customer Signature"
            description="Get customer approval before completing."
            completed={signatureDone}
            required
            onPress={() =>
              router.push({
                pathname:
                  "/technician/signature",
                params: {
                  id: jobId,
                },
              })
            }
          />
        </View>

        {/* Checklist */}
        <Text style={styles.sectionTitle}>
          Completion Checklist
        </Text>

        <View style={styles.checklistCard}>
          <ChecklistItem
            label="Before service evidence"
            completed={beforeDone}
          />

          <View style={styles.divider} />

          <ChecklistItem
            label="Service notes completed"
            completed={notesDone}
          />

          <View style={styles.divider} />

          <ChecklistItem
            label="After service evidence"
            completed={afterDone}
          />

          <View style={styles.divider} />

          <ChecklistItem
            label="Customer signature"
            completed={signatureDone}
          />
        </View>

        {/* Notice */}
        <View style={styles.noticeCard}>
          <CheckCircle2
            size={18}
            color="#F59E0B"
          />

          <Text style={styles.noticeText}>
            Complete all required service evidence before marking this
            job as completed.
          </Text>
        </View>

        {/* Complete */}
        <TouchableOpacity
          style={styles.completeButton}
          activeOpacity={0.85}
          onPress={handleCompleteJob}
        >
          <CheckCircle2
            size={19}
            color="#FFFFFF"
          />

          <Text style={styles.completeButtonText}>
            Complete Job
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function ActionCard({
  icon,
  title,
  description,
  completed,
  required,
  onPress,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  completed: boolean;
  required?: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.actionCard}
      activeOpacity={0.8}
      onPress={onPress}
    >
      <View style={styles.actionIcon}>
        {icon}
      </View>

      <View style={styles.actionContent}>
        <View style={styles.actionTitleRow}>
          <Text style={styles.actionTitle}>
            {title}
          </Text>

          {required && (
            <Text style={styles.requiredText}>
              Required
            </Text>
          )}
        </View>

        <Text style={styles.actionDescription}>
          {description}
        </Text>
      </View>

      <View
        style={[
          styles.actionStatus,
          completed &&
            styles.actionStatusCompleted,
        ]}
      >
        {completed ? (
          <Check
            size={17}
            color="#FFFFFF"
          />
        ) : (
          <Text style={styles.actionArrow}>
            ›
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

function ChecklistItem({
  label,
  completed,
}: {
  label: string;
  completed: boolean;
}) {
  return (
    <View style={styles.checklistItem}>
      <View
        style={[
          styles.checkbox,
          completed &&
            styles.checkboxCompleted,
        ]}
      >
        {completed && (
          <Check
            size={13}
            color="#FFFFFF"
          />
        )}
      </View>

      <Text
        style={[
          styles.checklistText,
          completed &&
            styles.checklistCompletedText,
        ]}
      >
        {label}
      </Text>

      <Text
        style={[
          styles.checklistStatus,
          completed &&
            styles.checklistStatusDone,
        ]}
      >
        {completed ? "Done" : "Pending"}
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
    maxWidth: 520,
    alignSelf: "center",
    paddingHorizontal: 18,
    paddingTop: 54,
    paddingBottom: 70,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 24,
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
    marginRight: 13,
  },

  headerContent: {
    flex: 1,
  },

  title: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "800",
  },

  requestId: {
    color: "#64748B",
    fontSize: 9,
    marginTop: 3,
  },

  liveBadge: {
    minHeight: 29,
    borderRadius: 9,
    backgroundColor: "rgba(34,197,94,0.08)",
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.20)",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 9,
  },

  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 7,
    backgroundColor: "#22C55E",
    marginRight: 6,
  },

  liveText: {
    color: "#22C55E",
    fontSize: 8,
    fontWeight: "800",
  },

  serviceCard: {
    minHeight: 95,
    borderRadius: 18,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 15,
    marginBottom: 16,
  },

  serviceIcon: {
    width: 53,
    height: 53,
    borderRadius: 16,
    backgroundColor: "#101F30",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },

  serviceContent: {
    flex: 1,
  },

  serviceLabel: {
    color: "#64748B",
    fontSize: 8,
  },

  serviceName: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
    marginTop: 3,
  },

  customerName: {
    color: "#94A3B8",
    fontSize: 9,
    marginTop: 4,
  },

  statusBadge: {
    minHeight: 29,
    borderRadius: 9,
    backgroundColor: "rgba(59,130,246,0.08)",
    borderWidth: 1,
    borderColor: "rgba(59,130,246,0.22)",
    justifyContent: "center",
    paddingHorizontal: 8,
  },

  statusText: {
    color: "#3B82F6",
    fontSize: 8,
    fontWeight: "700",
  },

  timerCard: {
    borderRadius: 20,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 25,
    marginBottom: 26,
  },

  timerIcon: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "rgba(34,197,94,0.07)",
    alignItems: "center",
    justifyContent: "center",
  },

  timerLabel: {
    color: "#64748B",
    fontSize: 9,
    marginTop: 13,
  },

  timerValue: {
    color: "#FFFFFF",
    fontSize: 36,
    fontWeight: "800",
    letterSpacing: 2,
    marginTop: 5,
  },

  timerStatus: {
    color: "#22C55E",
    fontSize: 9,
    marginTop: 5,
  },

  timerButton: {
    minWidth: 175,
    height: 45,
    borderRadius: 11,
    backgroundColor: "#B45309",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    marginTop: 18,
  },

  resumeButton: {
    backgroundColor: "#15803D",
  },

  timerButtonText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "700",
  },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 9,
  },

  sectionTitle: {
    color: "#F8FAFC",
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 10,
  },

  progressText: {
    color: "#64748B",
    fontSize: 9,
  },

  progressBar: {
    height: 6,
    borderRadius: 10,
    backgroundColor: "#17263A",
    overflow: "hidden",
    marginBottom: 18,
  },

  progressFill: {
    width: "0%",
    height: "100%",
    backgroundColor: "#22C55E",
  },

  actionsList: {
    gap: 10,
    marginBottom: 26,
  },

  actionCard: {
    minHeight: 88,
    borderRadius: 16,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 13,
  },

  actionIcon: {
    width: 47,
    height: 47,
    borderRadius: 14,
    backgroundColor: "#101F30",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 11,
  },

  actionContent: {
    flex: 1,
  },

  actionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  actionTitle: {
    color: "#E2E8F0",
    fontSize: 11,
    fontWeight: "700",
  },

  requiredText: {
    color: "#F59E0B",
    fontSize: 7,
    fontWeight: "700",
  },

  actionDescription: {
    color: "#64748B",
    fontSize: 8,
    lineHeight: 13,
    marginTop: 4,
    paddingRight: 6,
  },

  actionStatus: {
    width: 31,
    height: 31,
    borderRadius: 10,
    backgroundColor: "#101F30",
    alignItems: "center",
    justifyContent: "center",
  },

  actionStatusCompleted: {
    backgroundColor: "#15803D",
  },

  actionArrow: {
    color: "#64748B",
    fontSize: 24,
    marginTop: -3,
  },

  checklistCard: {
    borderRadius: 17,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    paddingHorizontal: 14,
    marginBottom: 18,
  },

  checklistItem: {
    minHeight: 61,
    flexDirection: "row",
    alignItems: "center",
  },

  checkbox: {
    width: 23,
    height: 23,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "#334155",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },

  checkboxCompleted: {
    backgroundColor: "#15803D",
    borderColor: "#22C55E",
  },

  checklistText: {
    color: "#94A3B8",
    fontSize: 10,
    flex: 1,
  },

  checklistCompletedText: {
    color: "#E2E8F0",
  },

  checklistStatus: {
    color: "#F59E0B",
    fontSize: 8,
    fontWeight: "700",
  },

  checklistStatusDone: {
    color: "#22C55E",
  },

  divider: {
    height: 1,
    backgroundColor: "#17263A",
    marginLeft: 33,
  },

  noticeCard: {
    minHeight: 68,
    borderRadius: 14,
    backgroundColor: "rgba(245,158,11,0.05)",
    borderWidth: 1,
    borderColor: "rgba(245,158,11,0.17)",
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 13,
    marginBottom: 19,
  },

  noticeText: {
    color: "#94A3B8",
    fontSize: 9,
    lineHeight: 15,
    flex: 1,
    marginLeft: 9,
  },

  completeButton: {
    height: 56,
    borderRadius: 12,
    backgroundColor: "#15803D",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },

  completeButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
});