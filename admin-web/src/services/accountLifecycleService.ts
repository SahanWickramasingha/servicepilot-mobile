import {
  collection,
  doc,
  getDoc,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";

import { db } from "../firebase/config";
import type { UserRecord } from "../types";
import { buildMapProfile } from "../../../functions/src/domain/mapProjection";

export type ManagedAccountRole = "customer" | "technician" | "dispatcher";
export type AccountLifecycleStatus = "active" | "disabled" | "deleted";
export type AccountLifecycleAction = "disable" | "enable" | "delete";

const actionNames: Record<AccountLifecycleAction, string> = {
  disable: "DISABLED",
  enable: "ENABLED",
  delete: "DELETED",
};

export function getEffectiveAccountStatus(
  accountStatus?: string
): AccountLifecycleStatus {
  if (accountStatus === "disabled" || accountStatus === "deleted") {
    return accountStatus;
  }

  return "active";
}

export function accountRoleLabel(role?: string): string {
  switch (role) {
    case "technician":
      return "Technician";
    case "dispatcher":
      return "Dispatcher";
    case "customer":
    default:
      return "Customer";
  }
}

function actionAuditName(
  action: AccountLifecycleAction,
  targetRole: ManagedAccountRole
) {
  return `SUPER_ADMIN_${actionNames[action]}_${targetRole.toUpperCase()}`;
}

export async function updateManagedAccountLifecycle({
  actorUid,
  target,
  action,
}: {
  actorUid: string;
  target: UserRecord;
  action: AccountLifecycleAction;
}): Promise<void> {
  const targetUid = target.uid ?? target.id;
  const targetRole = target.role as ManagedAccountRole;

  if (!actorUid) {
    throw new Error("Please sign in as Super Admin first.");
  }

  if (!targetUid) {
    throw new Error("Unable to identify this account.");
  }

  if (!["customer", "technician", "dispatcher"].includes(targetRole)) {
    throw new Error("Only Customer, Technician, and Dispatcher accounts can be managed here.");
  }

  const timestampField =
    action === "disable"
      ? "disabledAt"
      : action === "enable"
        ? "enabledAt"
        : "deletedAt";
  const actorField =
    action === "disable"
      ? "disabledBy"
      : action === "enable"
        ? "enabledBy"
        : "deletedBy";
  const accountStatus =
    action === "enable"
      ? "active"
      : action === "disable"
        ? "disabled"
        : "deleted";

  const batch = writeBatch(db);
  const userRef = doc(db, "users", targetUid);
  const auditRef = doc(collection(db, "audit_logs"));

  batch.update(userRef, {
    accountStatus,
    [timestampField]: serverTimestamp(),
    [actorField]: actorUid,
    updatedAt: serverTimestamp(),
  });

  if (targetRole === "technician") {
    const authoritative = (await getDoc(userRef)).data();
    if (!authoritative) throw new Error("Technician profile unavailable.");
    batch.set(doc(db, "technician_map_profiles", targetUid), {
      ...buildMapProfile(targetUid, { ...authoritative, accountStatus }), updatedAt: serverTimestamp(),
    });
  }

  batch.set(auditRef, {
    action: actionAuditName(action, targetRole),
    actorUid,
    actorRole: "super_admin",
    targetUid,
    targetRole,
    targetType: "user",
    createdAt: serverTimestamp(),
  });

  await batch.commit();
}
