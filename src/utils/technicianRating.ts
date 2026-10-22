export type TechnicianRatingSummary = { average: number; count: number };
export const REVIEWS_UNAVAILABLE_MESSAGE = "Reviews are temporarily unavailable.";

/** Missing/invalid legacy dates stay unknown; never replace them with today. */
export function reviewTimestampMillis(value: unknown): number | null {
  try {
    if (!value || typeof (value as { toMillis?: unknown }).toMillis !== "function") return null;
    const millis = (value as { toMillis(): number }).toMillis();
    return Number.isFinite(millis) && !Number.isNaN(new Date(millis).getTime()) ? millis : null;
  } catch { return null; }
}

export function compareTechnicianReviews(first: { id: string; createdAt?: unknown }, second: { id: string; createdAt?: unknown }): number {
  const a = reviewTimestampMillis(first.createdAt), b = reviewTimestampMillis(second.createdAt);
  if (a !== b) return a === null ? 1 : b === null ? -1 : b - a;
  return first.id === second.id ? 0 : first.id > second.id ? -1 : 1;
}

export function formatTechnicianReviewDate(value: unknown): string {
  const millis = reviewTimestampMillis(value);
  return millis === null ? "Date unavailable" : new Date(millis).toLocaleDateString(undefined, {
    year: "numeric", month: "short", day: "numeric",
  });
}

export type TechnicianRatingLoadState = {
  status: "loading" | "ready" | "stale" | "error";
  summary: TechnicianRatingSummary | null;
  errorMessage: string;
  updating?: boolean;
};

// Match validReviewCreate: only integer stars 1–5 are eligible. Eligibility,
// request ownership and duplicate protection remain enforced by Firestore rules.
export function isEligibleReviewRating(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5;
}

// The caller must supply the complete technician-scoped query, never a page.
export function summarizeTechnicianReviews(
  reviews: readonly { rating: number }[]
): TechnicianRatingSummary {
  let total = 0;
  let count = 0;
  for (const review of reviews) {
    if (isEligibleReviewRating(review.rating)) {
      total += review.rating;
      count++;
    }
  }
  return { average: count ? total / count : 0, count };
}

export function getTechnicianRatingDisplay(state: TechnicianRatingLoadState) {
  // Numeric/count strings never contain connection feedback. Each surface
  // renders a single status underneath its summary, separately from the badge.
  if (!state.summary || (state.status !== "ready" && state.status !== "stale")) {
    const value = state.status === "error" ? "Ratings unavailable" : "Loading ratings...";
    return {
      value,
      label: value,
      countLabel: "",
      countValue: state.status === "error" ? "Unavailable" : "Loading...",
      hasRatings: false,
    };
  }
  const { average, count } = state.summary;
  const countLabel = `${count} review${count === 1 ? "" : "s"}`;
  const value = count ? average.toFixed(1) : state.status === "ready" ? "No ratings yet" : "Ratings unconfirmed";
  return {
    value,
    label: count ? `${value} (${countLabel})` : value,
    countLabel,
    countValue: String(count),
    hasRatings: count > 0,
  };
}
