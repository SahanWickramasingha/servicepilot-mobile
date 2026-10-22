import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  type Unsubscribe,
  type QuerySnapshot,
  type DocumentData,
} from "firebase/firestore";
import { FirebaseError } from "firebase/app";

import { auth, db } from "@/src/firebase/config";
import { createSessionStream } from "./session-subscriptions";
import type { UserRole } from "@/src/services/user.service";

export type NotificationPriority = "normal" | "important" | "critical";

export type NotificationType =
  | "new_customer_request"
  | "customer_cancelled_request"
  | "technician_accepted_request"
  | "technician_rejected_request"
  | "job_started"
  | "technician_cancelled_job"
  | "job_completed"
  | "new_review"
  | "request_submitted"
  | "technician_assigned"
  | "schedule_updated"
  | "work_started"
  | "request_completed"
  | "request_cancelled"
  | "system";

export interface PersonalNotification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  requestId?: string | null;
  relatedRequestId?: string | null;
  priority: NotificationPriority;
  read: boolean;
  createdAt?: Timestamp;
  source: "personal";
}

export interface SystemMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: UserRole;
  audienceRoles: UserRole[];
  title: string;
  message: string;
  priority: NotificationPriority;
  status: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export type NotificationCenterItem =
  | PersonalNotification
  | (SystemMessage & {
      source: "system";
      read: boolean;
      readAt?: Timestamp;
    });

export type CustomerNotification = NotificationCenterItem;

export type NotificationQueryType =
  | "personal-notifications"
  | "system-messages"
  | "message-reads";

export type NotificationSubscriptionError = {
  error: Error;
  queryType: NotificationQueryType;
  role: UserRole;
};

const PUBLISHED_SYSTEM_MESSAGE_STATUSES = ["active", "sent"] as const;

type CreatePersonalNotificationInput = {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  requestId?: string;
  priority?: NotificationPriority;
};

function mapPriority(value: unknown): NotificationPriority {
  return value === "important" || value === "critical"
    ? value
    : "normal";
}

function mapPersonalNotification(
  id: string,
  data: Record<string, unknown>
): PersonalNotification {
  const requestId =
    (data.requestId as string | null | undefined) ??
    (data.relatedRequestId as string | null | undefined) ??
    null;

  return {
    id,
    userId: String(data.userId ?? ""),
    type: (data.type ?? "system") as NotificationType,
    title: String(data.title ?? "Notification"),
    message: String(data.message ?? ""),
    requestId,
    relatedRequestId: requestId,
    priority: mapPriority(data.priority),
    read: data.read === true,
    createdAt: data.createdAt as Timestamp | undefined,
    source: "personal",
  };
}

function mapSystemMessage(
  id: string,
  data: Record<string, unknown>
): SystemMessage {
  return {
    id,
    senderId: String(data.senderId ?? ""),
    senderName: String(data.senderName ?? "ServicePilot"),
    senderRole: String(data.senderRole ?? "super_admin") as UserRole,
    audienceRoles: Array.isArray(data.audienceRoles)
      ? (data.audienceRoles as UserRole[])
      : [],
    title: String(data.title ?? "System Message"),
    message: String(data.message ?? ""),
    priority: mapPriority(data.priority),
    status: String(data.status ?? "sent"),
    createdAt: data.createdAt as Timestamp | undefined,
    updatedAt: data.updatedAt as Timestamp | undefined,
  };
}

function timestampMillis(value?: Timestamp): number {
  return value?.toMillis() ?? 0;
}

function priorityRank(priority: NotificationPriority): number {
  if (priority === "critical") {
    return 3;
  }

  if (priority === "important") {
    return 2;
  }

  return 1;
}

function makeReadId(userId: string, messageId: string) {
  return `${userId}_${messageId}`;
}

function sortCenterItems(items: NotificationCenterItem[]) {
  return [...items].sort((first, second) => {
    if (!first.read && second.read) {
      return -1;
    }

    if (first.read && !second.read) {
      return 1;
    }

    const priorityDelta =
      priorityRank(second.priority) - priorityRank(first.priority);

    if (priorityDelta !== 0) {
      return priorityDelta;
    }

    return timestampMillis(second.createdAt) - timestampMillis(first.createdAt);
  });
}

