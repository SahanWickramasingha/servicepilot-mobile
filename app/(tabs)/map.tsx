import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  MapPinned,
  Search,
  Star,
  UsersRound,
  Wrench,
} from "lucide-react-native";
import Svg, {
  Circle,
  Defs,
  G,
  LinearGradient,
  Path,
  Stop,
  Text as SvgText,
} from "react-native-svg";

import {
  PublicTechnicianProfile,
  subscribeToApprovedTechnicians,
} from "@/src/services/technician.service";

type DivisionSummary = {
  id: string;
  name: string;
  count: number;
  x: number;
  y: number;
  technicians: PublicTechnicianProfile[];
};

const MAP_POSITIONS = [
  { x: 42, y: 22 },
  { x: 58, y: 31 },
  { x: 46, y: 42 },
  { x: 61, y: 52 },
  { x: 45, y: 63 },
  { x: 57, y: 73 },
  { x: 38, y: 82 },
  { x: 65, y: 84 },
  { x: 35, y: 34 },
  { x: 68, y: 41 },
];

function normalizeDivision(value: string) {
  return value.trim().toLowerCase();
}

function makeDivisionId(name: string) {
  return normalizeDivision(name).replace(/[^a-z0-9]+/g, "-");
}

function getRatingLabel(technician: PublicTechnicianProfile) {
  return technician.averageRating > 0
    ? technician.averageRating.toFixed(1)
    : "New";
}

export default function DivisionMapScreen() {
  const [technicians, setTechnicians] = useState<
    PublicTechnicianProfile[]
  >([]);
  const [selectedDivisionId, setSelectedDivisionId] =
    useState<string>("");
  const [search, setSearch] = useState("");
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
    const grouped = new Map<
      string,
      {
        name: string;
        technicians: PublicTechnicianProfile[];
      }
    >();

    technicians.forEach((technician) => {
      const name =
        technician.serviceDivision.trim() || "Unassigned Division";
      const key = normalizeDivision(name);
      const existing = grouped.get(key);

      grouped.set(key, {
        name: existing?.name ?? name,
        technicians: [
          ...(existing?.technicians ?? []),
          technician,
        ],
      });
    });

    return Array.from(grouped.values())
      .sort((first, second) =>
        first.name.localeCompare(second.name)
      )
      .map((division, index) => {
        const position =
          MAP_POSITIONS[index % MAP_POSITIONS.length];
        const row = Math.floor(index / MAP_POSITIONS.length);

        return {
          id: makeDivisionId(division.name),
          name: division.name,
          count: division.technicians.length,
          x: Math.min(position.x + row * 3, 72),
          y: Math.min(position.y + row * 4, 88),
          technicians: [...division.technicians].sort((first, second) => {
            if (second.averageRating !== first.averageRating) {
              return second.averageRating - first.averageRating;
            }

            return first.fullName.localeCompare(second.fullName);
          }),
        };
      });
  }, [technicians]);

  const filteredDivisions = useMemo(() => {
    const cleanSearch = normalizeDivision(search);

    if (!cleanSearch) {
      return divisions;
    }

    return divisions.filter((division) =>
      normalizeDivision(division.name).includes(cleanSearch)
    );
  }, [divisions, search]);

  useEffect(() => {
    if (filteredDivisions.length === 0) {
      setSelectedDivisionId("");
      return;
    }

    const selectedStillVisible = filteredDivisions.some(
      (division) => division.id === selectedDivisionId
    );

    if (!selectedStillVisible) {
      setSelectedDivisionId(filteredDivisions[0].id);
    }
  }, [filteredDivisions, selectedDivisionId]);

  const selectedDivision =
    filteredDivisions.find(
      (division) => division.id === selectedDivisionId
    ) ?? filteredDivisions[0];

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
            <Text style={styles.title}>
              Technicians by Division
            </Text>
            <Text style={styles.subtitle}>
              Find approved ServicePilot professionals by service area.
            </Text>
          </View>
        </View>

        <View style={styles.searchBox}>
          <Search size={18} color="#64748B" />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search Division"
            placeholderTextColor="#64748B"
            style={styles.searchInput}
          />
        </View>

        <View style={styles.noticeCard}>
          <Text style={styles.noticeText}>
            Division availability only. No live GPS, routes, or exact
            technician locations are shown.
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
          <View style={styles.mapHeaderRow}>
            <View>
              <Text style={styles.mapTitle}>Service Regions</Text>
              <Text style={styles.mapSubtitle}>
                {filteredDivisions.length} division
                {filteredDivisions.length === 1 ? "" : "s"} with approved
                technicians
              </Text>
            </View>
            <View style={styles.totalBadge}>
              <UsersRound size={15} color="#FFFFFF" />
              <Text style={styles.totalBadgeText}>
                {technicians.length}
              </Text>
            </View>
          </View>

          {filteredDivisions.length > 0 ? (
            <DivisionSvgMap
              divisions={filteredDivisions}
              selectedDivisionId={selectedDivision?.id ?? ""}
              onSelect={setSelectedDivisionId}
            />
          ) : (
            <View style={styles.emptyMap}>
              <MapPinned size={40} color="#64748B" />
              <Text style={styles.emptyTitle}>
                {divisions.length === 0
                  ? "No Approved Technicians"
                  : "No Division Match"}
              </Text>
              <Text style={styles.emptyText}>
                {divisions.length === 0
                  ? "No approved technicians are available yet."
                  : "No approved technicians are currently available in this division."}
              </Text>
            </View>
          )}
        </View>

        {selectedDivision ? (
          <SelectedDivisionCard division={selectedDivision} />
        ) : null}
      </ScrollView>
    </View>
  );
}

