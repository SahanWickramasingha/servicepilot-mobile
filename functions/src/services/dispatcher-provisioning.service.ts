import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Auth } from "firebase-admin/auth";
import { FieldValue, type Firestore } from "firebase-admin/firestore";

import { createSuperAdminAuthorizer, TrustedRequestError as ProvisioningError } from "./trusted-auth";
export { TrustedRequestError as ProvisioningError } from "./trusted-auth";

export type EmailDelivery = "sent" | "failed" | "emulated" | "pending" | "unknown";
type Result = { uid: string; dispatcherId: string; emailDelivery: EmailDelivery };
type Dependencies = {
  auth: Auth;
  db: Firestore;
  continueUrl: string;
  sendSetupEmail: (email: string, resetLink: string) => Promise<"sent" | "emulated">;
  now?: () => number;
};
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const timestamp = () => FieldValue.serverTimestamp();
const errorCode = (error: unknown) => (error as {code?: string})?.code;
const hasControlCharacters = (value: string) => Array.from(value).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
function validEmail(email: string): boolean {
  const local = email.split("@")[0];
  // Common ASCII mailboxes only; reject address-list/header syntax and bad DNS labels.
  return email.length <= 254 && local.length <= 64 && !local.startsWith(".") && !local.endsWith(".") && !local.includes("..") &&
    /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(email);
}

function inputObject(body: unknown, fields: string[]): Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body) ||
    Object.keys(body).some((key) => !fields.includes(key))) {
    throw new ProvisioningError(400, "invalid-argument", "Unexpected dispatcher request fields.");
  }
  return body as Record<string, unknown>;
}

export function normalizeDispatcher(body: unknown) {
  const data = inputObject(body, ["fullName", "email", "requestId"]);
  if (typeof data.fullName !== "string" || typeof data.email !== "string" ||
    typeof data.requestId !== "string" || !/^[a-zA-Z0-9-]{16,80}$/.test(data.requestId)) {
    throw new ProvisioningError(400, "invalid-argument", "Name, email and a valid request ID are required.");
  }
  if (hasControlCharacters(data.fullName)) {
    throw new ProvisioningError(400, "invalid-argument", "Enter a valid dispatcher name.");
  }
  const fullName = data.fullName.normalize("NFC").trim().replace(/\s+/g, " ");
  const email = data.email.trim().toLowerCase();
  if (fullName.length < 2 || fullName.length > 100) {
    throw new ProvisioningError(400, "invalid-argument", "Dispatcher name must contain 2 to 100 characters.");
  }
  if (hasControlCharacters(data.email) || !validEmail(email)) {
    throw new ProvisioningError(400, "invalid-argument", "Please enter a valid dispatcher email address.");
  }
  return { fullName, email, requestId: data.requestId };
}

