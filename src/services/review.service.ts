import {
  collection,
  doc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
} from "firebase/firestore";

import { auth, db } from "@/src/firebase/config";
import { createPersonalNotification } from "@/src/services/notification.service";
import { getUserProfile } from "@/src/services/user.service";
import { normalizeReviewAuthorName } from "@/src/utils/reviewAuthor";

export interface ServiceReview {
  id: string;
  requestId: string;
  customerId: string;
  technicianId: string;
  customerName?: string;
  rating: number;
  comment: string;
  createdAt?: Timestamp;
}

export function getReviewId(
  requestId: string,
  customerId: string
): string {
  return `${requestId}_${customerId}`;
}

export async function getReviewForRequest(
  requestId: string,
  customerId: string
): Promise<ServiceReview | null> {
  const reviewsQuery = query(
    collection(db, "service_reviews"),
    where("requestId", "==", requestId),
    where("customerId", "==", customerId),
    limit(1)
  );
  const snapshot = await getDocs(reviewsQuery);

  if (snapshot.empty) {
    return null;
  }

  const reviewDocument = snapshot.docs[0];
  const data = reviewDocument.data();

  return {
    id: reviewDocument.id,
    requestId: String(data.requestId ?? ""),
    customerId: String(data.customerId ?? ""),
    technicianId: String(data.technicianId ?? ""),
    customerName:
      typeof data.customerName === "string"
        ? data.customerName
        : undefined,
    rating: Number(data.rating ?? 0),
    comment: String(data.comment ?? ""),
    createdAt: data.createdAt as Timestamp | undefined,
  };
}

export async function submitServiceReview({
  requestId,
  customerId,
  technicianId,
  rating,
  comment,
}: {
  requestId: string;
  customerId: string;
  technicianId: string;
  rating: number;
  comment: string;
}): Promise<void> {
  const reviewId = getReviewId(requestId, customerId);
  if (auth.currentUser?.uid !== customerId) {
    throw new Error("Please sign in as the customer who completed this request.");
  }
  const customerProfile = await getUserProfile(customerId);
  // Keep the exact authoritative snapshot: rules compare it to users/{uid}.fullName.
  const customerName = customerProfile?.fullName;
  if (
    customerProfile?.role !== "customer" ||
    !normalizeReviewAuthorName(customerName) ||
    typeof customerName !== "string" ||
    customerName.length > 80
  ) {
    throw new Error("Please update your customer profile with your name before reviewing.");
  }
  const reviewPayload: {
    requestId: string;
    customerId: string;
    technicianId: string;
    customerName: string;
    rating: number;
    comment: string;
    createdAt: ReturnType<typeof serverTimestamp>;
  } = {
    requestId,
    customerId,
    technicianId,
    customerName,
    rating,
    comment: comment.trim(),
    createdAt: serverTimestamp(),
  };

  await setDoc(doc(db, "service_reviews", reviewId), reviewPayload);

  await createPersonalNotification({
    userId: technicianId,
    type: "new_review",
    title: "New Customer Review",
    message: `You received a ${rating}-star review.`,
    requestId,
    priority: "normal",
  });
}
