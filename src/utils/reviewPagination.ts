import { compareTechnicianReviews } from "./technicianRating";
import type { TechnicianReviewCursor, TechnicianReviewSummary } from "@/src/services/technician.service";
import { TECHNICIAN_REVIEWS_PAGE_SIZE } from "@/src/services/technician.service";

export type ReviewPages = {
  head: TechnicianReviewSummary[]; extra: TechnicianReviewSummary[]; cursor: TechnicianReviewCursor | null;
  headCursor: TechnicianReviewCursor | null;
  restarted?: boolean;
};
/** Preserve the contiguous loaded tail when new reviews push rows out of the
 * limited head. ID deduplication alone would lose those displaced boundary rows. */
export function rebaseReviewPages(previous: ReviewPages, head: TechnicianReviewSummary[], cursor: TechnicianReviewCursor | null): ReviewPages {
  if (previous.head === head && previous.headCursor === cursor) return previous;
  const ids = new Set(head.map((row) => row.id));
  const overlaps = previous.head.some((row) => ids.has(row.id));
  // A full, disjoint new window can hide an arbitrary number of intervening
  // reviews. Restart at its cursor instead of presenting a tail with a gap.
  if (!overlaps && previous.head.length >= TECHNICIAN_REVIEWS_PAGE_SIZE && head.length >= TECHNICIAN_REVIEWS_PAGE_SIZE) return { head, extra: [], cursor, headCursor: cursor, restarted: true };
  const last = head.at(-1);
  const extra = [...new Map([...previous.head, ...previous.extra]
    .filter((row) => !ids.has(row.id) && (!last || compareTechnicianReviews(row, last) > 0))
    .map((row) => [row.id, row])).values()].sort(compareTechnicianReviews);
  let tailCursor = extra.length ? previous.cursor ?? cursor : cursor;
  if (tailCursor?.kind === "dated" && cursor?.kind === "dated" && tailCursor.includeUndated !== cursor.includeUndated) tailCursor = { ...tailCursor, includeUndated: cursor.includeUndated };
  return { head, extra, cursor: tailCursor, headCursor: cursor, restarted: false };
}