export function createDispatcherProvisioner({ auth, db, continueUrl, sendSetupEmail, now = Date.now }: Dependencies) {
  const authorize = createSuperAdminAuthorizer(auth, db);

  async function deliveryState(uid: string): Promise<EmailDelivery> {
    const state = (await db.doc(`dispatcher_invitation_deliveries/${uid}`).get()).data()?.status;
    return ["sent", "failed", "emulated", "pending"].includes(state) ? state : "pending";
  }

  async function deliver(uid: string): Promise<EmailDelivery> {
    const profileRef = db.doc(`users/${uid}`);
    const deliveryRef = db.doc(`dispatcher_invitation_deliveries/${uid}`);
    const attemptId = randomUUID();
    const claimed = await db.runTransaction(async (tx) => {
      const [profile, delivery] = await tx.getAll(profileRef, deliveryRef);
      const user = profile.data(), previous = delivery.data();
      if (user?.role !== "dispatcher" || user.accountStatus !== "active" || user.invitationStatus !== "pending") {
        throw new ProvisioningError(409, "failed-precondition", "Only active, pending dispatcher invitations can be resent.");
      }
      if (previous?.status === "sending" && previous.leaseUntilMs > now()) {
        throw new ProvisioningError(409, "operation-in-progress", "An invitation is being sent. Please wait before retrying.");
      }
      // Retries after a lost response must not immediately send another email.
      if (previous && ["sent", "emulated"].includes(previous.status) && previous.lastAttemptMs > now() - 60000) {
        return { cached: previous.status as EmailDelivery, email: "" };
      }
      tx.set(deliveryRef, { status: "sending", attemptId, leaseUntilMs: now() + 120000,
        lastAttemptMs: now(), updatedAt: timestamp() });
      return { email: user.email as string };
    });
    if (claimed.cached) return claimed.cached;

    let status: EmailDelivery = "failed";
    try {
      if (typeof claimed.email !== "string" || !validEmail(claimed.email)) throw new Error("Invalid invitation recipient.");
      const account = await auth.getUser(uid);
      if (account.disabled || account.email?.toLowerCase() !== claimed.email) {
        throw new Error("Invitation target is unavailable.");
      }
      const link = await auth.generatePasswordResetLink(claimed.email, { url: continueUrl, handleCodeInApp: false });
      status = await sendSetupEmail(claimed.email, link);
    } catch {
      // Account/profile/audit are already committed. Email failure never rolls them back.
      status = "failed";
    }
    try {
      await db.runTransaction(async (tx) => {
        const current = await tx.get(deliveryRef);
        if (current.data()?.attemptId !== attemptId) return;
        tx.update(deliveryRef, { status, leaseUntilMs: 0, updatedAt: timestamp() });
        tx.update(profileRef, { invitationDeliveryStatus: status, updatedAt: timestamp() });
      });
    } catch {
      // Delivery may have succeeded but its receipt could not be recorded.
      return "unknown";
    }
    return status;
  }

  async function create(authorization: string | undefined, body: unknown): Promise<Result> {
    const actorUid = await authorize(authorization);
    const input = normalizeDispatcher(body);
    const operationId = hash(`${actorUid}:${input.requestId}`);
    const fingerprint = hash(JSON.stringify([input.fullName, input.email]));
    const opRef = db.doc(`dispatcher_provisioning_operations/${operationId}`);
    const emailRef = db.doc(`dispatcher_provisioning_emails/${hash(input.email)}`);
    const candidateUid = `dispatcher-${randomUUID()}`;
    const dispatcherId = `DSP-${new Date(now()).getUTCFullYear()}-${candidateUid.slice(11).replace(/-/g, "").toUpperCase()}`;
    const reserved = await db.runTransaction(async (tx) => {
      const [operation, email] = await tx.getAll(opRef, emailRef);
      const prior = operation.data();
      if (prior) {
        if (prior.fingerprint !== fingerprint) {
          throw new ProvisioningError(409, "request-conflict", "This request ID was already used for different dispatcher details.");
        }
        if (prior.status === "complete") return { fresh: false, uid: prior.uid as string, dispatcherId: prior.dispatcherId as string };
        throw new ProvisioningError(409, prior.status === "creating" ? "operation-in-progress" : "operation-recovery-required",
          prior.status === "creating" ? "Provisioning is in progress. Retry the same request shortly." :
            "Provisioning requires trusted recovery. Do not create another account for this request.");
      }
      if (email.exists) throw new ProvisioningError(409, "already-exists", "An account with this email already exists or is being created.");
      tx.create(opRef, { actorUid, fingerprint, uid: candidateUid, dispatcherId, status: "creating", createdAt: timestamp() });
      tx.create(emailRef, { operationId, uid: candidateUid, createdAt: timestamp() });
      return { fresh: true, uid: candidateUid, dispatcherId };
    });
    if (!reserved.fresh) {
      return { uid: reserved.uid, dispatcherId: reserved.dispatcherId, emailDelivery: await deliveryState(reserved.uid) };
    }

    let authCreated = false;
    try {
      // Never return, log, or persist this password; it only goes to Admin Auth.
      await auth.createUser({ uid: reserved.uid, email: input.email, displayName: input.fullName,
        password: `Sp1!${randomBytes(32).toString("base64url")}`, emailVerified: false, disabled: false });
      authCreated = true;
      await db.runTransaction(async (tx) => {
        const [caller, operation] = await tx.getAll(db.doc(`users/${actorUid}`), opRef);
        if (caller.data()?.role !== "super_admin" || caller.data()?.accountStatus !== "active") {
          throw new ProvisioningError(403, "permission-denied", "Super Admin access changed during provisioning.");
        }
        if (operation.data()?.uid !== reserved.uid || operation.data()?.status !== "creating") {
          throw new ProvisioningError(409, "request-conflict", "Provisioning reservation changed.");
        }
        // These Firestore writes are atomic together. Auth creation and email are not.
        tx.create(db.doc(`users/${reserved.uid}`), {
          uid: reserved.uid, dispatcherId: reserved.dispatcherId, fullName: input.fullName, email: input.email,
          role: "dispatcher", accountStatus: "active", invitationStatus: "pending", emailVerified: false,
          invitationDeliveryStatus: "pending", createdBy: actorUid, createdAt: timestamp(), updatedAt: timestamp(),
        });
        tx.create(db.doc(`audit_logs/dispatcher-created-${reserved.uid}`), {
          action: "SUPER_ADMIN_CREATED_DISPATCHER", actorUid, actorRole: "super_admin", targetUid: reserved.uid,
          targetType: "dispatcher", metadata: { dispatcherId: reserved.dispatcherId }, createdAt: timestamp(),
        });
        tx.update(opRef, { status: "complete", completedAt: timestamp() });
      });
    } catch (error) {
      // A commit response can be lost after the transaction actually committed.
      // Confirm that outcome before considering any rollback.
      let complete: boolean;
      try {
        complete = (await opRef.get()).data()?.status === "complete";
      } catch {
        throw new ProvisioningError(503, "operation-recovery-required", "Provisioning outcome is uncertain. Retry the same request; trusted recovery may be required.");
      }
      if (!complete) {
        // On ambiguous Auth failure, do not delete a possibly pre-existing user.
        const definiteAuthFailure = ["auth/email-already-exists", "auth/invalid-email", "auth/invalid-password", "auth/uid-already-exists"].includes(errorCode(error) ?? "");
        if (!authCreated && !definiteAuthFailure) {
          await opRef.update({ status: "recovery_required", updatedAt: timestamp() }).catch(() => undefined);
          throw new ProvisioningError(503, "operation-recovery-required", "Auth creation could not be confirmed. Trusted recovery is required before retrying.");
        }
        try {
          // Delete only a user whose createUser call succeeded in THIS operation.
          if (authCreated) await auth.deleteUser(reserved.uid);
          await db.runTransaction(async (tx) => {
            const [operation, email] = await tx.getAll(opRef, emailRef);
            if (operation.data()?.uid !== reserved.uid || operation.data()?.status === "complete") {
              throw new Error("Reservation changed during rollback.");
            }
            tx.delete(opRef);
            if (email.data()?.operationId === operationId) tx.delete(emailRef);
          });
        } catch {
          await opRef.update({ status: "recovery_required", updatedAt: timestamp() }).catch(() => undefined);
          throw new ProvisioningError(503, "operation-recovery-required", "Provisioning cleanup requires trusted recovery. No pre-existing account was removed.");
        }
        if (errorCode(error) === "auth/email-already-exists") {
          throw new ProvisioningError(409, "already-exists", "An account with this email already exists.");
        }
        if (errorCode(error) === "auth/invalid-email") {
          throw new ProvisioningError(400, "invalid-argument", "Please enter a valid dispatcher email address.");
        }
        if (error instanceof ProvisioningError) throw error;
        throw new ProvisioningError(503, "unavailable", "Dispatcher creation failed and was rolled back. You can retry this request.");
      }
    }

    let emailDelivery: EmailDelivery;
    try {
      emailDelivery = await deliver(reserved.uid);
    } catch {
      emailDelivery = "unknown";
    }
    return { uid: reserved.uid, dispatcherId: reserved.dispatcherId, emailDelivery };
  }

  async function resend(authorization: string | undefined, body: unknown): Promise<Result> {
    await authorize(authorization);
    const data = inputObject(body, ["uid"]);
    if (typeof data.uid !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(data.uid)) {
      throw new ProvisioningError(400, "invalid-argument", "A valid dispatcher UID is required.");
    }
    const profile = (await db.doc(`users/${data.uid}`).get()).data();
    if (profile?.role !== "dispatcher") throw new ProvisioningError(404, "not-found", "Dispatcher invitation not found.");
    return { uid: data.uid, dispatcherId: profile.dispatcherId as string, emailDelivery: await deliver(data.uid) };
  }

  return { create, resend };
}
