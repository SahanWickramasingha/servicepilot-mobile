import { router, useLocalSearchParams } from "expo-router";
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
import {
  ArrowLeft,
  Award,
  BriefcaseBusiness,
  MapPin,
  Star,
  UserRound,
  Wrench,
} from "lucide-react-native";

import {
  getApprovedTechnician,
  PublicTechnicianProfile,
  subscribeToTechnicianReviews,
  TechnicianReviewSummary,
} from "@/src/services/technician.service";

export default function TechnicianProfileScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const technicianId = String(params.id ?? "");
  const [technician, setTechnician] =
    useState<PublicTechnicianProfile | null>(null);
  const [reviews, setReviews] = useState<
    TechnicianReviewSummary[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!technicianId) {
      setErrorMessage("Technician not found.");
      setLoading(false);
      return;
    }

    let unsubscribeReviews: (() => void) | undefined;

    getApprovedTechnician(technicianId)
      .then((item) => {
        if (!item) {
          setErrorMessage(
            "This technician is not available for customer requests."
          );
          return;
        }

        setTechnician(item);
        unsubscribeReviews = subscribeToTechnicianReviews(
          technicianId,
          setReviews,
          (error) => {
            console.error(
              "Technician reviews subscription error:",
              error
            );
          }
        );
      })
      .catch((error) => {
        console.error("Technician profile load error:", error);
        setErrorMessage("Unable to load technician profile.");
      })
      .finally(() => setLoading(false));

    return () => unsubscribeReviews?.();
  }, [technicianId]);

  const ratingSummary = useMemo(() => {
    if (reviews.length === 0) {
      return {
        average: technician?.averageRating ?? 0,
        count: technician?.reviewCount ?? 0,
      };
    }

    const total = reviews.reduce(
      (sum, review) => sum + review.rating,
      0
    );

    return {
      average: total / reviews.length,
      count: reviews.length,
    };
  }, [reviews, technician]);

  if (loading) {
    return (
      <View style={styles.centerScreen}>
        <ActivityIndicator color="#3B82F6" />
      </View>
    );
  }

  if (!technician) {
    return (
      <View style={styles.container}>
        <StatusBar
          barStyle="light-content"
          backgroundColor="#06101D"
        />
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>
            Technician Unavailable
          </Text>
          <Text style={styles.emptyText}>{errorMessage}</Text>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => router.replace("/technicians")}
          >
            <Text style={styles.primaryButtonText}>
              Back to Technicians
            </Text>
          </TouchableOpacity>
        </View>
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
          <TouchableOpacity
            style={styles.backButton}
            activeOpacity={0.8}
            onPress={() => router.back()}
          >
            <ArrowLeft size={20} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            Technician Profile
          </Text>
        </View>

        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <UserRound size={44} color="#FFFFFF" />
          </View>
          <Text style={styles.name}>{technician.fullName}</Text>
          <Text style={styles.specialization}>
            {technician.specialization}
          </Text>
          <View style={styles.ratingRow}>
            <Star size={17} color="#F59E0B" fill="#F59E0B" />
            <Text style={styles.ratingText}>
              {ratingSummary.average > 0
                ? ratingSummary.average.toFixed(1)
                : "New"}
            </Text>
            <Text style={styles.reviewCount}>
              ({ratingSummary.count} reviews)
            </Text>
          </View>
          <TouchableOpacity
            style={styles.requestButton}
            activeOpacity={0.85}
            onPress={() =>
              router.push({
                pathname: "/create-request",
                params: {
                  technicianId: technician.uid,
                  service: technician.specialization,
                },
              })
            }
          >
            <Wrench size={18} color="#FFFFFF" />
            <Text style={styles.requestButtonText}>
              Request Service
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>Professional Details</Text>
        <View style={styles.detailCard}>
          <DetailRow
            icon={<MapPin size={18} color="#22D3EE" />}
            label="Service Division"
            value={technician.serviceDivision}
          />
          <DetailRow
            icon={<BriefcaseBusiness size={18} color="#60A5FA" />}
            label="Experience"
            value={technician.experience}
          />
          <DetailRow
            icon={<Award size={18} color="#A78BFA" />}
            label="Qualifications"
            value={technician.qualifications}
          />
          <DetailRow
            icon={<Award size={18} color="#F59E0B" />}
            label="Certifications"
            value={technician.certifications}
          />
        </View>

        <Text style={styles.sectionTitle}>Customer Reviews</Text>
        {reviews.length > 0 ? (
          <View style={styles.reviewList}>
            {reviews.slice(0, 5).map((review) => (
              <View key={review.id} style={styles.reviewCard}>
                <View style={styles.reviewTopRow}>
                  <View style={styles.reviewStars}>
                    {Array.from({ length: 5 }).map((_, index) => (
                      <Star
                        key={index}
                        size={13}
                        color={
                          index < review.rating
                            ? "#F59E0B"
                            : "#475569"
                        }
                        fill={
                          index < review.rating
                            ? "#F59E0B"
                            : "transparent"
                        }
                      />
                    ))}
                  </View>
                  <Text style={styles.reviewDate}>
                    {review.createdAt
                      ? review.createdAt
                          .toDate()
                          .toLocaleDateString()
                      : "Recent"}
                  </Text>
                </View>
                <Text style={styles.reviewText}>
                  {review.comment || "No written comment."}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.noReviewsCard}>
            <Text style={styles.noReviewsTitle}>
              No reviews yet
            </Text>
            <Text style={styles.noReviewsText}>
              This technician has not received customer feedback yet.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.detailRow}>
      <View style={styles.detailIcon}>{icon}</View>
      <View style={styles.detailContent}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={styles.detailValue}>
          {value || "Not provided"}
        </Text>
      </View>
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
    paddingTop: 54,
    paddingBottom: 120,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
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
    marginRight: 12,
  },
  headerTitle: { color: "#FFFFFF", fontSize: 23, fontWeight: "800" },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 26,
  },
  emptyTitle: { color: "#FFFFFF", fontSize: 22, fontWeight: "800" },
  emptyText: {
    color: "#94A3B8",
    fontSize: 12,
    lineHeight: 19,
    textAlign: "center",
    marginTop: 8,
  },
  primaryButton: {
    height: 52,
    borderRadius: 12,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
    marginTop: 22,
  },
  primaryButtonText: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" },
  profileCard: {
    borderRadius: 22,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    alignItems: "center",
    padding: 22,
    marginBottom: 24,
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
  },
  name: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "800",
    marginTop: 15,
    textAlign: "center",
  },
  specialization: {
    color: "#94A3B8",
    fontSize: 12,
    marginTop: 5,
  },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
    gap: 5,
  },
  ratingText: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" },
  reviewCount: { color: "#64748B", fontSize: 11 },
  requestButton: {
    width: "100%",
    height: 52,
    borderRadius: 12,
    backgroundColor: "#2563EB",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 20,
  },
  requestButtonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" },
  sectionTitle: {
    color: "#F8FAFC",
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 10,
    marginLeft: 2,
  },
  detailCard: {
    borderRadius: 17,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    overflow: "hidden",
    marginBottom: 24,
  },
  detailRow: {
    minHeight: 74,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#17263A",
  },
  detailIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#101F30",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  detailContent: { flex: 1 },
  detailLabel: { color: "#64748B", fontSize: 10 },
  detailValue: {
    color: "#E2E8F0",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 4,
  },
  reviewList: { gap: 11 },
  reviewCard: {
    borderRadius: 16,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    padding: 14,
  },
  reviewTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  reviewStars: { flexDirection: "row", gap: 3 },
  reviewDate: { color: "#64748B", fontSize: 9 },
  reviewText: {
    color: "#CBD5E1",
    fontSize: 12,
    lineHeight: 19,
    marginTop: 10,
  },
  noReviewsCard: {
    borderRadius: 16,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    alignItems: "center",
    padding: 22,
  },
  noReviewsTitle: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
  noReviewsText: {
    color: "#64748B",
    fontSize: 11,
    lineHeight: 17,
    textAlign: "center",
    marginTop: 7,
  },
});

