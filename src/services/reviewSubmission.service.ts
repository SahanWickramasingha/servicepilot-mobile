import { collection, doc } from "firebase/firestore";
import { auth, db } from "@/src/firebase/config";
import { getCustomerReviewContext, getReviewForRequest, getReviewId, submitServiceReview, type ServiceReview } from "./review.service";
import { cleanupReviewUploads, publishReviewPhotos, uploadReviewPhoto, type SelectedReviewPhoto } from "./reviewPhotos.service";
import { REVIEW_PHOTO_MAX, reviewPhotoPath, validateReview } from "@/src/utils/reviewValidation";

export type ReviewSubmissionResult = { review: ServiceReview; created: boolean; warning?: string };
const submissions = new Map<string, Promise<ReviewSubmissionResult>>();
// Only paths created by this client are retained for safe reconciliation after
// an ambiguous network failure. A later immutable review proves which are unused.
const pendingCleanup = new Map<string, Set<string>>();

async function reconcileUploads(key: string, saved: ServiceReview): Promise<boolean> {
  const paths = pendingCleanup.get(key);
  if (!paths) return true;
  const unused = [...paths].filter((path) => !saved.photoPaths?.includes(path));
  const cleaned = await cleanupReviewUploads(unused);
  if (cleaned) pendingCleanup.delete(key);
  return cleaned;
}
export function submitReviewWithPhotos(input: { requestId: string; rating: number; comment: string; photos: SelectedReviewPhoto[];
  onProgress?: (message: string) => void; signal?: AbortSignal }): Promise<ReviewSubmissionResult> {
  const uid = auth.currentUser?.uid;
  if (!uid) return Promise.reject(new Error("Please sign in again."));
  const key = `${uid}/${input.requestId}`;
  const pending = submissions.get(key);
  if (pending) return pending;
  const saving = performSubmission(input, uid).finally(() => { if (submissions.get(key) === saving) submissions.delete(key); });
  submissions.set(key, saving);
  return saving;
}

async function performSubmission(input: Parameters<typeof submitReviewWithPhotos>[0], uid: string): Promise<ReviewSubmissionResult> {
  const error = validateReview(input.rating, input.comment);
  if (error) throw new Error(error);
  if (input.photos.length > REVIEW_PHOTO_MAX) throw new Error("You can add up to 5 photos.");
  const check = () => {
    if (auth.currentUser?.uid !== uid || input.signal?.aborted) throw new Error("Submission stopped. Please reopen the request.");
  };
  check();
  const context = await getCustomerReviewContext(input.requestId);
  check();
  const cleanupKey = `${uid}/${input.requestId}`;
  if (context.existingReview) {
    await reconcileUploads(cleanupKey, context.existingReview);
    return { review: context.existingReview, created: false };
  }
  const attemptId = doc(collection(db, "service_reviews")).id; // ID allocation is local; no document write.
  const attemptedPaths: string[] = [];
  let saveStarted = false;
  let result: ReviewSubmissionResult;
  try {
    for (const [index, photo] of input.photos.entries()) {
      check();
      const path = reviewPhotoPath(uid, getReviewId(input.requestId, uid), attemptId, index);
      attemptedPaths.push(path);
      await uploadReviewPhoto(path, photo, context, attemptId,
        (fraction) => input.onProgress?.(`Uploading photo ${index + 1}/${input.photos.length}: ${Math.round(fraction * 100)}%`), input.signal);
    }
    check();
    input.onProgress?.("Saving your review…");
    saveStarted = true;
    const saved = await submitServiceReview({ requestId: input.requestId, customerId: uid, rating: input.rating, comment: input.comment,
      photoPaths: attemptedPaths, photoAttemptId: attemptedPaths.length ? attemptId : undefined });
    result = { review: saved.review, created: true, warning: saved.notificationWarning };
  } catch (error) {
    // Distinguish a concurrent/acknowledgement-lost save from a failed save.
    // A failed verification never licenses deleting a saved review's images:
    // Storage independently protects referenced paths against cleanup races.
    let existing: ServiceReview | null = null;
    try { if (auth.currentUser?.uid === uid) existing = await getReviewForRequest(input.requestId, uid); } catch { /* retain original error */ }
    const unused = attemptedPaths.filter((path) => !existing?.photoPaths?.includes(path));
    const code = (error as { code?: string }).code;
    const definiteRejection = ["permission-denied", "invalid-argument", "failed-precondition", "not-found", "already-exists", "aborted"].includes(code ?? "");
    // A server read of "no review" cannot disprove a delayed commit. Do not
    // race cleanup against an ambiguous commit; retain until a saved review
    // provides an immutable reference set, or until an operator checks it.
    const safeToDelete = !saveStarted || !!existing || definiteRejection;
    const cleaned = safeToDelete ? await cleanupReviewUploads(unused) : unused.length === 0;
    if (!cleaned) pendingCleanup.set(cleanupKey, new Set([...(pendingCleanup.get(cleanupKey) ?? []), ...unused]));
    if (existing) result = { review: existing, created: false };
    else throw new Error(`${error instanceof Error ? error.message : "Unable to submit review. Please retry."}${cleaned ? "" : safeToDelete ? " Some unused uploads could not be removed; no saved review photos were deleted." : " Photo uploads were retained because the save could not be confirmed. Reopen this request or retry to check for your saved review."}`);
  }
  await reconcileUploads(cleanupKey, result.review);
  if (result.review.photoPaths?.length && auth.currentUser?.uid === uid) {
    input.onProgress?.("Preparing saved photos for viewing…");
    try { await publishReviewPhotos(result.review.photoPaths); }
    catch { result.warning = [result.warning, "Your review and photos are saved. Open a photo and retry if it is not visible yet."].filter(Boolean).join(" "); }
  }
  return result;
}
