import { createHash, randomUUID } from "node:crypto";
import type { Auth } from "firebase-admin/auth";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { buildMapProfile } from "../domain/mapProjection";
import { createSuperAdminAuthorizer, TrustedRequestError as RequestError } from "./trusted-auth";

type Action = "disable" | "enable" | "delete";
type Result = { targetUid: string; accountStatus: string; outcome: "complete" };
const stamp = () => FieldValue.serverTimestamp();
const statusFor = (action: Action) => action === "enable" ? "active" : action === "delete" ? "deleted" : "disabled";

export function createAccountLifecycleService({ auth, db, now = Date.now }: { auth: Auth; db: Firestore; now?: () => number }) {
  const authorize = createSuperAdminAuthorizer(auth, db);
  async function change(authorization: string | undefined, body: unknown): Promise<Result> {
    const actorUid = await authorize(authorization);
    if (!body || typeof body !== "object" || Array.isArray(body) ||
      Object.keys(body).some((key) => !["targetUid", "action", "requestId"].includes(key))) {
      throw new RequestError(400, "invalid-argument", "Only target UID, action and request ID are accepted.");
    }
    const input = body as Record<string, unknown>;
    if (typeof input.targetUid !== "string" || !/^[A-Za-z0-9:_-]{1,128}$/.test(input.targetUid) ||
      !["disable", "enable", "delete"].includes(input.action as string) ||
      typeof input.requestId !== "string" || !/^[A-Za-z0-9-]{16,80}$/.test(input.requestId)) {
      throw new RequestError(400, "invalid-argument", "A valid target UID, action and request ID are required.");
    }
    const targetUid = input.targetUid, action = input.action as Action;
    if (targetUid === actorUid) throw new RequestError(403, "protected-account", "You cannot manage your own account.");
    const targetRef = db.doc(`users/${targetUid}`), lockRef = db.doc(`account_lifecycle_locks/${targetUid}`);
    const key = createHash("sha256").update(`${actorUid}:${input.requestId}`).digest("hex");
    const receiptRef = db.doc(`account_lifecycle_requests/${key}`);
    const candidateId = randomUUID();
    // The gate, map revocation, durable operation and pending audit commit together.
    // No Auth call occurs if this transaction fails.
    const claim = await db.runTransaction(async (tx) => {
      const [actorSnap, targetSnap, lockSnap, receiptSnap] = await tx.getAll(
        db.doc(`users/${actorUid}`), targetRef, lockRef, receiptRef);
      const actor = actorSnap.data(), target = targetSnap.data(), lock = lockSnap.data(), receipt = receiptSnap.data();
      if (actor?.role !== "super_admin" || actor.accountStatus !== "active" || actor.lifecyclePending === true) {
        throw new RequestError(403, "permission-denied", "An active Super Admin is required.");
      }
      if (!target) throw new RequestError(404, "not-found", "Account profile not found.");
      if (!["customer", "technician", "dispatcher"].includes(target.role)) {
        throw new RequestError(403, "protected-account", "Super Admin and unsupported accounts cannot be managed here.");
      }
      if (receipt && (receipt.targetUid !== targetUid || receipt.action !== action)) {
        throw new RequestError(409, "request-conflict", "This request ID was already used for another action.");
      }
      if (target.accountStatus === "deleted" && action !== "delete") {
        throw new RequestError(409, "deleted-account", "A deleted account cannot be enabled or disabled.");
      }
      if (receipt && receipt.operationId !== lock?.operationId) {
        throw new RequestError(409, "request-conflict", "This older request was superseded. Reopen the action to check the current state.");
      }
      if (receipt?.outcome === "complete") return { result: receipt.result as Result };
      if (receipt && lock?.outcome === "complete") return { result: lock.result as Result };
      if (![undefined, "active", "disabled", "deleted"].includes(target.accountStatus)) {
        throw new RequestError(409, "failed-precondition", "The account has an unsupported status. Contact support.");
      }
      if (lock && lock.outcome !== "complete") {
        if (lock.outcome === "running") {
          // Never steal an expired lease: an old worker could still mutate Auth.
          throw new RequestError(409, now() - lock.startedMs > 120000 ? "operation-recovery-required" : "operation-in-progress",
            "An account operation is still pending. Retry shortly; a stalled worker requires trusted recovery.");
        }
        if (lock.action !== action || lock.targetRole !== target.role) {
          throw new RequestError(409, "pending-action", `Finish the pending ${lock.action} action before another action.`);
        }
      }
      const operationId = lock && lock.outcome !== "complete" ? lock.operationId as string : candidateId;
      const auditRef = db.doc(`audit_logs/lifecycle-${operationId}`);
      const currentStatus = target.accountStatus ?? "active";
      const desiredStatus = statusFor(action);
      const noChange = (!lock || lock.outcome === "complete") && currentStatus === desiredStatus;
      // Reconcile even repeated actions: legacy Firestore-only disables may still have active Auth users.
      const audit = {
        action: `SUPER_ADMIN_${action === "disable" ? "DISABLED" : action === "enable" ? "ENABLED" : "DELETED"}_${target.role.toUpperCase()}`,
        actorUid: lock && lock.outcome !== "complete" ? lock.actorUid : actorUid,
        actorRole: "super_admin", targetUid, targetRole: target.role, targetType: "user",
        outcome: "pending", operationId, lastAttemptBy: actorUid, updatedAt: stamp(),
        ...(lock && lock.outcome !== "complete" ? {} : { createdAt: stamp() }),
      };
      tx.set(auditRef, audit, { merge: true });
      tx.set(lockRef, { operationId, action, actorUid: audit.actorUid, targetRole: target.role,
        outcome: "running", startedMs: now(), requestKey: key, updatedAt: stamp() });
      tx.set(receiptRef, { targetUid, action, operationId, outcome: "pending", updatedAt: stamp() });
      const statePatch = action === "enable" ? {} : { accountStatus: desiredStatus,
        [action === "disable" ? "disabledAt" : "deletedAt"]: stamp(),
        [action === "disable" ? "disabledBy" : "deletedBy"]: actorUid };
      tx.update(targetRef, { ...statePatch, lifecyclePending: true, lifecycleAction: action,
        sessionRevokedAt: Math.max(Number(target.sessionRevokedAt) || 0, Math.floor(now() / 1000)),
        ...(target.role === "technician" ? { availability: "offline" } : {}), updatedAt: stamp() });
      if (target.role === "technician") {
        // Do not require a well-formed legacy profile to revoke public eligibility.
        tx.set(db.doc(`technician_map_profiles/${targetUid}`), { technicianId: targetUid, approved: false,
          availability: "offline", updatedAt: stamp() }, { merge: true });
        for (const collection of ["technician_locations", "technician_map_locations"]) {
          tx.set(db.doc(`${collection}/${targetUid}`), { technicianId: targetUid, sharingEnabled: false, updatedAt: stamp() });
        }
      }
      return { operationId, targetRole: target.role as string, noChange };
    });
    if (claim.result) return claim.result;
    const auditRef = db.doc(`audit_logs/lifecycle-${claim.operationId}`);
    try {
      // Missing Auth on disable/delete is already safely inaccessible; never create/delete an Auth user.
      try {
        await auth.updateUser(targetUid, { disabled: action !== "enable" });
        await auth.revokeRefreshTokens(targetUid);
      } catch (error) {
        if ((error as { code?: string }).code !== "auth/user-not-found" || action === "enable") throw error;
      }
      const result: Result = { targetUid, accountStatus: statusFor(action), outcome: "complete" };
      await db.runTransaction(async (tx) => {
        const [targetSnap, lockSnap, actorSnap] = await tx.getAll(targetRef, lockRef, db.doc(`users/${actorUid}`));
        const target = targetSnap.data(), lock = lockSnap.data(), actor = actorSnap.data();
        if (lock?.operationId !== claim.operationId || lock.outcome !== "running" ||
          target?.role !== claim.targetRole || actor?.role !== "super_admin" || actor.accountStatus !== "active") {
          throw new Error("Lifecycle completion precondition failed.");
        }
        tx.update(targetRef, { accountStatus: result.accountStatus, lifecyclePending: false,
          sessionRevokedAt: Math.max(Number(target.sessionRevokedAt) || 0, Math.floor(now() / 1000)),
          ...(action === "enable" ? { enabledAt: stamp(), enabledBy: actorUid } : {}), updatedAt: stamp() });
        if (claim.targetRole === "technician" && action === "enable") {
          tx.set(db.doc(`technician_map_profiles/${targetUid}`), {
            ...buildMapProfile(targetUid, { ...target, accountStatus: "active", availability: "offline" }), updatedAt: stamp(),
          });
        }
        tx.update(auditRef, { outcome: "complete", completedAt: stamp(), updatedAt: stamp(), unchanged: claim.noChange });
        tx.update(lockRef, { outcome: "complete", result, updatedAt: stamp() });
        tx.set(receiptRef, { targetUid, action, operationId: claim.operationId, outcome: "complete", result, updatedAt: stamp() });
      });
      return result;
    } catch {
      // A lost commit response is not proof of failure. Confirm a completed
      // receipt before reporting an incomplete operation or changing its state.
      const receipt = await receiptRef.get().catch(() => null);
      if (receipt?.data()?.operationId === claim.operationId && receipt.data()?.outcome === "complete") {
        return receipt.data()?.result as Result;
      }
      // Access remains gated. Never compensate by restoring active status or map sharing.
      await db.runTransaction(async (tx) => {
        const lock = (await tx.get(lockRef)).data();
        if (lock?.operationId !== claim.operationId || lock.outcome !== "running") return;
        tx.update(lockRef, { outcome: "retryable", updatedAt: stamp() });
        tx.update(auditRef, { outcome: "retryable", errorCode: "provider-or-storage-failure", updatedAt: stamp() });
      }).catch(() => undefined); // If this fails, the durable running lock still blocks conflicts.
      throw new RequestError(503, "lifecycle-incomplete", "Account access remains blocked. Retry the same action to finish Auth synchronization.");
    }
  }
  return { change };
}