function logNotificationSubscriptionError({
  error,
  queryType,
  role,
}: NotificationSubscriptionError) {
  if (!__DEV__) {
    return;
  }

  console.warn("Notification subscription failed", {
    queryType,
    role,
    code: error instanceof FirebaseError ? error.code : "unknown-error",
  });
}

export type NotificationCenterStatus = { errors: NotificationQueryType[]; loading: boolean };
const notificationStream = createSessionStream<[NotificationCenterItem[], NotificationCenterStatus?], [Error, NotificationSubscriptionError]>(() => [[], { errors: [], loading: true }]);
const notificationControls = new Map<string, { viewer: string | null; retry: (onlyFailed?: boolean) => void }>();
export function retryNotificationCenter(userId: string, role: UserRole, onlyFailed = false) {
  const control = notificationControls.get(`${userId}:${role}`);
  if (control?.viewer === (auth?.currentUser?.uid ?? null)) control?.retry(onlyFailed);
}
export function subscribeToNotificationCenter(
  {
    userId,
    role,
  }: {
    userId: string;
    role: UserRole;
  },
  onNext: (items: NotificationCenterItem[], status?: NotificationCenterStatus) => void,
  onError: (
    error: Error,
    context: NotificationSubscriptionError
  ) => void
) {
  const key = `${userId}:${role}`;
  return notificationStream(key, (emitNext, emitError) => {
    const viewer = auth?.currentUser?.uid ?? null;
    let stop = () => {}, alive = true, generation = 0, attempts = 0, failed = false, starting = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const connect = () => {
      if (!alive || starting) return;
      clearTimeout(timer); timer = undefined; stop(); starting = true;
      const version = ++generation;
      const current = () => alive && version === generation && viewer === (auth?.currentUser?.uid ?? null);
      stop = connectNotificationCenter({ userId, role }, (items, status) => {
        if (!current()) return;
        if (!status?.loading) starting = false;
        if (status && !status.loading && !status.errors.length) { failed = false; attempts = 0; clearTimeout(timer); timer = undefined; }
        emitNext(items, status);
      }, (error, context) => {
        if (!current()) return;
        starting = false; failed = true; emitError(error, context);
        if (["unavailable", "deadline-exceeded", "aborted", "resource-exhausted"].includes((error as { code?: string }).code ?? "") && !timer && attempts < 3) {
          timer = setTimeout(() => { timer = undefined; if (current()) connect(); }, [1000, 3000, 10000][attempts++]);
        }
      });
    };
    const control = { viewer, retry: (onlyFailed = false) => { if (!onlyFailed || failed) { attempts = 0; connect(); } } };
    notificationControls.set(key, control); connect();
    return () => { alive = false; generation++; clearTimeout(timer); stop(); if (notificationControls.get(key) === control) notificationControls.delete(key); };
  }, onNext, onError);
}

