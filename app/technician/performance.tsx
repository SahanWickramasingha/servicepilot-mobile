import { router } from "expo-router";
import {
  ArrowLeft,
  Award,
  BriefcaseBusiness,
  CheckCircle2,
  Clock3,
  Star,
  TrendingUp,
} from "lucide-react-native";
import {
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
} from "react-native";

export default function TechnicianPerformanceScreen() {
  const monthlyPerformance = [
    {
      month: "May",
      jobs: 28,
      rating: "4.7",
    },
    {
      month: "Jun",
      jobs: 31,
      rating: "4.8",
    },
    {
      month: "Jul",
      jobs: 35,
      rating: "4.8",
    },
    {
      month: "Aug",
      jobs: 30,
      rating: "4.9",
    },
  ];

  const maxJobs = Math.max(
    ...monthlyPerformance.map((item) => item.jobs)
  );

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

          <View>
            <Text style={styles.title}>
              Performance
            </Text>

            <Text style={styles.subtitle}>
              Your service statistics and ratings
            </Text>
          </View>
        </View>

        {/* Main Rating */}
        <View style={styles.ratingCard}>
          <View style={styles.ratingIcon}>
            <Star
              size={34}
              color="#F59E0B"
              fill="#F59E0B"
            />
          </View>

          <Text style={styles.ratingValue}>
            4.8
          </Text>

          <Text style={styles.ratingLabel}>
            Overall Rating
          </Text>

          <Text style={styles.reviewCount}>
            Based on 124 customer reviews
          </Text>

          <View style={styles.ratingStars}>
            {[1, 2, 3, 4, 5].map((item) => (
              <Star
                key={item}
                size={18}
                color="#F59E0B"
                fill={
                  item <= 4
                    ? "#F59E0B"
                    : "transparent"
                }
              />
            ))}
          </View>
        </View>

        {/* Stats */}
        <View style={styles.statsGrid}>
          <StatCard
            icon={
              <BriefcaseBusiness
                size={21}
                color="#60A5FA"
              />
            }
            value="124"
            label="Completed Jobs"
          />

          <StatCard
            icon={
              <CheckCircle2
                size={21}
                color="#22C55E"
              />
            }
            value="96%"
            label="Success Rate"
          />

          <StatCard
            icon={
              <Clock3
                size={21}
                color="#A78BFA"
              />
            }
            value="1h 24m"
            label="Avg. Service Time"
          />

          <StatCard
            icon={
              <TrendingUp
                size={21}
                color="#F59E0B"
              />
            }
            value="+12%"
            label="Monthly Growth"
          />
        </View>

        {/* Monthly Performance */}
        <Text style={styles.sectionTitle}>
          Monthly Performance
        </Text>

        <View style={styles.chartCard}>
          <View style={styles.chartHeader}>
            <View>
              <Text style={styles.chartTitle}>
                Completed Jobs
              </Text>

              <Text style={styles.chartSubtitle}>
                Last 4 months
              </Text>
            </View>

            <View style={styles.growthBadge}>
              <TrendingUp
                size={14}
                color="#22C55E"
              />

              <Text style={styles.growthText}>
                +12%
              </Text>
            </View>
          </View>

          <View style={styles.chart}>
            {monthlyPerformance.map((item) => {
              const height =
                (item.jobs / maxJobs) * 120;

              return (
                <View
                  key={item.month}
                  style={styles.chartColumn}
                >
                  <Text style={styles.chartValue}>
                    {item.jobs}
                  </Text>

                  <View style={styles.barTrack}>
                    <View
                      style={[
                        styles.bar,
                        {
                          height,
                        },
                      ]}
                    />
                  </View>

                  <Text style={styles.monthText}>
                    {item.month}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* Ratings */}
        <Text style={styles.sectionTitle}>
          Customer Rating Breakdown
        </Text>

        <View style={styles.breakdownCard}>
          <RatingRow
            stars={5}
            percentage={78}
            count={97}
          />

          <RatingRow
            stars={4}
            percentage={17}
            count={21}
          />

          <RatingRow
            stars={3}
            percentage={4}
            count={5}
          />

          <RatingRow
            stars={2}
            percentage={1}
            count={1}
          />

          <RatingRow
            stars={1}
            percentage={0}
            count={0}
          />
        </View>

        {/* Achievements */}
        <Text style={styles.sectionTitle}>
          Achievements
        </Text>

        <View style={styles.achievements}>
          <AchievementCard
            icon={
              <Award
                size={24}
                color="#F59E0B"
              />
            }
            title="Top Technician"
            description="Top rated technician this month."
          />

          <AchievementCard
            icon={
              <CheckCircle2
                size={24}
                color="#22C55E"
              />
            }
            title="100+ Jobs"
            description="Completed more than 100 service jobs."
          />

          <AchievementCard
            icon={
              <Star
                size={24}
                color="#A78BFA"
              />
            }
            title="Customer Favourite"
            description="Maintained a rating above 4.5."
          />
        </View>
      </ScrollView>
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
      <View style={styles.statIcon}>
        {icon}
      </View>

      <Text style={styles.statValue}>
        {value}
      </Text>

      <Text style={styles.statLabel}>
        {label}
      </Text>
    </View>
  );
}

function RatingRow({
  stars,
  percentage,
  count,
}: {
  stars: number;
  percentage: number;
  count: number;
}) {
  return (
    <View style={styles.ratingRow}>
      <View style={styles.ratingNumber}>
        <Text style={styles.ratingRowText}>
          {stars}
        </Text>

        <Star
          size={13}
          color="#F59E0B"
          fill="#F59E0B"
        />
      </View>

      <View style={styles.ratingTrack}>
        <View
          style={[
            styles.ratingFill,
            {
              width: `${percentage}%`,
            },
          ]}
        />
      </View>

      <Text style={styles.ratingPercentage}>
        {percentage}%
      </Text>

      <Text style={styles.ratingCountSmall}>
        {count}
      </Text>
    </View>
  );
}

function AchievementCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <View style={styles.achievementCard}>
      <View style={styles.achievementIcon}>
        {icon}
      </View>

      <View style={styles.achievementContent}>
        <Text style={styles.achievementTitle}>
          {title}
        </Text>

        <Text style={styles.achievementText}>
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

  title: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "800",
  },

  subtitle: {
    color: "#64748B",
    fontSize: 9,
    marginTop: 4,
  },

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
    backgroundColor:
      "rgba(245,158,11,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },

  ratingValue: {
    color: "#FFFFFF",
    fontSize: 34,
    fontWeight: "800",
    marginTop: 12,
  },

  ratingLabel: {
    color: "#CBD5E1",
    fontSize: 11,
    fontWeight: "700",
  },

  reviewCount: {
    color: "#64748B",
    fontSize: 8,
    marginTop: 4,
  },

  ratingStars: {
    flexDirection: "row",
    gap: 5,
    marginTop: 13,
  },

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

  statLabel: {
    color: "#64748B",
    fontSize: 8,
    marginTop: 3,
  },

  sectionTitle: {
    color: "#F8FAFC",
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 10,
  },

  chartCard: {
    borderRadius: 17,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    padding: 15,
    marginBottom: 25,
  },

  chartHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },

  chartTitle: {
    color: "#E2E8F0",
    fontSize: 11,
    fontWeight: "700",
  },

  chartSubtitle: {
    color: "#64748B",
    fontSize: 8,
    marginTop: 3,
  },

  growthBadge: {
    height: 28,
    borderRadius: 9,
    backgroundColor:
      "rgba(34,197,94,0.07)",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
  },

  growthText: {
    color: "#22C55E",
    fontSize: 8,
    fontWeight: "700",
  },

  chart: {
    height: 165,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-around",
  },

  chartColumn: {
    alignItems: "center",
    flex: 1,
  },

  chartValue: {
    color: "#94A3B8",
    fontSize: 8,
    marginBottom: 5,
  },

  barTrack: {
    height: 120,
    width: 25,
    borderRadius: 8,
    backgroundColor: "#101F30",
    justifyContent: "flex-end",
    overflow: "hidden",
  },

  bar: {
    width: "100%",
    borderRadius: 8,
    backgroundColor: "#15803D",
  },

  monthText: {
    color: "#64748B",
    fontSize: 8,
    marginTop: 7,
  },

  breakdownCard: {
    borderRadius: 17,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    padding: 15,
    gap: 14,
    marginBottom: 25,
  },

  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  ratingNumber: {
    width: 38,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },

  ratingRowText: {
    color: "#CBD5E1",
    fontSize: 9,
    fontWeight: "700",
  },

  ratingTrack: {
    flex: 1,
    height: 7,
    borderRadius: 8,
    backgroundColor: "#101F30",
    overflow: "hidden",
  },

  ratingFill: {
    height: "100%",
    borderRadius: 8,
    backgroundColor: "#F59E0B",
  },

  ratingPercentage: {
    width: 38,
    color: "#94A3B8",
    fontSize: 8,
    textAlign: "right",
  },

  ratingCountSmall: {
    width: 28,
    color: "#475569",
    fontSize: 8,
    textAlign: "right",
  },

  achievements: {
    gap: 10,
  },

  achievementCard: {
    minHeight: 82,
    borderRadius: 16,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 13,
  },

  achievementIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: "#101F30",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 11,
  },

  achievementContent: {
    flex: 1,
  },

  achievementTitle: {
    color: "#E2E8F0",
    fontSize: 10,
    fontWeight: "700",
  },

  achievementText: {
    color: "#64748B",
    fontSize: 8,
    lineHeight: 13,
    marginTop: 4,
  },
});