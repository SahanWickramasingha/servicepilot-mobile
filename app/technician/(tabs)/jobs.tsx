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
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

type JobStatus =
  | "pending"
  | "accepted"
  | "in_progress"
  | "upcoming";

type FilterType =
  | "all"
  | "pending"
  | "accepted"
  | "in_progress";

type Priority =
  | "Low"
  | "Medium"
  | "High"
  | "Emergency";

type JobItem = {
  id: string;
  time: string;
  service: string;
  customer: string;
  location: string;
  priority: Priority;
  status: JobStatus;
};

const initialJobs: JobItem[] = [
  {
    id: "REQ-2026-0012",
    time: "10:00 AM",
    service: "AC Repair",
    customer: "Emma Johnson",
    location: "Main Street, Colombo 07",
    priority: "High",
    status: "pending",
  },
  {
    id: "REQ-2026-0011",
    time: "12:30 PM",
    service: "Washing Machine Repair",
    customer: "Sarah Wilson",
    location: "Nawala Road, Nugegoda",
    priority: "Medium",
    status: "accepted",
  },
  {
    id: "REQ-2026-0010",
    time: "03:00 PM",
    service: "Electrical Installation",
    customer: "David Perera",
    location: "Galle Road, Colombo 03",
    priority: "Low",
    status: "in_progress",
  },
  {
    id: "REQ-2026-0009",
    time: "05:00 PM",
    service: "Refrigerator Repair",
    customer: "Nimal Fernando",
    location: "Dehiwala, Colombo",
    priority: "Medium",
    status: "upcoming",
  },
];

