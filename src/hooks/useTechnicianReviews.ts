import { onAuthStateChanged } from "firebase/auth";
import { useCallback, useEffect, useState } from "react";
import { useFocusEffect } from "expo-router";
import { AppState } from "react-native";

import { auth } from "@/src/firebase/config";
import {
  subscribeToTechnicianReviews,
  retryTechnicianReviews,
  refreshTechnicianReviews,
  type TechnicianReviewCursor,
  type TechnicianReviewSummary,
} from "@/src/services/technician.service";
import { REVIEWS_UNAVAILABLE_MESSAGE, type TechnicianRatingLoadState } from "@/src/utils/technicianRating";

type ReviewsState = TechnicianRatingLoadState & {
  reviews: TechnicianReviewSummary[];
  cursor: TechnicianReviewCursor | null;
};
type SessionState = ReviewsState & {
  viewerUid: string | null;
  technicianId: string | null;
};
const loadingState: ReviewsState = {
  status: "loading", summary: null, reviews: [], cursor: null, errorMessage: "",
};

export function useTechnicianReviews(technicianId: string | null): ReviewsState & { retry: () => void } {
  const [state, setState] = useState<SessionState>({
    ...loadingState, viewerUid: null, technicianId: null,
  });
  useFocusEffect(useCallback(() => {
    if (!technicianId) return;
    refreshTechnicianReviews(technicianId);
    // App foregrounding does not necessarily refocus a still-visible route.
    // Refresh full-history aggregates even if the bounded head never changed.
    let previous = AppState.currentState;
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active" && previous !== "active") refreshTechnicianReviews(technicianId);
      previous = state;
    });
    return () => listener.remove();
  }, [technicianId]));

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
        (reviews, metadata, summary, cursor, connection) => {
          // A cache-only empty result cannot prove that a technician has no reviews.
          // Wait for server aggregation over ALL eligible reviews, never this page.
          if (!isCurrent()) return;
          if (!summary) {
            if (connection === "updating") setState({ ...loadingState, ...identity, updating: true });
            return;
          }
          const stale = metadata.fromCache || metadata.hasPendingWrites;
          setState({ ...identity, status: stale ? "stale" : "ready", reviews,
            summary, cursor: cursor ?? null, updating: connection === "updating",
            errorMessage: stale && connection !== "updating" ? "Showing saved ratings" : "" });
        },
        (error) => {
          if (!isCurrent()) return;
          const code = (error as Error & { code?: string }).code?.replace(/^firestore\//, "");
          const denied = code === "permission-denied";
          const invalidPrecondition = code === "failed-precondition";
          setState((previous) => {
            const retain = !denied && !invalidPrecondition && !!previous.summary &&
              previous.viewerUid === identity.viewerUid && previous.technicianId === technicianId;
            return { ...(retain ? previous : loadingState), ...identity, status: retain ? "stale" : "error", updating: false,
              errorMessage: retain ? "Showing saved ratings" : REVIEWS_UNAVAILABLE_MESSAGE };
          });
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

  const retry = () => {
    if (!technicianId || state.viewerUid !== auth.currentUser?.uid || state.technicianId !== technicianId) return;
    // Keep the saved values visible; the shared attempt publishes progress to
    // every subscriber, including this screen. Never erase them on a Retry tap.
    retryTechnicianReviews(technicianId);
  };
  // Never render a previous account/technician's result while effects catch up.
  if (!technicianId || state.technicianId !== technicianId || state.viewerUid !== (auth.currentUser?.uid ?? null)) {
    return { ...loadingState, retry };
  }
  return { ...state, retry };
}
