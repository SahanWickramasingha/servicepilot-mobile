export type TechnicianRatingSummary = { average: number; count: number };

export type TechnicianRatingLoadState = {
  status: "loading" | "ready" | "error";
  summary: TechnicianRatingSummary | null;
  errorMessage: string;
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
  if (state.status !== "ready" || !state.summary) {
    const value = state.status === "error" ? "Ratings unavailable" : "Loading ratings...";
    return {
      value,
      label: state.status === "error" ? state.errorMessage || value : value,
      countLabel: "",
      countValue: state.status === "error" ? "Unavailable" : "Loading...",
      hasRatings: false,
    };
  }
  const { average, count } = state.summary;
  const countLabel = `${count} review${count === 1 ? "" : "s"}`;
  const value = count ? average.toFixed(1) : "No ratings yet";
  return {
    value,
    label: count ? `${value} (${countLabel})` : value,
    countLabel,
    countValue: String(count),
    hasRatings: count > 0,
  };
}
