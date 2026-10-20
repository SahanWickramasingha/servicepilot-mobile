import type { UserRecord } from "../types";
import { callAccountLifecycleBackend } from "./dispatcherProvisioningService";

export type ManagedAccountRole = "customer" | "technician" | "dispatcher";
export type AccountLifecycleStatus = "active" | "disabled" | "deleted";
export type AccountLifecycleAction = "disable" | "enable" | "delete";

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

// Retained across a closed/reopened dialog after an uncertain network result.
const requests = new Map<string, string>();
export async function updateManagedAccountLifecycle({
  actorUid, target, action,
}: { actorUid: string; target: UserRecord; action: AccountLifecycleAction }): Promise<void> {
  const targetUid = target.uid ?? target.id;
  if (!targetUid) throw new Error("Unable to identify this account.");
  const key = `${actorUid}:${targetUid}:${action}`;
  let requestId = requests.get(key);
  if (!requestId) { requestId = crypto.randomUUID(); requests.set(key, requestId); }
  // Actor UID only namespaces local retry state; authorization/role come from the backend.
  try {
    await callAccountLifecycleBackend({ targetUid, action, requestId });
    requests.delete(key);
  } catch (error) {
    if (["request-conflict", "invalid-argument", "not-found", "deleted-account", "protected-account"]
      .includes((error as { code?: string }).code ?? "")) requests.delete(key);
    throw error;
  }
}