function DivisionSvgMap({
  divisions,
  selectedDivisionId,
  onSelect,
}: {
  divisions: DivisionSummary[];
  selectedDivisionId: string;
  onSelect: (divisionId: string) => void;
}) {
  return (
    <View style={styles.svgWrap}>
      <Svg width="100%" height="100%" viewBox="0 0 100 120">
        <Defs>
          <LinearGradient
            id="regionFill"
            x1="0"
            y1="0"
            x2="1"
            y2="1"
          >
            <Stop offset="0" stopColor="#10243A" />
            <Stop offset="1" stopColor="#081525" />
          </LinearGradient>
        </Defs>

        <Path
          d="M50 7 C65 14 72 29 70 43 C82 56 75 74 62 83 C61 98 51 112 38 112 C26 112 20 100 24 87 C14 78 12 64 20 52 C17 37 25 18 50 7 Z"
          fill="url(#regionFill)"
          stroke="#1E3A5F"
          strokeWidth="1.5"
        />
        <Path
          d="M36 21 C45 27 59 31 67 39"
          stroke="#183756"
          strokeWidth="0.8"
          fill="none"
        />
        <Path
          d="M24 53 C40 56 55 55 72 62"
          stroke="#183756"
          strokeWidth="0.8"
          fill="none"
        />
        <Path
          d="M33 86 C45 78 54 74 65 79"
          stroke="#183756"
          strokeWidth="0.8"
          fill="none"
        />

        {divisions.map((division) => {
          const selected = division.id === selectedDivisionId;

          return (
            <G
              key={division.id}
              onPress={() => onSelect(division.id)}
            >
              <Circle
                cx={division.x}
                cy={division.y}
                r={selected ? 8.5 : 7}
                fill={selected ? "#2563EB" : "#0F2742"}
                stroke={selected ? "#93C5FD" : "#22D3EE"}
                strokeWidth={selected ? 2 : 1.3}
              />
              <Circle
                cx={division.x}
                cy={division.y}
                r={selected ? 3.2 : 2.5}
                fill={selected ? "#FFFFFF" : "#60A5FA"}
              />
              <SvgText
                x={division.x}
                y={division.y - 11}
                fill="#E2E8F0"
                fontSize="4"
                fontWeight="700"
                textAnchor="middle"
              >
                {division.count}
              </SvgText>
              <SvgText
                x={division.x}
                y={division.y + 15}
                fill={selected ? "#FFFFFF" : "#94A3B8"}
                fontSize="3.6"
                fontWeight={selected ? "800" : "600"}
                textAnchor="middle"
              >
                {division.name.length > 12
                  ? `${division.name.slice(0, 11)}.`
                  : division.name}
              </SvgText>
            </G>
          );
        })}
      </Svg>
    </View>
  );
}

