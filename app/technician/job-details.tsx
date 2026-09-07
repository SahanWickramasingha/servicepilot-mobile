import { router, useLocalSearchParams } from "expo-router";
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
  Alert,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

export default function TechnicianJobDetailsScreen() {
  const params = useLocalSearchParams<{
    id?: string;
  }>();

  const jobId = params.id ?? "REQ-2026-0012";

  const job = {
    id: jobId,
    service: "AC Repair",
    priority: "High",
    status: "Accepted",
    date: "20 May 2026",
    time: "10:00 AM",

    customer: {
      name: "Emma Johnson",
      phone: "+94 71 234 5678",
    },

    location: "123, Main Street, Colombo 07",

    description:
      "The air conditioner is not cooling properly and makes an unusual noise. Please inspect the gas level, filters and outdoor unit.",
  };

  const handleCallCustomer = () => {
    Alert.alert(
      "Call Customer",
      `Call ${job.customer.name} at ${job.customer.phone}`
    );
  };

  const handleNavigate = () => {
    /*
      Real Google Maps navigation will be connected later.
    */

    Alert.alert(
      "Navigation",
      "Google Maps navigation will be connected in the Maps phase."
    );
  };

  const handleStartJob = () => {
    /*
      Later:
      status Accepted -> In Progress
      jobEvents record
      timestamp
      notification
    */

    router.push({
      pathname: "/technician/job-action",
      params: {
        id: job.id,
      },
    });
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
              Job Details
            </Text>

            <Text style={styles.jobId}>
              {job.id}
            </Text>
          </View>

          <View style={styles.statusBadge}>
            <View style={styles.statusDot} />

            <Text style={styles.statusText}>
              {job.status}
            </Text>
          </View>
        </View>

        {/* Service */}

        <View style={styles.serviceCard}>
          <View style={styles.serviceIcon}>
            <Wrench
              size={27}
              color="#60A5FA"
            />
          </View>

          <View style={styles.serviceContent}>
            <Text style={styles.smallLabel}>
              Service
            </Text>

            <Text style={styles.serviceName}>
              {job.service}
            </Text>
          </View>

          <View style={styles.priorityBadge}>
            <Text style={styles.priorityText}>
              {job.priority}
            </Text>
          </View>
        </View>

        {/* Schedule */}

        <Text style={styles.sectionTitle}>
          Schedule
        </Text>

        <View style={styles.scheduleRow}>
          <View style={styles.scheduleCard}>
            <CalendarDays
              size={20}
              color="#60A5FA"
            />

            <Text style={styles.scheduleLabel}>
              Date
            </Text>

            <Text style={styles.scheduleValue}>
              {job.date}
            </Text>
          </View>

          <View style={styles.scheduleCard}>
            <Clock3
              size={20}
              color="#A78BFA"
            />

            <Text style={styles.scheduleLabel}>
              Time
            </Text>

            <Text style={styles.scheduleValue}>
              {job.time}
            </Text>
          </View>
        </View>

        {/* Customer */}

        <Text style={styles.sectionTitle}>
          Customer
        </Text>

        <View style={styles.customerCard}>
          <View style={styles.avatar}>
            <UserRound
              size={27}
              color="#FFFFFF"
            />
          </View>

          <View style={styles.customerContent}>
            <Text style={styles.customerName}>
              {job.customer.name}
            </Text>

            <Text style={styles.customerPhone}>
              {job.customer.phone}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.callButton}
            activeOpacity={0.8}
            onPress={handleCallCustomer}
          >
            <Phone
              size={19}
              color="#22C55E"
            />
          </TouchableOpacity>
        </View>

        {/* Location */}

        <Text style={styles.sectionTitle}>
          Service Location
        </Text>

        <View style={styles.locationCard}>
          <View style={styles.locationIcon}>
            <MapPin
              size={21}
              color="#3B82F6"
            />
          </View>

          <View style={styles.locationContent}>
            <Text style={styles.locationLabel}>
              Address
            </Text>

            <Text style={styles.locationValue}>
              {job.location}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.navigateButton}
          activeOpacity={0.85}
          onPress={handleNavigate}
        >
          <Navigation
            size={18}
            color="#FFFFFF"
          />

          <Text style={styles.navigateText}>
            Navigate to Customer
          </Text>
        </TouchableOpacity>

        {/* Instructions */}

        <Text style={styles.sectionTitle}>
          Service Instructions
        </Text>

        <View style={styles.instructionsCard}>
          <Text style={styles.instructionsText}>
            {job.description}
          </Text>
        </View>

        {/* Evidence */}

        <Text style={styles.sectionTitle}>
          Required Service Evidence
        </Text>

        <View style={styles.evidenceCard}>
          <EvidenceItem
            title="Before Service Photos"
            description="Capture condition before starting work."
          />

          <View style={styles.divider} />

          <EvidenceItem
            title="Service Notes"
            description="Record work completed and important findings."
          />

          <View style={styles.divider} />

          <EvidenceItem
            title="After Service Photos"
            description="Capture completed service evidence."
          />

          <View style={styles.divider} />

          <EvidenceItem
            title="Customer Signature"
            description="Required before job completion."
          />
        </View>

        {/* Important notice */}

        <View style={styles.noticeCard}>
          <CheckCircle2
            size={18}
            color="#22C55E"
          />

          <Text style={styles.noticeText}>
            Check the customer location and service instructions before
            starting this job.
          </Text>
        </View>

        {/* Start */}

        <TouchableOpacity
          style={styles.startButton}
          activeOpacity={0.85}
          onPress={handleStartJob}
        >
          <Wrench
            size={19}
            color="#FFFFFF"
          />

          <Text style={styles.startButtonText}>
            Start Service
          </Text>
        </TouchableOpacity>

        {/* Reject */}

        <TouchableOpacity
          style={styles.rejectButton}
          activeOpacity={0.8}
          onPress={() =>
            Alert.alert(
              "Reject Job",
              "A rejection reason will be required when the backend workflow is connected."
            )
          }
        >
          <Text style={styles.rejectText}>
            Reject / Report Issue
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function EvidenceItem({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <View style={styles.evidenceItem}>
      <View style={styles.evidenceDot} />

      <View style={styles.evidenceContent}>
        <Text style={styles.evidenceTitle}>
          {title}
        </Text>

        <Text style={styles.evidenceDescription}>
          {description}
        </Text>
      </View>
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

  jobId: {
    color: "#64748B",
    fontSize: 10,
    marginTop: 3,
  },

  statusBadge: {
    minHeight: 30,
    borderRadius: 9,
    backgroundColor: "rgba(34,197,94,0.08)",
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.22)",
    paddingHorizontal: 9,
    flexDirection: "row",
    alignItems: "center",
  },

  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 6,
    backgroundColor: "#22C55E",
    marginRight: 6,
  },

  statusText: {
    color: "#22C55E",
    fontSize: 8,
    fontWeight: "700",
  },

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

  serviceContent: {
    flex: 1,
  },

  smallLabel: {
    color: "#64748B",
    fontSize: 8,
  },

  serviceName: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "800",
    marginTop: 3,
  },

  priorityBadge: {
    height: 28,
    borderRadius: 9,
    backgroundColor: "rgba(249,115,22,0.08)",
    borderWidth: 1,
    borderColor: "rgba(249,115,22,0.25)",
    justifyContent: "center",
    paddingHorizontal: 9,
  },

  priorityText: {
    color: "#F97316",
    fontSize: 8,
    fontWeight: "700",
  },

  sectionTitle: {
    color: "#F8FAFC",
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 10,
    marginLeft: 2,
  },

  scheduleRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 24,
  },

  scheduleCard: {
    flex: 1,
    minHeight: 94,
    borderRadius: 15,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    padding: 14,
  },

  scheduleLabel: {
    color: "#64748B",
    fontSize: 8,
    marginTop: 9,
  },

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

  customerContent: {
    flex: 1,
  },

  customerName: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },

  customerPhone: {
    color: "#64748B",
    fontSize: 9,
    marginTop: 4,
  },

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

  locationContent: {
    flex: 1,
  },

  locationLabel: {
    color: "#64748B",
    fontSize: 8,
  },

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

  navigateText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
  },

  instructionsCard: {
    minHeight: 125,
    borderRadius: 16,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    padding: 15,
    marginBottom: 24,
  },

  instructionsText: {
    color: "#CBD5E1",
    fontSize: 11,
    lineHeight: 19,
  },

  evidenceCard: {
    borderRadius: 17,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    paddingHorizontal: 14,
    marginBottom: 18,
  },

  evidenceItem: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
  },

  evidenceDot: {
    width: 9,
    height: 9,
    borderRadius: 9,
    backgroundColor: "#22C55E",
    marginRight: 12,
  },

  evidenceContent: {
    flex: 1,
  },

  evidenceTitle: {
    color: "#E2E8F0",
    fontSize: 10,
    fontWeight: "700",
  },

  evidenceDescription: {
    color: "#64748B",
    fontSize: 8,
    lineHeight: 13,
    marginTop: 3,
  },

  divider: {
    height: 1,
    backgroundColor: "#17263A",
    marginLeft: 21,
  },

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

  startButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },

  rejectButton: {
    height: 51,
    borderRadius: 12,
    backgroundColor: "rgba(239,68,68,0.05)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.20)",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
  },

  rejectText: {
    color: "#EF4444",
    fontSize: 11,
    fontWeight: "700",
  },
});
