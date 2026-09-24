import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { MapPinned, UsersRound } from "lucide-react-native";

import {
  PublicTechnicianProfile,
  subscribeToApprovedTechnicians,
} from "@/src/services/technician.service";

export default function DivisionMapScreen() {
  const [technicians, setTechnicians] = useState<
    PublicTechnicianProfile[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const unsubscribe = subscribeToApprovedTechnicians(
      (items) => {
        setTechnicians(items);
        setLoading(false);
      },
      (error) => {
        console.error("Division map load error:", error);
        setErrorMessage("Unable to load division availability.");
        setLoading(false);
      }
    );

    return unsubscribe;
  }, []);

  const divisions = useMemo(() => {
    const counts = new Map<string, number>();

    technicians.forEach((technician) => {
      counts.set(
        technician.serviceDivision,
        (counts.get(technician.serviceDivision) ?? 0) + 1
      );
    });

    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((first, second) =>
        first.name.localeCompare(second.name)
      );
  }, [technicians]);

  if (loading) {
    return (
      <View style={styles.centerScreen}>
        <ActivityIndicator color="#3B82F6" />
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
          <View style={styles.mapIcon}>
            <MapPinned size={28} color="#60A5FA" />
          </View>
          <View style={styles.headerText}>
            <Text style={styles.title}>Division Map</Text>
            <Text style={styles.subtitle}>
              Approved technicians by service division
            </Text>
          </View>
        </View>

        <View style={styles.noticeCard}>
          <Text style={styles.noticeText}>
            This map is division-based only. It does not show live
            GPS or exact technician locations.
          </Text>
        </View>

        {!!errorMessage && (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>
              {errorMessage}
            </Text>
          </View>
        )}

        <View style={styles.mapPanel}>
          {divisions.length > 0 ? (
            divisions.map((division, index) => (
              <TouchableOpacity
                key={division.name}
                style={[
                  styles.markerCard,
                  index % 2 === 1 && styles.markerCardOffset,
                ]}
                activeOpacity={0.82}
                onPress={() =>
                  router.push({
                    pathname: "/technicians",
                    params: { division: division.name },
                  })
                }
              >
                <View style={styles.marker}>
                  <UsersRound size={20} color="#FFFFFF" />
                </View>
                <View style={styles.markerContent}>
                  <Text style={styles.divisionName}>
                    {division.name}
                  </Text>
                  <Text style={styles.divisionMeta}>
                    {division.count} technician
                    {division.count === 1 ? "" : "s"} available
                  </Text>
                </View>
                <Text style={styles.viewText}>View</Text>
              </TouchableOpacity>
            ))
          ) : (
            <View style={styles.emptyCard}>
              <MapPinned size={40} color="#64748B" />
              <Text style={styles.emptyTitle}>
                No Divisions Available
              </Text>
              <Text style={styles.emptyText}>
                Approved technicians will appear here by division.
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
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
    paddingTop: 56,
    paddingBottom: 120,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 18,
  },
  mapIcon: {
    width: 54,
    height: 54,
    borderRadius: 17,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  headerText: { flex: 1 },
  title: { color: "#FFFFFF", fontSize: 27, fontWeight: "800" },
  subtitle: { color: "#64748B", fontSize: 12, marginTop: 5 },
  noticeCard: {
    borderRadius: 14,
    backgroundColor: "rgba(37,99,235,0.08)",
    borderWidth: 1,
    borderColor: "rgba(37,99,235,0.20)",
    padding: 13,
    marginBottom: 16,
  },
  noticeText: { color: "#CBD5E1", fontSize: 11, lineHeight: 18 },
  errorCard: {
    backgroundColor: "rgba(239,68,68,0.08)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.22)",
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  errorText: { color: "#FCA5A5", fontSize: 12, textAlign: "center" },
  mapPanel: {
    minHeight: 520,
    borderRadius: 22,
    backgroundColor: "#0A1625",
    borderWidth: 1,
    borderColor: "#17263A",
    padding: 16,
    overflow: "hidden",
  },
  markerCard: {
    minHeight: 82,
    borderRadius: 17,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#1E2D42",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    marginBottom: 14,
    width: "88%",
  },
  markerCardOffset: {
    alignSelf: "flex-end",
  },
  marker: {
    width: 45,
    height: 45,
    borderRadius: 23,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  markerContent: { flex: 1 },
  divisionName: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  divisionMeta: {
    color: "#94A3B8",
    fontSize: 11,
    marginTop: 5,
  },
  viewText: {
    color: "#60A5FA",
    fontSize: 11,
    fontWeight: "800",
  },
  emptyCard: {
    flex: 1,
    minHeight: 330,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
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

