import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  Timestamp,
} from "firebase/firestore";

import { db } from "@/src/firebase/config";

export interface ServiceReview {
  id: string;
  requestId: string;
  customerId: string;
  technicianId: string;
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
  const reviewId = getReviewId(requestId, customerId);
  const snapshot = await getDoc(
    doc(db, "service_reviews", reviewId)
  );

  if (!snapshot.exists()) {
    return null;
  }

  const data = snapshot.data();

  return {
    id: snapshot.id,
    requestId: String(data.requestId ?? ""),
    customerId: String(data.customerId ?? ""),
    technicianId: String(data.technicianId ?? ""),
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

  await setDoc(doc(db, "service_reviews", reviewId), {
    requestId,
    customerId,
    technicianId,
    rating,
    comment: comment.trim(),
    createdAt: serverTimestamp(),
  });
}
