import { createHash, randomUUID } from "node:crypto";
import type { Auth } from "firebase-admin/auth";
import type { Firestore } from "firebase-admin/firestore";
import { TrustedRequestError } from "./trustedRequestError";
import type { DecisionEmailMessage, DecisionEmailResult, DecisionEmailStatus } from "./technicianDecisionEmailTypes";
export type { DecisionEmailMessage, DecisionEmailResult, DecisionEmailStatus } from "./technicianDecisionEmailTypes";

type Dependencies = { auth: Auth; db: Firestore; serverTimestamp: () => unknown; sender?: string;
  provider?: "resend" | "gmail";
  sendEmail?: (message: DecisionEmailMessage, key: string) => Promise<{ id: string }>; now?: () => number };
type SavedProfile = Record<string, unknown> & { uid: string; fullName: string; email: string;
  technicianApprovalStatus: "approved" | "rejected"; rejectionReason?: string; reviewedBy: string };
type Receipt = { status?: DecisionEmailStatus | "sending"; everUncertain?: boolean; firstSendMs?: number;
  provider?: "resend" | "gmail"; leaseUntilMs?: number };
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const safeWindowMs = 23 * 60 * 60 * 1000; // Resend retains keys 24h; leave a safety margin.
const escapeHtml = (text: string) => text.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[character]!);
const validEmail = (email: unknown): email is string => typeof email === "string" && email.length <= 254 &&
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?\.[a-zA-Z]{2,}$/.test(email);

