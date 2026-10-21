import { useEffect, useRef, useState } from "react";
import { auth } from "@/src/firebase/config";
import { getTechnicianReviewsPage, type TechnicianReviewCursor, type TechnicianReviewSummary } from "@/src/services/technician.service";
import { type useTechnicianReviews } from "@/src/hooks/useTechnicianReviews";
import { compareTechnicianReviews } from "@/src/utils/technicianRating";
import { rebaseReviewPages } from "@/src/utils/reviewPagination";

/** Explicit paging for the owner screen. Totals remain the shared server summary. */
export function useTechnicianReviewPages(technicianId: string | null, ratings: ReturnType<typeof useTechnicianReviews>) {
  const [pages, setPages] = useState<{ uid: string | null; viewer: string | null; head: TechnicianReviewSummary[]; extra: TechnicianReviewSummary[]; cursor: TechnicianReviewCursor | null; headCursor: TechnicianReviewCursor | null; restarted?: boolean; loading: boolean; error: string }>(
    { uid: null, viewer: null, head: [], extra: [], cursor: null, headCursor: null, loading: false, error: "" });
  const viewer = auth.currentUser?.uid ?? null;
  const generation = useRef(0), busy = useRef(false), mounted = useRef(false);
  useEffect(() => {
    mounted.current = true; const version = ++generation.current; busy.current = false;
    setPages((previous) => ({ uid: technicianId, viewer, loading: false, error: "",
      ...(previous.uid === technicianId && previous.viewer === viewer && ratings.summary?.count !== 0 && (ratings.status === "ready" || ratings.status === "stale")
        ? rebaseReviewPages(previous, ratings.reviews, ratings.cursor)
        : { head: ratings.reviews, extra: [], cursor: ratings.cursor, headCursor: ratings.cursor }) }));
    return () => { mounted.current = false; generation.current = version + 1; busy.current = false; };
  }, [technicianId, viewer, ratings.reviews, ratings.cursor, ratings.status, ratings.summary?.count]);

  const owns = !!technicianId && technicianId === auth.currentUser?.uid;
  const current = pages.uid === technicianId && pages.viewer === viewer;
  const rebased = current && ratings.summary?.count !== 0 ? rebaseReviewPages(pages, ratings.reviews, ratings.cursor) : { head: ratings.reviews, extra: [], cursor: ratings.cursor, restarted: false };
  const cursor = rebased.cursor;
  const loadMore = async () => {
    if (!owns || !mounted.current || busy.current || ratings.status !== "ready" || !cursor) return;
    busy.current = true;
    const version = generation.current;
    const valid = () => mounted.current && version === generation.current && technicianId === auth.currentUser?.uid;
    setPages((previous) => ({ ...previous, loading: true, error: "" }));
    try {
      const page = await getTechnicianReviewsPage(technicianId, cursor);
      if (valid()) setPages((previous) => ({ ...previous, extra: [...previous.extra, ...page.reviews], cursor: page.cursor, loading: false }));
    } catch (error) {
      if (valid()) setPages((previous) => ({ ...previous, loading: false,
        error: (error as { code?: string }).code === "permission-denied" ? "Unable to load more reviews: permission denied." : "Unable to load more reviews. Check your connection and retry." }));
    } finally { if (valid()) busy.current = false; }
  };
  const rows = owns && (ratings.status === "ready" || ratings.status === "stale") ? [...new Map([...ratings.reviews, ...rebased.extra].map((review) => [review.id, review])).values()].sort(compareTechnicianReviews) : [];
  return { reviews: rows, hasMore: owns && !!cursor && rows.length < (ratings.summary?.count ?? Infinity), loadingMore: current && pages.loading,
    loadMoreError: current ? pages.error : "", loadMore, scanningLegacy: cursor?.kind === "undated", listUpdated: rebased.restarted === true };
}
