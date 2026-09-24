import { router, useLocalSearchParams } from "expo-router";
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
  Filter,
  MapPin,
  Search,
  Star,
  UserRound,
  Wrench,
} from "lucide-react-native";

import {
  SERVICE_CATEGORIES,
  ServiceCategory,
} from "@/src/constants/serviceRequests";
import {
  PublicTechnicianProfile,
  subscribeToApprovedTechnicians,
} from "@/src/services/technician.service";

type CategoryFilter = ServiceCategory | "All";

export default function TechniciansScreen() {
  const params = useLocalSearchParams<{
    category?: string;
    division?: string;
  }>();

  const initialCategory = SERVICE_CATEGORIES.includes(
    params.category as ServiceCategory
  )
    ? (params.category as ServiceCategory)
    : "All";

  const [technicians, setTechnicians] = useState<
    PublicTechnicianProfile[]
  >([]);
  const [category, setCategory] =
    useState<CategoryFilter>(initialCategory);
  const [division, setDivision] = useState(
    params.division ?? "All"
  );
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    setCategory(initialCategory);
    setDivision(params.division ?? "All");
  }, [initialCategory, params.division]);

  useEffect(() => {
    setLoading(true);

    const unsubscribe = subscribeToApprovedTechnicians(
      (items) => {
        setTechnicians(items);
        setLoading(false);
      },
      (error) => {
        console.error(
          "Approved technicians subscription error:",
          error
        );
        setErrorMessage("Unable to load technicians.");
        setLoading(false);
      },
      {
        category,
        division,
      }
    );

    return unsubscribe;
  }, [category, division]);

  const divisions = useMemo(() => {
    const unique = new Set(
      technicians.map((item) => item.serviceDivision)
    );
    return ["All", ...Array.from(unique).sort()];
  }, [technicians]);

  const filteredTechnicians = useMemo(() => {
    const cleanSearch = search.trim().toLowerCase();

    if (!cleanSearch) {
      return technicians;
    }

    return technicians.filter((technician) =>
      [
        technician.fullName,
        technician.specialization,
        technician.serviceDivision,
      ]
        .join(" ")
        .toLowerCase()
        .includes(cleanSearch)
    );
  }, [search, technicians]);

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
          <Text style={styles.title}>Technicians</Text>
          <Text style={styles.subtitle}>
            Browse approved ServicePilot professionals
          </Text>
        </View>

        {!!errorMessage && (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>
              {errorMessage}
            </Text>
          </View>
        )}

        <View style={styles.searchBox}>
          <Search size={18} color="#64748B" />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search technician, category, division"
            placeholderTextColor="#64748B"
            style={styles.searchInput}
          />
        </View>

        <Text style={styles.filterLabel}>Category</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {(["All", ...SERVICE_CATEGORIES] as CategoryFilter[]).map(
            (item) => (
              <FilterChip
                key={item}
                label={item}
                active={category === item}
                onPress={() => setCategory(item)}
              />
            )
          )}
        </ScrollView>

        <Text style={styles.filterLabel}>Division</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {divisions.map((item) => (
            <FilterChip
              key={item}
              label={item}
              active={division === item}
              onPress={() => setDivision(item)}
            />
          ))}
        </ScrollView>

        <View style={styles.resultHeader}>
          <View style={styles.resultTitleRow}>
            <Filter size={16} color="#60A5FA" />
            <Text style={styles.sectionTitle}>
              Approved Technicians
            </Text>
          </View>
          <Text style={styles.resultCount}>
            {filteredTechnicians.length}
          </Text>
        </View>

        {filteredTechnicians.length > 0 ? (
          <View style={styles.list}>
            {filteredTechnicians.map((technician) => (
              <TechnicianCard
                key={technician.uid}
                technician={technician}
              />
            ))}
          </View>
        ) : (
          <View style={styles.emptyCard}>
            <UserRound size={38} color="#64748B" />
            <Text style={styles.emptyTitle}>
              No Approved Technicians
            </Text>
            <Text style={styles.emptyText}>
              Try another category or division.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function FilterChip({
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
      style={[styles.filterChip, active && styles.filterChipActive]}
      activeOpacity={0.8}
      onPress={onPress}
    >
      <Text
        style={[
          styles.filterChipText,
          active && styles.filterChipTextActive,
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function TechnicianCard({
  technician,
}: {
  technician: PublicTechnicianProfile;
}) {
  const rating =
    technician.averageRating > 0
      ? technician.averageRating.toFixed(1)
      : "New";

  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.82}
      onPress={() =>
        router.push({
          pathname: "/technician-profile",
          params: { id: technician.uid },
        })
      }
    >
      <View style={styles.avatar}>
        <UserRound size={26} color="#FFFFFF" />
      </View>
      <View style={styles.cardContent}>
        <Text style={styles.name}>{technician.fullName}</Text>
        <View style={styles.metaRow}>
          <Wrench size={13} color="#60A5FA" />
          <Text style={styles.metaText}>
            {technician.specialization}
          </Text>
        </View>
        <View style={styles.metaRow}>
          <MapPin size={13} color="#22D3EE" />
          <Text style={styles.metaText}>
            {technician.serviceDivision}
          </Text>
        </View>
        <Text style={styles.experience}>
          {technician.experience}
        </Text>
      </View>
      <View style={styles.ratingBox}>
        <Star
          size={15}
          color="#F59E0B"
          fill={technician.averageRating > 0 ? "#F59E0B" : "transparent"}
        />
        <Text style={styles.ratingText}>{rating}</Text>
        <Text style={styles.reviewText}>
          {technician.reviewCount} reviews
        </Text>
      </View>
    </TouchableOpacity>
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
  header: { marginBottom: 18 },
  title: {
    color: "#FFFFFF",
    fontSize: 28,
    fontWeight: "800",
  },
  subtitle: {
    color: "#64748B",
    fontSize: 12,
    marginTop: 5,
  },
  errorCard: {
    backgroundColor: "rgba(239,68,68,0.08)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.22)",
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  errorText: { color: "#FCA5A5", fontSize: 12, textAlign: "center" },
  searchBox: {
    height: 50,
    borderRadius: 13,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    marginBottom: 16,
  },
  searchInput: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 12,
    marginLeft: 10,
  },
  filterLabel: {
    color: "#F8FAFC",
    fontSize: 12,
    fontWeight: "800",
    marginBottom: 8,
  },
  filterRow: { gap: 8, paddingBottom: 16 },
  filterChip: {
    height: 37,
    borderRadius: 10,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#1E2D42",
    justifyContent: "center",
    paddingHorizontal: 13,
  },
  filterChipActive: {
    backgroundColor: "#2563EB",
    borderColor: "#2563EB",
  },
  filterChipText: {
    color: "#94A3B8",
    fontSize: 10,
    fontWeight: "700",
  },
  filterChipTextActive: { color: "#FFFFFF" },
  resultHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
    marginBottom: 12,
  },
  resultTitleRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  sectionTitle: { color: "#F8FAFC", fontSize: 15, fontWeight: "800" },
  resultCount: { color: "#64748B", fontSize: 11, fontWeight: "700" },
  list: { gap: 12 },
  card: {
    minHeight: 132,
    borderRadius: 18,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    flexDirection: "row",
    padding: 14,
  },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: 17,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  cardContent: { flex: 1 },
  name: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 7,
  },
  metaText: { color: "#CBD5E1", fontSize: 10, flex: 1 },
  experience: { color: "#64748B", fontSize: 10, marginTop: 8 },
  ratingBox: {
    width: 72,
    borderRadius: 13,
    backgroundColor: "#101F30",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
  },
  ratingText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
    marginTop: 4,
  },
  reviewText: {
    color: "#64748B",
    fontSize: 8,
    marginTop: 2,
    textAlign: "center",
  },
  emptyCard: {
    minHeight: 260,
    borderRadius: 18,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
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
    textAlign: "center",
    marginTop: 7,
  },
});

