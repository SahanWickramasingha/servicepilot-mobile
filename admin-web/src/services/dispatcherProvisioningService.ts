import { auth } from "../firebase/config";

export type CreateDispatcherInput = { fullName: string; email: string; requestId: string };
export type CreateDispatcherResult = {
  uid: string;
  dispatcherId: string;
  emailDelivery: "sent" | "failed" | "pending" | "emulated" | "unknown";
};

const settings = (import.meta as ImportMeta & { env: { VITE_DISPATCHER_API_URL?: string; DEV?: boolean } }).env;

async function callBackend(path: string, input: unknown): Promise<CreateDispatcherResult | { targetUid: string; accountStatus: string; outcome: "complete" }> {
  const lifecycle = path === "/v1/accounts/lifecycle";
  const user = auth.currentUser;
  if (!user) throw new Error("Please sign in as Super Admin first.");
  if (!settings.VITE_DISPATCHER_API_URL) {
    throw new Error("Trusted account backend is not configured. Contact the portal administrator.");
  }
  const base = new URL(settings.VITE_DISPATCHER_API_URL);
  const local = settings.DEV && ["localhost", "127.0.0.1"].includes(base.hostname);
  if (base.username || base.password || base.search || base.hash || (base.protocol !== "https:" && !(local && base.protocol === "http:"))) {
    throw new Error("Dispatcher provisioning requires a trusted HTTPS backend.");
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    let token: string;
    try {
      token = await user.getIdToken();
    } catch {
      throw new Error("Unable to verify your session. Sign in again or retry when connected.");
    }
    if (auth.currentUser !== user) throw new Error("Your session changed. Please sign in again.");
    const response = await fetch(`${base.href.replace(/\/$/, "")}${path}`, {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(input), signal: controller.signal, credentials: "omit", redirect: "error",
    });
    if (auth.currentUser !== user) throw new Error("Your session changed. Please sign in again.");
    let result;
    try {
      result = await response.json();
    } catch {
      throw new Error("Backend response could not be confirmed. Retry the same request to check its outcome.");
    }
    if (auth.currentUser !== user) throw new Error("Your session changed. Please sign in again.");
    if (!response.ok) {
      const messages: Record<string, string> = {
        "unauthenticated": "Your session is invalid or expired. Please sign in again.",
        "permission-denied": "Only an active Super Admin can provision dispatchers.",
        "already-exists": "An account with this email already exists or is being created.",
        "operation-in-progress": "This request is in progress. Wait a moment and retry the same request.",
        "operation-recovery-required": "Provisioning needs trusted administrator recovery. Do not create a duplicate account.",
        "request-conflict": "This request ID has already been used. Close and reopen the form for different details.",
        "failed-precondition": "Only active, pending dispatcher invitations can be resent.",
        "invalid-argument": "Check the dispatcher name and email and try again.",
      };
      const lifecycleMessages: Record<string, string> = {
        "request-conflict": "This account changed since the request. Refresh the account before confirming another action.",
        "permission-denied": "Only an active Super Admin can manage accounts.",
        "protected-account": "Your own account and Super Admin accounts cannot be managed here.",
        "deleted-account": "Deleted accounts cannot be reactivated.",
        "pending-action": "Another lifecycle action is incomplete. Retry that action before starting a different action.",
        "operation-recovery-required": "An account operation stalled. Ask the backend operator to recover it before retrying.",
        "lifecycle-incomplete": "Account access remains blocked. Retry this action to finish the Auth update.",
        "invalid-argument": "The account action is invalid. Refresh the page and try again.",
        "not-found": "Account profile not found. Refresh the page.",
        "failed-precondition": "The account state cannot be managed automatically. Contact support.",
      };
      throw Object.assign(new Error((lifecycle ? lifecycleMessages[result?.code] : undefined) ?? messages[result?.code] ??
        "The backend outcome is unconfirmed. Retry the same action shortly."), { code: result?.code });
    }
    if (lifecycle) {
      if (!result || typeof result.targetUid !== "string" || !["active", "disabled", "deleted"].includes(result.accountStatus) || result.outcome !== "complete") {
        throw new Error("Account action could not be confirmed. Retry the same action.");
      }
      return { targetUid: result.targetUid, accountStatus: result.accountStatus, outcome: "complete" };
    }
    if (!result || typeof result.uid !== "string" || typeof result.dispatcherId !== "string" ||
      !["sent", "failed", "pending", "emulated", "unknown"].includes(result.emailDelivery)) {
      throw new Error("Provisioning response could not be confirmed. Retry the same request.");
    }
    return { uid: result.uid, dispatcherId: result.dispatcherId, emailDelivery: result.emailDelivery };
  } catch (error) {
    if (controller.signal.aborted || error instanceof TypeError) {
      throw new Error("Backend connection failed. The request may still be processing; retry the same request to check its outcome.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function createDispatcherInvitation(input: CreateDispatcherInput) {
  // Never send actor UID, trusted role, status, password, or dispatcher ID.
  return callBackend("/v1/dispatchers", { fullName: input.fullName, email: input.email, requestId: input.requestId }) as Promise<CreateDispatcherResult>;
}

export function resendDispatcherInvitation(uid: string) {
  return callBackend("/v1/dispatchers/resend-invitation", { uid }) as Promise<CreateDispatcherResult>;
}

export async function callAccountLifecycleBackend(input: { targetUid: string; action: string; requestId: string }): Promise<void> {
  await callBackend("/v1/accounts/lifecycle", input);
}