function connectNotificationCenter(
  { userId, role }: { userId: string; role: UserRole },
  onNext: (items: NotificationCenterItem[], status?: NotificationCenterStatus) => void,
  onError: (error: Error, context: NotificationSubscriptionError) => void
) {
  let personal: PersonalNotification[] = [];
  let systemMessages: SystemMessage[] = [];
  const systemMessagesByStatus = new Map<string, Map<string, SystemMessage>>();
  let readReceipts = new Map<string, Timestamp | undefined>();
  const pending = new Set(['personal-notifications', 'system-active', 'system-sent', 'message-reads']);
  const failures = new Map<string, NotificationQueryType>();
  const succeeded = (source: string) => { pending.delete(source); failures.delete(source); };

  const emit = () => {
    const systemItems: NotificationCenterItem[] = systemMessages.map(
      (message) => {
        const readAt = readReceipts.get(message.id);

        return {
          ...message,
          source: "system",
          read: readReceipts.has(message.id),
          readAt,
        };
      }
    );

    onNext(sortCenterItems([...personal, ...systemItems]), { errors: [...new Set(failures.values())], loading: pending.size > 0 });
  };

  const handleSourceError = (
    queryType: NotificationQueryType,
    error: Error,
    source = queryType as string
  ) => {
    const context = { error, queryType, role };

    logNotificationSubscriptionError(context);
    pending.delete(source); failures.set(source, queryType);
    if ((error as { code?: string }).code === 'permission-denied') {
      if (queryType === 'personal-notifications') personal = [];
      if (queryType === 'message-reads') readReceipts.clear();
      if (queryType === 'system-messages') {
        systemMessagesByStatus.delete(source.replace('system-', ''));
        systemMessages = [...systemMessagesByStatus.values()].flatMap((rows) => [...rows.values()]);
      }
    }
    onError(error, context);
    emit();
  };

  const applySystemMessagesSnapshot = (
    status: (typeof PUBLISHED_SYSTEM_MESSAGE_STATUSES)[number],
    snapshot: QuerySnapshot<DocumentData>
  ) => {
    succeeded(`system-${status}`);
    systemMessagesByStatus.set(
      status,
      new Map(
        snapshot.docs.map((item) => [
          item.id,
          mapSystemMessage(item.id, item.data()),
        ])
      )
    );

    const merged = new Map<string, SystemMessage>();

    systemMessagesByStatus.forEach((messagesForStatus) => {
      messagesForStatus.forEach((message, id) => merged.set(id, message));
    });

    systemMessages = Array.from(merged.values());
    emit();
  };

  const unsubscribes: Unsubscribe[] = [
    onSnapshot(
      query(collection(db, "notifications"), where("userId", "==", userId)),
      (snapshot) => {
        succeeded('personal-notifications');
        personal = snapshot.docs.map((item) =>
          mapPersonalNotification(item.id, item.data())
        );
        emit();
      },
      (error) => handleSourceError("personal-notifications", error)
    ),
    ...PUBLISHED_SYSTEM_MESSAGE_STATUSES.map((status) =>
      onSnapshot(
        query(
          collection(db, "system_messages"),
          where("audienceRoles", "array-contains", role),
          where("status", "==", status)
        ),
        (snapshot) => applySystemMessagesSnapshot(status, snapshot),
        (error) => handleSourceError("system-messages", error, `system-${status}`)
      )
    ),
    onSnapshot(
      query(collection(db, "message_reads"), where("userId", "==", userId)),
      (snapshot) => {
        succeeded('message-reads');
        readReceipts = new Map(
          snapshot.docs.map((item) => [
            String(item.data().messageId ?? ""),
            item.data().readAt as Timestamp | undefined,
          ])
        );
        emit();
      },
      (error) => handleSourceError("message-reads", error)
    ),
  ];

  return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
}

export const subscribeToCustomerNotifications = subscribeToNotificationCenter;

export async function createPersonalNotification({
  userId,
  type,
  title,
  message,
  requestId,
  priority = "normal",
}: CreatePersonalNotificationInput): Promise<void> {
  await addDoc(collection(db, "notifications"), {
    userId,
    type,
    title,
    message,
    requestId: requestId ?? "",
    priority,
    read: false,
    createdAt: serverTimestamp(),
  });
}

export async function markNotificationRead(
  item: NotificationCenterItem | string,
  currentUserId?: string
): Promise<void> {
  if (typeof item === "string") {
    await updateDoc(doc(db, "notifications", item), {
      read: true,
      updatedAt: serverTimestamp(),
    });
    return;
  }

  if (item.source === "personal") {
    await updateDoc(doc(db, "notifications", item.id), {
      read: true,
      updatedAt: serverTimestamp(),
    });
    return;
  }

  if (!currentUserId) {
    throw new Error("Please sign in before marking messages read.");
  }

  await setDoc(
    doc(db, "message_reads", makeReadId(currentUserId, item.id)),
    {
      userId: currentUserId,
      messageId: item.id,
      readAt: serverTimestamp(),
    },
    { merge: true }
  );
}
