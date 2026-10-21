import { Star } from "lucide-react-native";
import { Text, TouchableOpacity, type StyleProp, type TextStyle } from "react-native";
import { useTechnicianReviews } from "@/src/hooks/useTechnicianReviews";
import { getTechnicianRatingDisplay } from "@/src/utils/technicianRating";

/** Display-only consumer of the same session-scoped stream as profile/dashboard.
 * Parent layouts keep control of row/column styling. No projection fallback.
 */
export function TechnicianRating({ technicianId, valueStyle, countStyle, iconSize = 15 }: {
  technicianId: string;
  valueStyle?: StyleProp<TextStyle>;
  countStyle?: StyleProp<TextStyle>;
  iconSize?: number;
}) {
  const ratings = useTechnicianReviews(technicianId);
  const display = getTechnicianRatingDisplay(ratings);
  return <>
    <Star size={iconSize} color="#F59E0B" fill={display.hasRatings ? "#F59E0B" : "transparent"} />
    <Text style={valueStyle} accessibilityLabel={display.label}
      accessibilityRole={ratings.status === "error" ? "alert" : undefined} accessibilityLiveRegion="polite">{display.value}</Text>
    {ratings.status === "ready" && <Text style={countStyle ?? valueStyle}>{display.countLabel}</Text>}
    {(ratings.status === "error" || ratings.status === "stale") && <TouchableOpacity accessibilityRole="button" accessibilityLabel="Retry technician ratings" onPress={ratings.retry} style={{ minHeight: 44, justifyContent: "center" }}>
      <Text style={countStyle ?? valueStyle}>Retry</Text>
    </TouchableOpacity>}
  </>;
}
