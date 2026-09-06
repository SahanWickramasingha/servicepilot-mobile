import { router } from "expo-router";
import { useMemo, useState } from "react";
import {
  AirVent,
  ArrowLeft,
  ChevronRight,
  Refrigerator,
  Search,
  Sparkles,
  Tv,
  WashingMachine,
  Wrench,
  Zap,
} from "lucide-react-native";
import {
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

type ServiceItem = {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
};

const services: ServiceItem[] = [
  {
    id: "ac-repair",
    name: "AC Repair",
    description: "Air conditioner repair & maintenance",
    icon: <AirVent size={23} color="#60A5FA" />,
  },
  {
    id: "washing-machine",
    name: "Washing Machine Repair",
    description: "Washing machine repair & maintenance",
    icon: <WashingMachine size={23} color="#38BDF8" />,
  },
  {
    id: "electrical",
    name: "Electrical Installation",
    description: "Electrical repairs, wiring & installation",
    icon: <Zap size={23} color="#F59E0B" />,
  },
  {
    id: "plumbing",
    name: "Plumbing",
    description: "Leaks, pipes, taps & plumbing repairs",
    icon: <Wrench size={23} color="#22C55E" />,
  },
  {
    id: "tv",
    name: "TV Repair",
    description: "LED, LCD and Smart TV repair",
    icon: <Tv size={23} color="#A78BFA" />,
  },
  {
    id: "refrigerator",
    name: "Refrigerator Repair",
    description: "Refrigerator repair & maintenance",
    icon: <Refrigerator size={23} color="#22D3EE" />,
  },
  {
    id: "other",
    name: "Other Services",
    description: "Select this for another service type",
    icon: <Sparkles size={23} color="#94A3B8" />,
  },
];

export default function SelectServiceScreen() {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredServices = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    if (!query) {
      return services;
    }

    return services.filter((service) => {
      return (
        service.name.toLowerCase().includes(query) ||
        service.description.toLowerCase().includes(query)
      );
    });
  }, [searchQuery]);

  const handleSelectService = (service: ServiceItem) => {
    /*
      Later we can use Zustand or route params to persist this.

      For now:
      - return to create request
      - pass selected service through params
    */

    router.replace({
      pathname: "/create-request",
      params: {
        service: service.name,
        serviceId: service.id,
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
        keyboardShouldPersistTaps="handled"
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

          <View style={styles.headerText}>
            <Text style={styles.title}>
              Select Service Type
            </Text>

            <Text style={styles.subtitle}>
              Choose the service you need
            </Text>
          </View>
        </View>

        {/* Search */}
        <View style={styles.searchContainer}>
          <Search
            size={20}
            color="#64748B"
          />

          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search service"
            placeholderTextColor="#64748B"
            autoCorrect={false}
            style={styles.searchInput}
          />
        </View>

        {/* List */}
        <View style={styles.listHeader}>
          <Text style={styles.listTitle}>
            Available Services
          </Text>

          <Text style={styles.countText}>
            {filteredServices.length}
          </Text>
        </View>

        {filteredServices.length > 0 ? (
          <View style={styles.serviceList}>
            {filteredServices.map((service) => (
              <TouchableOpacity
                key={service.id}
                style={styles.serviceCard}
                activeOpacity={0.8}
                onPress={() => handleSelectService(service)}
              >
                <View style={styles.serviceIcon}>
                  {service.icon}
                </View>

                <View style={styles.serviceContent}>
                  <Text style={styles.serviceName}>
                    {service.name}
                  </Text>

                  <Text style={styles.serviceDescription}>
                    {service.description}
                  </Text>
                </View>

                <ChevronRight
                  size={20}
                  color="#64748B"
                />
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Search
                size={34}
                color="#64748B"
              />
            </View>

            <Text style={styles.emptyTitle}>
              No Services Found
            </Text>

            <Text style={styles.emptyText}>
              Try another search term or select Other Services.
            </Text>
          </View>
        )}

        {/* Help Card */}
        <View style={styles.helpCard}>
          <View style={styles.helpIcon}>
            <Wrench
              size={20}
              color="#3B82F6"
            />
          </View>

          <View style={styles.helpContent}>
            <Text style={styles.helpTitle}>
              Can't find the service?
            </Text>

            <Text style={styles.helpText}>
              Choose Other Services and describe the issue in your request.
            </Text>
          </View>
        </View>
      </ScrollView>
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
    paddingBottom: 60,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 26,
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
    marginRight: 14,
  },

  headerText: {
    flex: 1,
  },

  title: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "800",
  },

  subtitle: {
    color: "#64748B",
    fontSize: 12,
    marginTop: 4,
  },

  searchContainer: {
    height: 56,
    borderRadius: 13,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 15,
    marginBottom: 24,
  },

  searchInput: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 14,
    marginLeft: 11,
    height: "100%",
  },

  listHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },

  listTitle: {
    color: "#F8FAFC",
    fontSize: 14,
    fontWeight: "700",
  },

  countText: {
    color: "#64748B",
    fontSize: 11,
    fontWeight: "600",
  },

  serviceList: {
    gap: 10,
  },

  serviceCard: {
    minHeight: 82,
    borderRadius: 16,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 13,
  },

  serviceIcon: {
    width: 50,
    height: 50,
    borderRadius: 15,
    backgroundColor: "#101F30",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 13,
  },

  serviceContent: {
    flex: 1,
    paddingRight: 8,
  },

  serviceName: {
    color: "#F8FAFC",
    fontSize: 13,
    fontWeight: "700",
  },

  serviceDescription: {
    color: "#64748B",
    fontSize: 10,
    lineHeight: 15,
    marginTop: 5,
  },

  emptyState: {
    minHeight: 260,
    borderRadius: 18,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 30,
  },

  emptyIcon: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: "#101F30",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 17,
  },

  emptyTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "800",
  },

  emptyText: {
    color: "#64748B",
    fontSize: 11,
    lineHeight: 18,
    textAlign: "center",
    marginTop: 8,
  },

  helpCard: {
    minHeight: 86,
    borderRadius: 15,
    backgroundColor: "rgba(37,99,235,0.06)",
    borderWidth: 1,
    borderColor: "rgba(37,99,235,0.17)",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    marginTop: 22,
  },

  helpIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: "rgba(37,99,235,0.10)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },

  helpContent: {
    flex: 1,
  },

  helpTitle: {
    color: "#E2E8F0",
    fontSize: 12,
    fontWeight: "700",
  },

  helpText: {
    color: "#64748B",
    fontSize: 10,
    lineHeight: 15,
    marginTop: 4,
  },
});