export function decisionEmailMessage(from: string, to: string, name: string, status: "approved" | "rejected", reason: string): DecisionEmailMessage {
  if (status === "approved") {
    const firstName = name.trim().split(/\s+/)[0];
    const greeting = firstName ? `Welcome to ServicePilot, ${firstName}!` : "Welcome to ServicePilot!";
    const preview = "Sign in to ServicePilot to complete your technician profile.";
    const message = "Your technician application has been approved. You can now sign in to the ServicePilot app using the email address you registered with.";
    const steps = [
      "Open the ServicePilot app and sign in.",
      "Review your technician profile and service area.",
      "Set your availability when you're ready to receive service requests.",
    ];
    const footer = "You received this email because you applied to become a technician on ServicePilot. This is an automated email.";
    const text = `APPLICATION APPROVED\n\n${greeting}\n\n${message}\n\nWhat to do next\n${steps.map((step, index) => `${index + 1}. ${step}`).join("\n")}\n\nSee you in the app,\nThe ServicePilot Team\n\n${footer}`;
    // Tables and inline styles support Gmail and Outlook without external CSS.
    // The Outlook wrapper constrains desktop width; other clients stay fluid.
    const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Your ServicePilot technician application is approved</title></head>
<body style="margin:0;padding:0;background-color:#eef2f6;color:#172b45;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;">
  <div style="display:none!important;visibility:hidden;opacity:0;height:0;width:0;max-height:0;max-width:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;">${preview}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#eef2f6" style="width:100%;background-color:#eef2f6;">
    <tr><td align="center" style="padding:24px 12px;">
      <!--[if mso]><table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0"><tr><td><![endif]-->
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;">
        <tr><td bgcolor="#10243a" style="padding:24px 28px;background-color:#10243a;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>
            <td width="40" valign="middle" style="width:40px;padding:0 12px 0 0;vertical-align:middle;"><img src="https://servicepilot-756d9.web.app/assets/images/servicepilot-logo.png" alt="" width="40" height="40" border="0" style="display:block;width:40px;height:40px;border:0;outline:none;text-decoration:none;"></td>
            <td valign="middle" style="padding:0;vertical-align:middle;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:24px;line-height:30px;font-weight:bold;white-space:nowrap;">ServicePilot</td>
          </tr></table>
        </td></tr>
        <tr><td bgcolor="#ffffff" style="padding:32px 28px;background-color:#ffffff;overflow-wrap:anywhere;word-break:break-word;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td bgcolor="#e8f5ed" style="padding:8px 12px;background-color:#e8f5ed;color:#1b623b;border-radius:6px;font-size:12px;line-height:18px;font-weight:bold;letter-spacing:1px;">APPLICATION APPROVED</td></tr></table>
          <h1 style="margin:24px 0 16px;color:#10243a;font-size:26px;line-height:34px;font-weight:bold;">${escapeHtml(greeting)}</h1>
          <p style="margin:0 0 24px;font-size:16px;line-height:26px;">${message}</p>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;"><tr><td bgcolor="#f4f7fa" style="padding:20px;background-color:#f4f7fa;border:1px solid #dce4ec;">
            <h2 style="margin:0 0 16px;color:#10243a;font-size:20px;line-height:28px;">What to do next</h2>
            <ol style="margin:0;padding:0 0 0 24px;font-size:16px;line-height:26px;">${steps.map(step => `<li style="margin:0 0 12px;padding-left:4px;">${escapeHtml(step)}</li>`).join("")}</ol>
          </td></tr></table>
          <p style="margin:24px 0 0;font-size:16px;line-height:26px;">See you in the app,<br><strong>The ServicePilot Team</strong></p>
        </td></tr>
        <tr><td style="padding:20px 28px;color:#4b5d70;font-size:13px;line-height:21px;">${footer}</td></tr>
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td></tr>
  </table>
</body>
</html>`;
    return { from, to: [to], subject: "Your ServicePilot technician application is approved", text, html };
  }
  const subject = "Update on your ServicePilot technician application";
  const message = "Your technician application was not approved. The reason for this decision is:";
  const text = `Hello ${name},\n\n${message}\n\n${reason}\n\nThe ServicePilot team`;
  const html = `<p>Hello ${escapeHtml(name)},</p><p>${escapeHtml(message)}</p><blockquote style="white-space:pre-wrap">${escapeHtml(reason)}</blockquote><p>The ServicePilot team</p>`;
  return { from, to: [to], subject, text, html };
}

function timestampRevision(input: unknown): string {
  const value = input as { seconds?: number; nanoseconds?: number; iso?: string } | undefined;
  if (Number.isInteger(value?.seconds) && Number.isInteger(value?.nanoseconds) && value!.seconds! > 0 && value!.nanoseconds! >= 0 && value!.nanoseconds! < 1e9) return `${value!.seconds}.${String(value!.nanoseconds).padStart(9, "0")}`;
  if (typeof value?.iso === "string") {
    const match = /^(.*?)(?:\.(\d{1,9}))?Z$/.exec(value.iso);
    if (match && Number.isFinite(Date.parse(value.iso))) return `${Math.floor(Date.parse(value.iso) / 1000)}.${(match[2] ?? "").padEnd(9, "0")}`;
  }
  throw new TrustedRequestError(409, "decision-unavailable", "A saved server review timestamp is required.");
}

function savedDecision(uid: string, profile: Record<string, unknown> | undefined) {
  if (!profile || profile.uid !== uid || profile.role !== "technician" || profile.emailVerified !== true ||
    profile.technicianApprovalStatus !== "approved" && profile.technicianApprovalStatus !== "rejected" ||
    typeof profile.reviewedBy !== "string" || !profile.reviewedBy.trim() ||
    typeof profile.fullName !== "string" || !profile.fullName.trim() || !validEmail(profile.email) ||
    profile.technicianApprovalStatus === "rejected" && (typeof profile.rejectionReason !== "string" || !profile.rejectionReason.trim() || profile.rejectionReason.length > 2000)) {
    throw new TrustedRequestError(409, "decision-unavailable", "A complete committed technician decision is required before requesting its email.");
  }
  const revision = hash(JSON.stringify([uid, timestampRevision(profile.reviewedAt), profile.technicianApprovalStatus, profile.reviewedBy]));
  return { revision, profile: profile as SavedProfile };
}

function eligibleReviewer(profile: Record<string, unknown> | undefined, authTime: number) {
  return profile && profile.lifecyclePending !== true &&
    (profile.role === "super_admin" && profile.accountStatus === "active" ||
      profile.role === "dispatcher" && (profile.accountStatus === undefined || profile.accountStatus === "active")) &&
    (profile.sessionRevokedAt === undefined || typeof profile.sessionRevokedAt === "number" && Number.isFinite(profile.sessionRevokedAt) && authTime > profile.sessionRevokedAt);
}

export function createTechnicianDecisionEmailService({ auth, db, serverTimestamp: stamp, sender, sendEmail, provider = "resend", now = Date.now }: Dependencies) {
  async function authorize(authorization?: string) {
    const token = /^Bearer ([^\s]+)$/.exec(authorization ?? "")?.[1];
    if (!token) throw new TrustedRequestError(401, "unauthenticated", "Sign in again to manage decision emails.");
    let decoded;
    try { decoded = await auth.verifyIdToken(token, true); }
    catch { throw new TrustedRequestError(401, "unauthenticated", "Your session is invalid or revoked. Sign in again."); }
    const actor = (await db.doc(`users/${decoded.uid}`).get()).data();
    if (!eligibleReviewer(actor, decoded.auth_time)) throw new TrustedRequestError(403, "permission-denied", "An active Super Admin or Dispatcher session is required.");
    return decoded;
  }
  async function request(authorization: string | undefined, body: unknown, statusOnly = false): Promise<DecisionEmailResult> {
    const actor = await authorize(authorization);
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(key => !["technicianUid", "revision"].includes(key))) {
      throw new TrustedRequestError(400, "invalid-argument", "Only a technician ID and optional decision revision are accepted.");
    }
    const input = body as { technicianUid?: unknown; revision?: unknown };
    if (typeof input.technicianUid !== "string" || !/^[a-zA-Z0-9:_-]{1,128}$/.test(input.technicianUid) ||
      input.revision !== undefined && (typeof input.revision !== "string" || !/^[a-f0-9]{64}$/.test(input.revision))) {
      throw new TrustedRequestError(400, "invalid-argument", "A valid technician ID and decision revision are required.");
    }
    const uid = input.technicianUid, userRef = db.doc(`users/${uid}`);
    const initial = savedDecision(uid, (await userRef.get()).data());
    if (input.revision && input.revision !== initial.revision) throw new TrustedRequestError(409, "decision-changed", "The decision changed. Reopen this application before retrying its email.");
    const revision = initial.revision, ref = db.doc(`technician_decision_emails/${revision}`);
    const result = (receipt: Receipt | undefined): DecisionEmailResult => {
      let status: DecisionEmailStatus = receipt?.status === "sending" ? "pending" : receipt?.status ?? "not_requested";
      const uncertain = receipt?.everUncertain || receipt?.status === "sending" || receipt?.status === "unknown";
      const expired = uncertain && (typeof receipt?.firstSendMs !== "number" || !Number.isFinite(receipt.firstSendMs) || now() - receipt.firstSendMs >= safeWindowMs);
      // Legacy receipts were Resend. Never move an uncertain send to a different
      // provider or retry Gmail after a timeout/crash: it has no idempotency key.
      const receiptProvider = receipt?.provider ?? "resend";
      const blocked = uncertain && (receiptProvider === "gmail" || receiptProvider !== provider);
      const inFlight = receipt?.status === "sending" && (receipt.leaseUntilMs ?? 0) > now();
      if ((expired || blocked && !inFlight) && status !== "submitted") status = "unknown";
      return { technicianUid: uid, revision, status, retryable: status !== "submitted" && !expired && !blocked };
    };
    if (statusOnly) return result((await ref.get()).data());
    const attemptId = randomUUID();
    const claim = await db.runTransaction(async tx => {
      const [reviewer, target, receipt] = await tx.getAll(db.doc(`users/${actor.uid}`), userRef, ref);
      if (!eligibleReviewer(reviewer.data(), actor.auth_time)) throw new TrustedRequestError(403, "permission-denied", "Reviewer access changed. Sign in again.");
      const current = savedDecision(uid, target.data()), previous = receipt.data();
      if (current.revision !== revision) throw new TrustedRequestError(409, "decision-changed", "The decision changed. Refresh the application.");
      if (previous?.status === "submitted" || previous?.leaseUntilMs > now() || previous?.retryAfterMs > now() ||
        previous && !result(previous).retryable) return { cached: result(previous) };
      const base = { technicianUid: uid, revision, updatedAt: stamp(), ...(previous ? {} : { createdAt: stamp() }) };
      if (!validEmail(sender) || !sendEmail) {
        const next = { ...previous, ...base, status: "not_configured" as const,
          everUncertain: !!previous?.everUncertain || ["sending", "unknown"].includes(previous?.status) };
        tx.set(ref, next); return { cached: result(next) };
      }
      // Freeze the entire provider payload. Name/email/template/config changes
      // cannot change the body associated with an already-used idempotency key.
      const payload = previous?.payload ?? decisionEmailMessage(sender, current.profile.email, current.profile.fullName,
        current.profile.technicianApprovalStatus, current.profile.rejectionReason ?? "");
      const next = { ...previous, ...base, payload, provider, status: "sending", attemptId, leaseUntilMs: now() + 120000,
        firstSendMs: !previous?.everUncertain && ["failed", "not_configured"].includes(previous?.status) ? now() : previous?.firstSendMs ?? now(),
        everUncertain: !!previous?.everUncertain || ["sending", "unknown"].includes(previous?.status) };
      tx.set(ref, next); return { payload: payload as DecisionEmailMessage };
    });
    if (claim.cached) return claim.cached;
    let status: DecisionEmailStatus = "failed", id = "", uncertain = false, providerAttempted = false;
    try {
      const current = savedDecision(uid, (await userRef.get()).data());
      const account = await auth.getUser(uid);
      if (current.revision !== revision || current.profile.lifecyclePending === true ||
        current.profile.accountStatus !== undefined && current.profile.accountStatus !== "active" || account.disabled ||
        account.email?.toLowerCase() !== claim.payload!.to[0].toLowerCase() || current.profile.email.toLowerCase() !== account.email?.toLowerCase()) {
        throw new Error("Recipient or decision is no longer eligible.");
      }
      providerAttempted = true;
      id = (await sendEmail!(claim.payload!, `technician-decision/${revision}`)).id;
      if (!id) throw Object.assign(new Error("Provider outcome unavailable."), { code: "email/outcome-unknown" });
      status = "submitted";
    } catch (error) {
      const code = (error as { code?: string })?.code;
      uncertain = code === "email/outcome-unknown" || providerAttempted && !["email/request-failed", "email/not-configured"].includes(code ?? "");
      status = uncertain ? "unknown" : "failed";
    }
    try {
      return await db.runTransaction(async tx => {
        const receipt = (await tx.get(ref)).data();
        if (receipt?.attemptId !== attemptId) return result(receipt);
        const next = { ...receipt, status, providerId: id, everUncertain: !!receipt.everUncertain || uncertain,
          leaseUntilMs: 0, retryAfterMs: status === "submitted" ? 0 : now() + 5000, updatedAt: stamp() };
        tx.set(ref, next); return result(next);
      });
    } catch {
      // No decision is repeated or rolled back. Only Resend can safely retry an
      // uncertain submission inside its idempotency window.
      const receipt = await ref.get().catch(() => null);
      if (receipt?.data()?.status === "submitted") return result(receipt.data());
      return { technicianUid: uid, revision, status: "unknown", retryable: provider === "resend" };
    }
  }
  return { request: (authorization: string | undefined, body: unknown) => request(authorization, body),
    status: (authorization: string | undefined, body: unknown) => request(authorization, body, true) };
}
