import { router } from "expo-router";
import {
  ArrowLeft,
  BriefcaseBusiness,
  CheckCircle2,
  Clock3,
  Star,
} from "lucide-react-native";
import {
  ActivityIndicator,
  FlatList,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { auth } from "@/src/firebase/config";
import { useTechnicianWorkspace } from "@/src/hooks/useTechnicianWorkspace";
import { useTechnicianReviews } from "@/src/hooks/useTechnicianReviews";
import { useTechnicianReviewPages } from "@/src/hooks/useTechnicianReviewPages";
import { type TechnicianReviewSummary } from "@/src/services/technician.service";
import { formatTechnicianReviewDate, getTechnicianRatingDisplay } from "@/src/utils/technicianRating";
import { getReviewDisplayName, getReviewerInitials } from "@/src/utils/reviewAuthor";
import { ReviewPhotos } from "@/src/components/reviews/ReviewPhotos";
import {
  getCompletedTechnicianRequests,
  getUpcomingTechnicianRequests,
} from "@/src/utils/technicianRequests";

export default function TechnicianPerformanceScreen() {
  const { uid, profile, requests, loading, errorMessage } =
    useTechnicianWorkspace();
  const ownUid = profile?.uid === uid && uid === auth.currentUser?.uid ? uid : null;
  const ratings = useTechnicianReviews(ownUid);
  const pages = useTechnicianReviewPages(ownUid, ratings);
  const ratingDisplay = getTechnicianRatingDisplay(ratings);

  if (loading) {
    return <StateScreen message="Loading performance..." />;
  }

  if (errorMessage || !profile || !ownUid) {
    return (
      <StateScreen
        title="Performance unavailable"
        message={errorMessage || "Unable to load performance data."}
      />
    );
  }

  const completedJobs = getCompletedTechnicianRequests(requests).length;
  const upcomingJobs = getUpcomingTechnicianRequests(requests).length;
  const inProgressJobs = requests.filter(
    (request) => request.status === "in_progress"
  ).length;

  return (
    <View style={styles.container}>
      <StatusBar
        barStyle="light-content"
        backgroundColor="#06101D"
      />

      <FlatList
        data={pages.reviews}
        keyExtractor={(review) => review.id}
        renderItem={({ item }) => <ReviewCard review={item} />}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        ListHeaderComponent={<>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            activeOpacity={0.8}
            onPress={() => router.back()}
          >
            <ArrowLeft size={20} color="#FFFFFF" />
          </TouchableOpacity>

          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Performance & Reviews</Text>
            <Text style={styles.subtitle}>
              Your real service statistics and ratings
            </Text>
          </View>
        </View>

        <View style={styles.ratingCard}>
          <View style={styles.ratingIcon}>
            <Star
              size={34}
              color="#F59E0B"
              fill={ratingDisplay.hasRatings ? "#F59E0B" : "transparent"}
            />
          </View>

          <Text style={styles.ratingValue}>
            {ratingDisplay.value}
          </Text>

          <Text style={styles.ratingLabel}>Overall Rating</Text>

          <Text style={styles.reviewCount}>
            {ratings.status === "ready" ? ratingDisplay.label : ratings.status === "stale" ? ratingDisplay.countLabel : ""}
          </Text>
        </View>

        <View style={styles.statsGrid}>
          <StatCard
            icon={<BriefcaseBusiness size={21} color="#60A5FA" />}
            value={String(completedJobs)}
            label="Completed Jobs"
          />

          <StatCard
            icon={<CheckCircle2 size={21} color="#22C55E" />}
            value={String(upcomingJobs)}
            label="Upcoming Jobs"
          />

          <StatCard
            icon={<Clock3 size={21} color="#A78BFA" />}
            value={String(inProgressJobs)}
            label="In Progress"
          />

          <StatCard
            icon={<Star size={21} color="#F59E0B" />}
            value={ratingDisplay.countValue}
            label="Reviews"
          />
        </View>

        <Text style={styles.sectionTitle}>Customer Reviews</Text>
        <Text style={styles.reviewHint}>Newest first. Reviews with unavailable dates appear after dated reviews.</Text>
        {pages.listUpdated && <Text accessibilityLiveRegion="polite" style={styles.reviewHint}>Reviews updated. Load older reviews again to continue.</Text>}
        {ratings.status === "loading" && <View style={styles.emptyCard}>
          <ActivityIndicator color="#3B82F6" /><Text style={styles.emptyText}>Loading reviews...</Text>
        </View>}
        {ratings.status === "error" && <View style={styles.emptyCard}>
          <Text accessibilityRole="alert" style={styles.emptyText}>{ratings.errorMessage}</Text>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Retry reviews" style={styles.retryButton} onPress={ratings.retry}><Text style={styles.buttonText}>Retry</Text></TouchableOpacity>
        </View>}
        {ratings.status === "stale" && <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Reviews may be out of date</Text>
          <Text accessibilityRole="alert" style={styles.emptyText}>{ratings.errorMessage}</Text>
          <TouchableOpacity accessibilityRole="button" style={styles.retryButton} onPress={ratings.retry}><Text style={styles.buttonText}>Retry</Text></TouchableOpacity>
        </View>}
        {ratings.status === "ready" && ratings.summary?.count === 0 && <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No reviews yet</Text>
          <Text style={styles.emptyText}>Customer reviews of your completed services will appear here.</Text>
        </View>}
        </>}
        ListFooterComponent={<>
        {!!pages.loadMoreError && <Text accessibilityRole="alert" style={styles.pageError}>{pages.loadMoreError}</Text>}
        {ratings.status === "ready" && pages.hasMore && <>
          {pages.scanningLegacy && <Text style={styles.reviewHint}>Older records are checked in small batches for reviews with unavailable dates.</Text>}
          <TouchableOpacity accessibilityRole="button" disabled={pages.loadingMore} style={styles.retryButton} onPress={pages.loadMore}>
            {pages.loadingMore ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>{pages.loadMoreError ? "Retry loading reviews" : "Load More Reviews"}</Text>}
          </TouchableOpacity>
        </>}
        <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Analytics</Text>

        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No analytics model yet</Text>
          <Text style={styles.emptyText}>
            Monthly growth, service-time averages, and rating breakdowns
            will appear here after those real data points are stored.
          </Text>
        </View>
        </>}
      />
    </View>
  );
}

function ReviewCard({ review }: { review: TechnicianReviewSummary }) {
  const name = getReviewDisplayName(review);
  return <View style={styles.reviewCard}>
    <View style={styles.reviewHeader}>
      <View style={styles.reviewerAvatar}><Text style={styles.buttonText}>{getReviewerInitials(name)}</Text></View>
      <View style={{ flex: 1 }}><Text style={styles.reviewHint}>Reviewed by</Text>
        <Text style={styles.reviewerName}>{name ?? "Reviewer name unavailable"}</Text></View>
      <Text style={styles.reviewDate}>{formatTechnicianReviewDate(review.createdAt)}</Text>
    </View>
    <View style={styles.stars} accessible accessibilityLabel={`${review.rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((star) => <Star key={star} size={17} color="#F59E0B" fill={star <= review.rating ? "#F59E0B" : "transparent"} />)}
      <Text style={styles.reviewDate}>{review.rating}/5</Text>
    </View>
    {!!review.comment.trim() && <Text style={styles.reviewComment}>{review.comment}</Text>}
    <ReviewPhotos paths={review.photoPaths} customerId={review.customerId} />
  </View>;
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

function StatCard({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
}) {
  return (
    <View style={styles.statCard}>
      <View style={styles.statIcon}>{icon}</View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  reviewCard: { borderRadius: 17, backgroundColor: "#0D1B2A", borderWidth: 1, borderColor: "#17263A", padding: 18, marginTop: 12 },
  reviewHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  reviewerAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#17263A", alignItems: "center", justifyContent: "center" },
  reviewerName: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  reviewDate: { color: "#94A3B8", fontSize: 11 },
  reviewHint: { color: "#94A3B8", fontSize: 12, marginBottom: 6, lineHeight: 18 },
  stars: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 14 },
  reviewComment: { color: "#CBD5E1", fontSize: 14, lineHeight: 21, marginTop: 10 },
  retryButton: { backgroundColor: "#2563EB", borderRadius: 12, minHeight: 44, padding: 12, alignItems: "center", justifyContent: "center", marginTop: 12 },
  buttonText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },
  pageError: { color: "#FCA5A5", fontSize: 13, marginTop: 12 },
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
    textAlign: "center",
  },
  stateText: {
    color: "#94A3B8",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 10,
    textAlign: "center",
  },
  content: {
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    paddingHorizontal: 18,
    paddingTop: 54,
    paddingBottom: 70,
  },
  header: { flexDirection: "row", alignItems: "center", marginBottom: 24 },
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
  title: { color: "#FFFFFF", fontSize: 24, fontWeight: "800" },
  subtitle: { color: "#64748B", fontSize: 9, marginTop: 4 },
  ratingCard: {
    borderRadius: 20,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    alignItems: "center",
    paddingVertical: 27,
    marginBottom: 15,
  },
  ratingIcon: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: "rgba(245,158,11,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  ratingValue: {
    color: "#FFFFFF",
    fontSize: 34,
    fontWeight: "800",
    marginTop: 12,
  },
  ratingLabel: { color: "#CBD5E1", fontSize: 11, fontWeight: "700" },
  reviewCount: { color: "#64748B", fontSize: 8, marginTop: 4 },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 10,
    marginBottom: 26,
  },
  statCard: {
    width: "48.5%",
    minHeight: 110,
    borderRadius: 16,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    padding: 14,
  },
  statIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: "#101F30",
    alignItems: "center",
    justifyContent: "center",
  },
  statValue: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "800",
    marginTop: 10,
  },
  statLabel: { color: "#64748B", fontSize: 8, marginTop: 3 },
  sectionTitle: {
    color: "#F8FAFC",
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 10,
  },
  emptyCard: {
    borderRadius: 17,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    padding: 18,
  },
  emptyTitle: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" },
  emptyText: {
    color: "#94A3B8",
    fontSize: 10,
    lineHeight: 17,
    marginTop: 6,
  },
});
