import {
  collection,
  doc,
  getDoc,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import { FirebaseError } from "firebase/app";

import { auth, db } from "../firebase/config";
import type { MessagePriority, UserRecord, UserRole } from "../types";

export type MessageAudienceOption =
  | "all"
  | "customer"
  | "technician"
  | "dispatcher"
  | "super_admin";

export function audienceRolesForOption(
  option: MessageAudienceOption
): UserRole[] {
  if (option === "all") {
    return ["customer", "technician", "dispatcher"];
  }

  return [option as UserRole];
}

export function audienceLabel(audienceRoles?: UserRole[]) {
  if (!audienceRoles || audienceRoles.length === 0) {
    return "No audience information";
  }

  return audienceRoles
    .map((role) =>
      role
        .split("_")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ")
    )
    .join(", ");
}

function logSystemMessageError(error: unknown, operation: string) {
  if (!import.meta.env.DEV) {
    return;
  }

  console.warn("System message write failed", {
    code: error instanceof FirebaseError ? error.code : "unknown-error",
    message: error instanceof Error ? error.message : String(error),
    operation,
  });
}

function logSystemMessageOperation(operation: string, details?: unknown) {
  if (!import.meta.env.DEV) {
    return;
  }

  console.info("System message write operation", {
    operation,
    details,
  });
}

export async function sendSystemMessage({
  sender,
  audienceRoles,
  title,
  message,
  priority,
}: {
  sender: UserRecord;
  audienceRoles: UserRole[];
  title: string;
  message: string;
  priority: MessagePriority;
}) {
  const cleanTitle = title.trim();
  const cleanMessage = message.trim();
  const senderRole = sender.role;
  const senderUid = sender.uid ?? sender.id;
  const currentUser = auth.currentUser;

  if (!currentUser || !senderUid || !senderRole) {
    throw new Error("Please sign in before sending a message.");
  }

  if (currentUser.uid !== senderUid) {
    throw new Error("Please sign in again before sending a message.");
  }

  if (!cleanTitle || !cleanMessage) {
    throw new Error("Title and message are required.");
  }

  if (!["normal", "important", "critical"].includes(priority)) {
    throw new Error("Select a valid priority.");
  }

  const allowedAudience =
    senderRole === "super_admin"
      ? ["customer", "technician", "dispatcher"]
      : ["technician", "super_admin"];

  if (
    senderRole !== "super_admin" &&
    senderRole !== "dispatcher"
  ) {
    throw new Error("This role cannot send system messages.");
  }

  if (
    audienceRoles.length === 0 ||
    audienceRoles.some((role) => !allowedAudience.includes(role))
  ) {
    throw new Error("This audience is not allowed for your role.");
  }

  const profileRef = doc(db, "users", currentUser.uid);
  let verifiedProfile: UserRecord;

  try {
    const profileSnapshot = await getDoc(profileRef);

    if (!profileSnapshot.exists()) {
      throw new Error("Signed-in profile was not found.");
    }

    verifiedProfile = {
      id: profileSnapshot.id,
      ...profileSnapshot.data(),
    } as UserRecord;
  } catch (error) {
    logSystemMessageError(error, "profile:verify");
    throw error;
  }

  if (
    verifiedProfile.role !== senderRole ||
    verifiedProfile.accountStatus !== "active"
  ) {
    throw new Error("Only active Super Admin and Dispatcher accounts can send system messages.");
  }

  const verifiedSenderName = verifiedProfile.fullName;

  if (!verifiedSenderName?.trim()) {
    throw new Error("Sender profile is missing a full name.");
  }

  const batch = writeBatch(db);
  const messageRef = doc(collection(db, "system_messages"));
  const auditRef = doc(collection(db, "audit_logs"));
  const messagePayload = {
    senderId: senderUid,
    senderName: verifiedSenderName,
    senderRole,
    audienceRoles,
    title: cleanTitle,
    message: cleanMessage,
    priority,
    status: "active",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  const auditPayload = {
    action:
      senderRole === "super_admin"
        ? "SUPER_ADMIN_SENT_SYSTEM_MESSAGE"
        : "DISPATCHER_SENT_SYSTEM_MESSAGE",
    actorUid: senderUid,
    actorRole: senderRole,
    targetUid: messageRef.id,
    targetType: "system_message",
    messageId: messageRef.id,
    metadata: {
      messageId: messageRef.id,
      audienceRoles,
      priority,
    },
    createdAt: serverTimestamp(),
  };

  logSystemMessageOperation("system_messages:create", {
    messageId: messageRef.id,
    senderRole,
    audienceRoles,
    priority,
  });
  batch.set(messageRef, messagePayload);

  logSystemMessageOperation("audit_logs:create", {
    auditLogId: auditRef.id,
    messageId: messageRef.id,
    action: auditPayload.action,
    actorRole: senderRole,
  });
  batch.set(auditRef, auditPayload);

  try {
    logSystemMessageOperation("batch:commit", {
      writes: ["system_messages:create", "audit_logs:create"],
    });
    await batch.commit();
  } catch (error) {
    logSystemMessageError(error, "batch:commit");
    throw error;
  }
}