export default function TechnicianJobsScreen() {
  const [jobs, setJobs] =
    useState<JobItem[]>(initialJobs);

  const [filter, setFilter] =
    useState<FilterType>("all");

  const filteredJobs = useMemo(() => {
    if (filter === "all") {
      return jobs;
    }

    return jobs.filter(
      (job) => job.status === filter
    );
  }, [filter, jobs]);

  const handleAcceptJob = (jobId: string) => {
    setJobs((currentJobs) =>
      currentJobs.map((job) =>
        job.id === jobId
          ? {
              ...job,
              status: "accepted",
            }
          : job
      )
    );
  };

  const openJobDetails = (job: JobItem) => {
    router.push({
      pathname: "/technician/job-details",
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
          <View>
            <Text style={styles.title}>
              Today&apos;s Jobs
            </Text>

            <Text style={styles.subtitle}>
              Manage your assigned service jobs
            </Text>
          </View>

          <View style={styles.totalBadge}>
            <Text style={styles.totalValue}>
              {jobs.length}
            </Text>

            <Text style={styles.totalLabel}>
              Jobs
            </Text>
          </View>
        </View>

        {/* Overview */}
        <View style={styles.overviewRow}>
          <OverviewCard
            value={
              jobs.filter(
                (job) =>
                  job.status === "pending"
              ).length
            }
            label="Pending"
            color="#F59E0B"
          />

          <OverviewCard
            value={
              jobs.filter(
                (job) =>
                  job.status === "accepted"
              ).length
            }
            label="Accepted"
            color="#22C55E"
          />

          <OverviewCard
            value={
              jobs.filter(
                (job) =>
                  job.status ===
                  "in_progress"
              ).length
            }
            label="Active"
            color="#3B82F6"
          />
        </View>

        {/* Filters */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={
            styles.filters
          }
        >
          <FilterButton
            label="All"
            active={filter === "all"}
            onPress={() => setFilter("all")}
          />

          <FilterButton
            label="Pending"
            active={filter === "pending"}
            onPress={() =>
              setFilter("pending")
            }
          />

          <FilterButton
            label="Accepted"
            active={filter === "accepted"}
            onPress={() =>
              setFilter("accepted")
            }
          />

          <FilterButton
            label="In Progress"
            active={
              filter === "in_progress"
            }
            onPress={() =>
              setFilter("in_progress")
            }
          />
        </ScrollView>

        {/* List Header */}
        <View style={styles.listHeader}>
          <Text style={styles.sectionTitle}>
            Job Schedule
          </Text>

          <Text style={styles.resultCount}>
            {filteredJobs.length} job
            {filteredJobs.length !== 1
              ? "s"
              : ""}
          </Text>
        </View>

        {/* Jobs */}
        <View style={styles.jobsList}>
          {filteredJobs.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              onOpen={() =>
                openJobDetails(job)
              }
              onAccept={() =>
                handleAcceptJob(job.id)
              }
            />
          ))}
        </View>

        {filteredJobs.length === 0 && (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIcon}>
              <CheckCircle2
                size={38}
                color="#22C55E"
              />
            </View>

            <Text style={styles.emptyTitle}>
              No Jobs Here
            </Text>

            <Text style={styles.emptyText}>
              There are currently no jobs
              matching this status.
            </Text>
          </View>
        )}
      </ScrollView>
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
      <Text
        style={[
          styles.overviewValue,
          { color },
        ]}
      >
        {value}
      </Text>

      <Text style={styles.overviewLabel}>
        {label}
      </Text>
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
        active &&
          styles.filterButtonActive,
      ]}
      activeOpacity={0.8}
      onPress={onPress}
    >
      <Text
        style={[
          styles.filterText,
          active &&
            styles.filterTextActive,
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function JobCard({
  job,
  onOpen,
  onAccept,
}: {
  job: JobItem;
  onOpen: () => void;
  onAccept: () => void;
}) {
  const status =
    getStatusConfig(job.status);

  const priority =
    getPriorityColor(job.priority);

  return (
    <View style={styles.jobCard}>
      {/* Top */}
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={onOpen}
      >
        <View style={styles.jobTopRow}>
          <View style={styles.timeColumn}>
            <Clock3
              size={16}
              color="#F59E0B"
            />

            <Text style={styles.jobTime}>
              {job.time}
            </Text>
          </View>

          <View style={styles.jobMainInfo}>
            <Text style={styles.serviceName}>
              {job.service}
            </Text>

            <Text style={styles.jobId}>
              {job.id}
            </Text>
          </View>

          <View
            style={[
              styles.priorityBadge,
              {
                backgroundColor:
                  `${priority}15`,
                borderColor:
                  `${priority}40`,
              },
            ]}
          >
            <Text
              style={[
                styles.priorityText,
                {
                  color: priority,
                },
              ]}
            >
              {job.priority}
            </Text>
          </View>
        </View>

        <View style={styles.divider} />

        {/* Customer */}
        <View style={styles.infoRow}>
          <UserRound
            size={16}
            color="#64748B"
          />

          <View style={styles.infoContent}>
            <Text style={styles.infoLabel}>
              Customer
            </Text>

            <Text style={styles.infoValue}>
              {job.customer}
            </Text>
          </View>
        </View>

        {/* Location */}
        <View style={styles.infoRow}>
          <MapPin
            size={16}
            color="#64748B"
          />

          <View style={styles.infoContent}>
            <Text style={styles.infoLabel}>
              Location
            </Text>

            <Text style={styles.infoValue}>
              {job.location}
            </Text>
          </View>
        </View>

        {/* Status */}
        <View style={styles.statusRow}>
          <View
            style={[
              styles.statusBadge,
              {
                backgroundColor:
                  `${status.color}12`,
                borderColor:
                  `${status.color}35`,
              },
            ]}
          >
            <View
              style={[
                styles.statusDot,
                {
                  backgroundColor:
                    status.color,
                },
              ]}
            />

            <Text
              style={[
                styles.statusText,
                {
                  color: status.color,
                },
              ]}
            >
              {status.label}
            </Text>
          </View>
        </View>
      </TouchableOpacity>

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.viewButton}
          activeOpacity={0.8}
          onPress={onOpen}
        >
          <Text style={styles.viewButtonText}>
            View Details
          </Text>
        </TouchableOpacity>

        {job.status === "pending" && (
          <TouchableOpacity
            style={styles.acceptButton}
            activeOpacity={0.85}
            onPress={onAccept}
          >
            <CheckCircle2
              size={17}
              color="#FFFFFF"
            />

            <Text
              style={
                styles.acceptButtonText
              }
            >
              Accept
            </Text>
          </TouchableOpacity>
        )}

        {job.status === "accepted" && (
          <TouchableOpacity
            style={styles.startButton}
            activeOpacity={0.85}
            onPress={() =>
              router.push({
                pathname:
                  "/technician/job-details",
                params: {
                  id: job.id,
                },
              })
            }
          >
            <Wrench
              size={17}
              color="#FFFFFF"
            />

            <Text
              style={styles.startButtonText}
            >
              Start Job
            </Text>
          </TouchableOpacity>
        )}

        {job.status === "in_progress" && (
          <TouchableOpacity
            style={styles.continueButton}
            activeOpacity={0.85}
            onPress={() =>
              router.push({
                pathname:
                  "/technician/job-action",
                params: {
                  id: job.id,
                },
              })
            }
          >
            <Text
              style={
                styles.continueButtonText
              }
            >
              Continue Job
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

function getStatusConfig(
  status: JobStatus
) {
  switch (status) {
    case "pending":
      return {
        label: "Pending",
        color: "#F59E0B",
      };

    case "accepted":
      return {
        label: "Accepted",
        color: "#22C55E",
      };

    case "in_progress":
      return {
        label: "In Progress",
        color: "#3B82F6",
      };

    case "upcoming":
      return {
        label: "Upcoming",
        color: "#A78BFA",
      };
  }
}

function getPriorityColor(
  priority: Priority
) {
  switch (priority) {
    case "Low":
      return "#22C55E";

    case "Medium":
      return "#F59E0B";

    case "High":
      return "#F97316";

    case "Emergency":
      return "#EF4444";
  }
}

const styles =
  StyleSheet.create({
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
      paddingBottom: 120,
    },

    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 23,
    },

    title: {
      color: "#FFFFFF",
      fontSize: 27,
      fontWeight: "800",
    },

    subtitle: {
      color: "#64748B",
      fontSize: 11,
      marginTop: 4,
    },

    totalBadge: {
      width: 52,
      height: 52,
      borderRadius: 16,
      backgroundColor:
        "rgba(34,197,94,0.08)",
      borderWidth: 1,
      borderColor:
        "rgba(34,197,94,0.20)",
      alignItems: "center",
      justifyContent: "center",
    },

    totalValue: {
      color: "#22C55E",
      fontSize: 18,
      fontWeight: "800",
    },

    totalLabel: {
      color: "#64748B",
      fontSize: 8,
      marginTop: 1,
    },

    overviewRow: {
      flexDirection: "row",
      gap: 9,
      marginBottom: 22,
    },

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

    overviewValue: {
      fontSize: 22,
      fontWeight: "800",
    },

    overviewLabel: {
      color: "#94A3B8",
      fontSize: 9,
      marginTop: 4,
    },

    filters: {
      gap: 8,
      paddingBottom: 24,
    },

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

    filterText: {
      color: "#94A3B8",
      fontSize: 10,
      fontWeight: "600",
    },

    filterTextActive: {
      color: "#FFFFFF",
    },

    listHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 12,
    },

    sectionTitle: {
      color: "#F8FAFC",
      fontSize: 14,
      fontWeight: "800",
    },

    resultCount: {
      color: "#64748B",
      fontSize: 9,
    },

    jobsList: {
      gap: 13,
    },

    jobCard: {
      borderRadius: 18,
      backgroundColor: "#0D1B2A",
      borderWidth: 1,
      borderColor: "#17263A",
      padding: 15,
    },

    jobTopRow: {
      flexDirection: "row",
      alignItems: "center",
    },

    timeColumn: {
      width: 65,
      alignItems: "center",
      marginRight: 8,
    },

    jobTime: {
      color: "#F59E0B",
      fontSize: 9,
      fontWeight: "700",
      marginTop: 5,
    },

    jobMainInfo: {
      flex: 1,
    },

    serviceName: {
      color: "#F8FAFC",
      fontSize: 14,
      fontWeight: "700",
    },

    jobId: {
      color: "#475569",
      fontSize: 8,
      marginTop: 4,
    },

    priorityBadge: {
      minHeight: 27,
      borderRadius: 8,
      borderWidth: 1,
      paddingHorizontal: 8,
      alignItems: "center",
      justifyContent: "center",
    },

    priorityText: {
      fontSize: 8,
      fontWeight: "700",
    },

    divider: {
      height: 1,
      backgroundColor: "#17263A",
      marginVertical: 13,
    },

    infoRow: {
      flexDirection: "row",
      alignItems: "center",
      minHeight: 44,
    },

    infoContent: {
      flex: 1,
      marginLeft: 9,
    },

    infoLabel: {
      color: "#475569",
      fontSize: 8,
    },

    infoValue: {
      color: "#CBD5E1",
      fontSize: 10,
      fontWeight: "600",
      marginTop: 2,
    },

    statusRow: {
      flexDirection: "row",
      marginTop: 7,
    },

    statusBadge: {
      minHeight: 28,
      borderRadius: 9,
      borderWidth: 1,
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 9,
    },

    statusDot: {
      width: 6,
      height: 6,
      borderRadius: 6,
      marginRight: 6,
    },

    statusText: {
      fontSize: 8,
      fontWeight: "700",
    },

    actions: {
      flexDirection: "row",
      gap: 9,
      marginTop: 14,
    },

    viewButton: {
      flex: 1,
      height: 44,
      borderRadius: 11,
      borderWidth: 1,
      borderColor: "#273750",
      alignItems: "center",
      justifyContent: "center",
    },

    viewButtonText: {
      color: "#CBD5E1",
      fontSize: 10,
      fontWeight: "700",
    },

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

    acceptButtonText: {
      color: "#FFFFFF",
      fontSize: 10,
      fontWeight: "700",
    },

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

    startButtonText: {
      color: "#FFFFFF",
      fontSize: 10,
      fontWeight: "700",
    },

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
      backgroundColor:
        "rgba(34,197,94,0.07)",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 16,
    },

    emptyTitle: {
      color: "#FFFFFF",
      fontSize: 17,
      fontWeight: "800",
    },

    emptyText: {
      color: "#64748B",
      fontSize: 10,
      lineHeight: 17,
      textAlign: "center",
      marginTop: 6,
    },
  });