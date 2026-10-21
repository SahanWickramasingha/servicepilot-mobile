import {
  collection, doc, getDocFromServer, getDocsFromServer, limit, query,
  runTransaction, serverTimestamp, Timestamp, where,
} from "firebase/firestore";
import { auth, db } from "@/src/firebase/config";
import { createPersonalNotification } from "@/src/services/notification.service";
import { normalizeReviewAuthorName } from "@/src/utils/reviewAuthor";
import { reviewTechnicianId, validateReview, validateReviewPhotos } from "@/src/utils/reviewValidation";

export interface ServiceReview {
  id: string; requestId: string; customerId: string; technicianId: string;
  customerName?: string; rating: number; comment: string; createdAt?: Timestamp;
  photoPaths?: string[]; photoAttemptId?: string;
}
export type ReviewContext = {
  requestId: string; customerId: string; technicianId: string;
  technicianName: string; title: string; existingReview: ServiceReview | null;
};
export function getReviewId(requestId: string, customerId: string): string { return `${requestId}_${customerId}`; }

function requireCustomer(customerId: string) {
  if (!customerId || auth.currentUser?.uid !== customerId || auth.currentUser.emailVerified === false) {
    throw new Error("Please sign in as the verified customer who completed this request.");
  }
}
function validateContext(data: Record<string, unknown> | undefined, profile: Record<string, unknown> | undefined, customerId: string, writing = true) {
  requireCustomer(customerId);
  if (!data || data.customerId !== customerId || data.status !== "completed") throw new Error("Only your own completed requests can be reviewed.");
  if (!profile || profile.role !== "customer" || (profile.accountStatus && profile.accountStatus !== "active") || profile.lifecyclePending === true) {
    throw new Error("An active Customer account is required to review this service.");
  }
  const customerName = profile.fullName;
  if (writing && (typeof customerName !== "string" || !normalizeReviewAuthorName(customerName) || customerName.length > 80)) {
    throw new Error("Please update your customer profile with your name before reviewing.");
  }
  return { technicianId: reviewTechnicianId(data), customerName };
}
function mapReview(id: string, data: Record<string, unknown>): ServiceReview {
  return { id, requestId: String(data.requestId ?? ""), customerId: String(data.customerId ?? ""),
    technicianId: String(data.technicianId ?? ""), customerName: typeof data.customerName === "string" ? data.customerName : undefined,
    rating: Number(data.rating ?? 0), comment: String(data.comment ?? ""), createdAt: data.createdAt as Timestamp | undefined,
    photoPaths: Array.isArray(data.photoPaths) ? data.photoPaths.filter((path): path is string => typeof path === "string").slice(0, 5) : [],
    photoAttemptId: typeof data.photoAttemptId === "string" ? data.photoAttemptId : undefined };
}
export async function getReviewForRequest(requestId: string, customerId: string): Promise<ServiceReview | null> {
  requireCustomer(customerId);
  const snapshot = await getDocsFromServer(query(collection(db, "service_reviews"),
    where("requestId", "==", requestId), where("customerId", "==", customerId), limit(1)));
  requireCustomer(customerId);
  return snapshot.empty ? null : mapReview(snapshot.docs[0].id, snapshot.docs[0].data());
}
/** Read-only context: entering the route never creates a review or an upload. */
export async function getCustomerReviewContext(requestId: string): Promise<ReviewContext> {
  const customerId = auth.currentUser?.uid ?? "";
  requireCustomer(customerId);
  const [job, profile] = await Promise.all([
    getDocFromServer(doc(db, "service_requests", requestId)), getDocFromServer(doc(db, "users", customerId)),
  ]);
  const data = job.data();
  const { technicianId } = validateContext(data, profile.data(), customerId, false);
  const existingReview = await getReviewForRequest(requestId, customerId);
  return { requestId, customerId, technicianId, title: String(data?.title || data?.serviceCategory || "Completed service"),
    technicianName: String(data?.technicianName || data?.assignedTechnicianName || "Service Technician"), existingReview };
}

export async function submitServiceReview({ requestId, customerId, technicianId: suppliedTechnicianId, rating, comment, photoPaths = [], photoAttemptId }: {
  requestId: string; customerId: string; technicianId?: string; rating: number; comment: string;
  photoPaths?: string[]; photoAttemptId?: string;
}): Promise<{ review: ServiceReview; notificationWarning?: string }> {
  requireCustomer(customerId);
  const error = validateReview(rating, comment);
  if (error) throw new Error(error);
  const reviewId = getReviewId(requestId, customerId);
  validateReviewPhotos(photoPaths, customerId, reviewId, photoAttemptId);
  const saved = await runTransaction(db, async (transaction) => {
    const job = await transaction.get(doc(db, "service_requests", requestId));
    const profile = await transaction.get(doc(db, "users", customerId));
    const { technicianId, customerName } = validateContext(job.data(), profile.data(), customerId);
    if (suppliedTechnicianId !== undefined && suppliedTechnicianId !== technicianId) throw new Error("The technician does not match this request.");
    const data = { requestId, customerId, technicianId, customerName, rating, comment: comment.trim(),
      ...(photoPaths.length ? { photoPaths, photoAttemptId } : {}) };
    // The server's CREATE-only rule at this deterministic ID also rejects races.
    transaction.set(doc(db, "service_reviews", reviewId), { ...data, createdAt: serverTimestamp() });
    return { ...data, id: reviewId } as ServiceReview;
  });
  // A notification failure must never turn an acknowledged review into a failed submission.
  let notificationDeadline: ReturnType<typeof setTimeout> | undefined;
  try {
    requireCustomer(customerId);
    await Promise.race([
      createPersonalNotification({ userId: saved.technicianId, type: "new_review", title: "New Customer Review",
        message: `You received a ${rating}-star review.`, requestId, priority: "normal" }),
      new Promise<never>((_, reject) => { notificationDeadline = setTimeout(() => reject(new Error("Notification confirmation timed out.")), 8000); }),
    ]);
    return { review: saved };
  } catch {
    return { review: saved, notificationWarning: "Your review is saved. The technician notification could not yet be confirmed." };
  } finally { if (notificationDeadline !== undefined) clearTimeout(notificationDeadline); }
}