function SelectedDivisionCard({
  division,
}: {
  division: DivisionSummary;
}) {
  const topTechnicians = division.technicians.slice(0, 3);

  return (
    <View style={styles.selectedCard}>
      <View style={styles.selectedHeader}>
        <View>
          <Text style={styles.selectedTitle}>
            {division.name} Division
          </Text>
          <Text style={styles.selectedSubtitle}>
            {division.count} approved technician
            {division.count === 1 ? "" : "s"}
          </Text>
        </View>
        <View style={styles.selectedCount}>
          <Text style={styles.selectedCountText}>
            {division.count}
          </Text>
        </View>
      </View>

      <View style={styles.technicianList}>
        {topTechnicians.map((technician) => (
          <TouchableOpacity
            key={technician.uid}
            style={styles.technicianRow}
            activeOpacity={0.82}
            onPress={() =>
              router.push({
                pathname: "/technician-profile",
                params: { id: technician.uid },
              })
            }
          >
            <View style={styles.technicianAvatar}>
              <Wrench size={17} color="#FFFFFF" />
            </View>
            <View style={styles.technicianContent}>
              <Text style={styles.technicianName}>
                {technician.fullName}
              </Text>
              <Text style={styles.technicianMeta}>
                {technician.specialization}
              </Text>
            </View>
            <View style={styles.ratingPill}>
              <Star
                size={12}
                color="#F59E0B"
                fill={
                  technician.averageRating > 0
                    ? "#F59E0B"
                    : "transparent"
                }
              />
              <Text style={styles.ratingText}>
                {getRatingLabel(technician)}
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity
        style={styles.viewAllButton}
        activeOpacity={0.85}
        onPress={() =>
          router.push({
            pathname: "/technicians",
            params: { division: division.name },
          })
        }
      >
        <Text style={styles.viewAllButtonText}>
          View All Technicians
        </Text>
      </TouchableOpacity>
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
  title: {
    color: "#FFFFFF",
    fontSize: 25,
    fontWeight: "800",
  },
  subtitle: {
    color: "#64748B",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 5,
  },
  searchBox: {
    height: 50,
    borderRadius: 13,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 12,
    marginLeft: 10,
  },
  noticeCard: {
    borderRadius: 14,
    backgroundColor: "rgba(37,99,235,0.08)",
    borderWidth: 1,
    borderColor: "rgba(37,99,235,0.20)",
    padding: 13,
    marginBottom: 16,
  },
  noticeText: {
    color: "#CBD5E1",
    fontSize: 11,
    lineHeight: 18,
  },
  errorCard: {
    backgroundColor: "rgba(239,68,68,0.08)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.22)",
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  errorText: {
    color: "#FCA5A5",
    fontSize: 12,
    textAlign: "center",
  },
  mapPanel: {
    minHeight: 500,
    borderRadius: 22,
    backgroundColor: "#0A1625",
    borderWidth: 1,
    borderColor: "#17263A",
    padding: 16,
    overflow: "hidden",
  },
  mapHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  mapTitle: {
    color: "#F8FAFC",
    fontSize: 15,
    fontWeight: "800",
  },
  mapSubtitle: {
    color: "#64748B",
    fontSize: 10,
    marginTop: 4,
  },
  totalBadge: {
    minWidth: 58,
    height: 34,
    borderRadius: 11,
    backgroundColor: "#2563EB",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingHorizontal: 9,
  },
  totalBadgeText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },
  svgWrap: {
    height: 420,
    width: "100%",
  },
  emptyMap: {
    minHeight: 380,
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
  selectedCard: {
    borderRadius: 20,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    padding: 16,
    marginTop: 16,
  },
  selectedHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 13,
  },
  selectedTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "800",
  },
  selectedSubtitle: {
    color: "#94A3B8",
    fontSize: 11,
    marginTop: 5,
  },
  selectedCount: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
  },
  selectedCountText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "800",
  },
  technicianList: { gap: 10 },
  technicianRow: {
    minHeight: 70,
    borderRadius: 14,
    backgroundColor: "#101F30",
    borderWidth: 1,
    borderColor: "#1E2D42",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
  },
  technicianAvatar: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 11,
  },
  technicianContent: { flex: 1 },
  technicianName: {
    color: "#F8FAFC",
    fontSize: 13,
    fontWeight: "800",
  },
  technicianMeta: {
    color: "#94A3B8",
    fontSize: 10,
    marginTop: 4,
  },
  ratingPill: {
    minWidth: 58,
    height: 32,
    borderRadius: 10,
    backgroundColor: "#0D1B2A",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: 8,
  },
  ratingText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "800",
  },
  viewAllButton: {
    height: 48,
    borderRadius: 12,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 14,
  },
  viewAllButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },
});
