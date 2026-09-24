import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";

import { db } from "@/src/firebase/config";

export type NotificationType =
  | "request_submitted"
  | "technician_assigned"
  | "schedule_updated"
  | "work_started"
  | "request_completed"
  | "request_cancelled"
  | "system";

export interface CustomerNotification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  relatedRequestId?: string | null;
  read: boolean;
  createdAt?: Timestamp;
}

function mapNotification(
  id: string,
  data: Record<string, unknown>
): CustomerNotification {
  return {
    id,
    userId: String(data.userId ?? ""),
    type: (data.type ?? "system") as NotificationType,
    title: String(data.title ?? "Notification"),
    message: String(data.message ?? ""),
    relatedRequestId:
      (data.relatedRequestId as string | null | undefined) ??
      null,
    read: data.read === true,
    createdAt: data.createdAt as Timestamp | undefined,
  };
}

export function subscribeToCustomerNotifications(
  userId: string,
  onNext: (notifications: CustomerNotification[]) => void,
  onError: (error: Error) => void
) {
  const notificationsQuery = query(
    collection(db, "notifications"),
    where("userId", "==", userId)
  );

  return onSnapshot(
    notificationsQuery,
    (snapshot) => {
      const notifications = snapshot.docs
        .map((item) =>
          mapNotification(item.id, item.data())
        )
        .sort((first, second) => {
          const firstMillis =
            first.createdAt?.toMillis() ?? 0;
          const secondMillis =
            second.createdAt?.toMillis() ?? 0;
          return secondMillis - firstMillis;
        });

      onNext(notifications);
    },
    onError
  );
}

export async function markNotificationRead(
  notificationId: string
): Promise<void> {
  await updateDoc(doc(db, "notifications", notificationId), {
    read: true,
    updatedAt: serverTimestamp(),
  });
}
