import { onAuthStateChanged } from "firebase/auth";
import { useEffect, useState } from "react";

import { auth } from "@/src/firebase/config";
import {
  subscribeToTechnicianReviews,
  type TechnicianReviewSummary,
} from "@/src/services/technician.service";
import {
  summarizeTechnicianReviews,
  type TechnicianRatingLoadState,
} from "@/src/utils/technicianRating";

type ReviewsState = TechnicianRatingLoadState & {
  reviews: TechnicianReviewSummary[];
};
type SessionState = ReviewsState & {
  viewerUid: string | null;
  technicianId: string | null;
};
const loadingState: ReviewsState = {
  status: "loading", summary: null, reviews: [], errorMessage: "",
};

export function useTechnicianReviews(technicianId: string | null): ReviewsState {
  const [state, setState] = useState<SessionState>({
    ...loadingState, viewerUid: null, technicianId: null,
  });

  useEffect(() => {
    let active = true;
    let generation = 0;
    let unsubscribeReviews: (() => void) | undefined;
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (!active) return;
      const version = ++generation;
      unsubscribeReviews?.();
      unsubscribeReviews = undefined;
      const identity = { viewerUid: user?.uid ?? null, technicianId };
      setState({ ...loadingState, ...identity });
      if (!user || !technicianId) return;

      const isCurrent = () => active && version === generation && auth.currentUser?.uid === user.uid;
      unsubscribeReviews = subscribeToTechnicianReviews(
        technicianId,
        (reviews, metadata) => {
          // A cache-only empty result cannot prove that a technician has no reviews.
          // Wait for the complete server query, including metadata-only confirmation.
          if (!isCurrent() || metadata.fromCache || metadata.hasPendingWrites) return;
          setState({ ...identity, status: "ready", reviews,
            summary: summarizeTechnicianReviews(reviews), errorMessage: "" });
        },
        (error) => {
          if (!isCurrent()) return;
          const denied = (error as Error & { code?: string }).code === "permission-denied";
          setState({ ...loadingState, ...identity, status: "error",
            errorMessage: denied ? "Ratings unavailable: permission denied." : "Unable to load ratings. Please try again." });
        }
      );
    });
    return () => {
      active = false;
      generation++;
      unsubscribeReviews?.();
      unsubscribeAuth();
    };
  }, [technicianId]);

  // Never render a previous account/technician's result while effects catch up.
  if (!technicianId || state.technicianId !== technicianId || state.viewerUid !== (auth.currentUser?.uid ?? null)) {
    return loadingState;
  }
  return state;
}
