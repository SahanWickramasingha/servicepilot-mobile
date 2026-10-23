import {
  addDoc,
  collection,
  doc,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import { FirebaseError } from "firebase/app";

import { connectNotificationHistory } from "./notificationHistory";
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

export type NotificationCenterStatus = { errors: NotificationQueryType[]; loading: boolean; hasMore?: boolean; historyLoading?: boolean;
  unreadTotal?: number; totalBusy?: boolean; markAllBusy?: boolean; operationError?: string; windowChanged?: boolean };
const notificationStream = createSessionStream<[NotificationCenterItem[], NotificationCenterStatus?], [Error, NotificationSubscriptionError]>(() => [[], { errors: [], loading: true }]);
const notificationControls = new Map<string, { viewer: string | null; retry: (onlyFailed?: boolean) => void; loadMore: () => Promise<void>; refreshTotal: () => Promise<void>; markAll: () => Promise<void> }>();
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
    let connection: ReturnType<typeof connectNotificationHistory> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const connect = () => {
      if (!alive || starting) return;
      clearTimeout(timer); timer = undefined; stop(); starting = true;
      const version = ++generation;
      const current = () => alive && version === generation && viewer === (auth?.currentUser?.uid ?? null);
      connection = connectNotificationHistory(userId, role, mapPersonalNotification, mapSystemMessage, (items, status) => {
        if (!current()) return;
        if (!status?.loading) starting = false;
        if (status && !status.loading && !status.errors.length) { failed = false; attempts = 0; clearTimeout(timer); timer = undefined; }
        emitNext(items, status);
      }, (error, kind) => {
        const context = { error, queryType: kind, role }; logNotificationSubscriptionError(context);
        if (!current()) return;
        starting = false; failed = true; emitError(error, context);
        if (["unavailable", "deadline-exceeded", "aborted", "resource-exhausted"].includes((error as { code?: string }).code ?? "") && !timer && attempts < 3) {
          timer = setTimeout(() => { timer = undefined; if (current()) connect(); }, [1000, 3000, 10000][attempts++]);
        }
      });
      stop = connection.stop;
    };
    const control = { viewer, loadMore: async () => connection?.loadMore(), refreshTotal: async () => connection?.refreshTotal(), markAll: async () => connection?.markAll(), retry: (onlyFailed = false) => { if (!onlyFailed || failed) { attempts = 0; connect(); } } };
    notificationControls.set(key, control); connect();
    return () => { alive = false; generation++; clearTimeout(timer); stop(); if (notificationControls.get(key) === control) notificationControls.delete(key); };
  }, onNext, onError);
}

async function controlAction(userId: string, role: UserRole, action: "loadMore" | "refreshTotal" | "markAll") {
  const control = notificationControls.get(userId + ":" + role);
  if (!control || control.viewer !== auth.currentUser?.uid) throw new Error("Reopen notifications with the current account.");
  await control[action]();
}
export const loadNotificationHistory = (userId: string, role: UserRole) => controlAction(userId, role, "loadMore");
export const refreshNotificationUnreadTotal = (userId: string, role: UserRole) => controlAction(userId, role, "refreshTotal");
export const markAllNotificationsRead = (userId: string, role: UserRole) => controlAction(userId, role, "markAll");

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
    doc(db, "message_reads", `${currentUserId}_${item.id}`),
    {
      userId: currentUserId,
      messageId: item.id,
      readAt: serverTimestamp(),
    },
    { merge: true }
  );
}
