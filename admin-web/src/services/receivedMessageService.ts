import { FirebaseError } from "firebase/app";
import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  type DocumentData,
  type QuerySnapshot,
  type Unsubscribe,
} from "firebase/firestore";

import { db } from "../firebase/config";
import type { SystemMessageRecord, UserRole } from "../types";
import { timestampMillis } from "../utils/format";

const publishedMessageStatuses = ["active", "sent"] as const;

export type ReceivedSystemMessage = SystemMessageRecord & {
  read: boolean;
  readAt?: unknown;
};

export type ReceivedMessageQueryType = "system-messages" | "message-reads";

export type ReceivedMessageSubscriptionError = {
  error: Error;
  queryType: ReceivedMessageQueryType;
  role: UserRole;
};

function makeReadId(userId: string, messageId: string) {
  return `${userId}_${messageId}`;
}

function mapSystemMessage(id: string, data: DocumentData): SystemMessageRecord {
  return {
    id,
    ...data,
  } as SystemMessageRecord;
}

function sortMessages(items: ReceivedSystemMessage[]) {
  return [...items].sort(
    (first, second) =>
      timestampMillis(second.createdAt) - timestampMillis(first.createdAt)
  );
}

function logSubscriptionError(context: ReceivedMessageSubscriptionError) {
  if (!import.meta.env.DEV) {
    return;
  }

  console.warn("Received message subscription failed", {
    queryType: context.queryType,
    role: context.role,
    code:
      context.error instanceof FirebaseError
        ? context.error.code
        : "unknown-error",
    message: context.error.message,
  });
}

export function subscribeToReceivedSystemMessages(
  {
    userId,
    role,
  }: {
    userId: string;
    role: Extract<UserRole, "dispatcher" | "super_admin">;
  },
  onNext: (items: ReceivedSystemMessage[]) => void,
  onError: (context: ReceivedMessageSubscriptionError) => void
) {
  const messagesByStatus = new Map<
    string,
    Map<string, SystemMessageRecord>
  >();
  let readReceipts = new Map<string, unknown>();
  let initializedSnapshots = 0;
  const requiredSnapshots = publishedMessageStatuses.length + 1;

  const emit = () => {
    const merged = new Map<string, SystemMessageRecord>();

    messagesByStatus.forEach((bucket) => {
      bucket.forEach((message, id) => {
        if (message.senderId !== userId) {
          merged.set(id, message);
        }
      });
    });

    const received = Array.from(merged.values()).map((message) => ({
      ...message,
      read: readReceipts.has(message.id),
      readAt: readReceipts.get(message.id),
    }));

    if (initializedSnapshots >= requiredSnapshots) {
      onNext(sortMessages(received));
    }
  };

  const markSnapshotReady = () => {
    initializedSnapshots = Math.min(
      requiredSnapshots,
      initializedSnapshots + 1
    );
  };

  const handleError = (
    queryType: ReceivedMessageQueryType,
    error: Error
  ) => {
    const context = { error, queryType, role };

    logSubscriptionError(context);
    onError(context);
  };

  const applyMessageSnapshot = (
    status: (typeof publishedMessageStatuses)[number],
    snapshot: QuerySnapshot<DocumentData>
  ) => {
    messagesByStatus.set(
      status,
      new Map(
        snapshot.docs.map((item) => [
          item.id,
          mapSystemMessage(item.id, item.data()),
        ])
      )
    );
    markSnapshotReady();
    emit();
  };

  const unsubscribes: Unsubscribe[] = [
    ...publishedMessageStatuses.map((status) =>
      onSnapshot(
        query(
          collection(db, "system_messages"),
          where("audienceRoles", "array-contains", role),
          where("status", "==", status)
        ),
        (snapshot) => applyMessageSnapshot(status, snapshot),
        (error) => handleError("system-messages", error)
      )
    ),
    onSnapshot(
      query(collection(db, "message_reads"), where("userId", "==", userId)),
      (snapshot) => {
        readReceipts = new Map(
          snapshot.docs.map((item) => [
            String(item.data().messageId ?? ""),
            item.data().readAt,
          ])
        );
        markSnapshotReady();
        emit();
      },
      (error) => handleError("message-reads", error)
    ),
  ];

  return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
}

export async function markSystemMessageRead({
  userId,
  messageId,
}: {
  userId: string;
  messageId: string;
}) {
  await setDoc(
    doc(db, "message_reads", makeReadId(userId, messageId)),
    {
      userId,
      messageId,
      readAt: serverTimestamp(),
    },
    { merge: true }
  );
}
