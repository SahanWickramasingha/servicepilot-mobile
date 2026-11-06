import { auth } from "@/src/firebase/config";
import Constants from "expo-constants";
import { registerUser, sendVerificationEmail } from "./auth.service";
import { createUserProfile, inspectRegistrationProfile, markUserEmailVerified, validateRegistrationProfile,
  type UserProfileData, type RegistrationProfileConfirmation } from "./user.service";
import { beginProfileInitialization } from "./profile-initialization.service";
import { clearOnboardingDraft, getOnboardingDraft, saveOnboardingDraft } from "./onboarding-draft.service";
import { logRegistrationFailure } from "@/src/utils/registrationDebug";

export type RegistrationResult = {
  next: "verify-email" | "profile-setup" | "technician-pending" | "login";
  role?: RegistrationProfileConfirmation["role"];
  accessMessage?: string;
  verificationRequested?: boolean;
};
let operation: object | undefined;
let lastVerification: { owner: import("firebase/auth").User; at: number } | undefined;
export function verificationResendSeconds(): number {
  return lastVerification?.owner === auth.currentUser ? Math.max(0, Math.ceil((60_000 - (Date.now() - lastVerification.at)) / 1000)) : 0;
}
export const ONBOARDING_OPERATION_TIMEOUT_MS = 20_000;

async function bounded<T>(action: Promise<T>, stage: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([action, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(Object.assign(new Error("Setup could not be confirmed. Retry to continue with your existing account."),
        { code: "registration/operation-timeout", registrationStep: stage })), ONBOARDING_OPERATION_TIMEOUT_MS);
    })]);
  } finally { clearTimeout(timer); }
}
function diagnose(error: unknown, stage: string) {
  logRegistrationFailure(error, stage, { appVersion: Constants.expoConfig?.version, projectId: auth.app?.options.projectId });
}
function verificationRequestFailed(user: import("firebase/auth").User, error: unknown) {
  const code = (error as { code?: string })?.code;
  // Throttling and uncertain timeouts need backoff, not a delivery claim.
  if (auth.currentUser === user && ["auth/too-many-requests", "auth/operation-timeout", "registration/operation-timeout"].includes(code ?? "")) {
    lastVerification = { owner: user, at: Date.now() };
  }
}
function nextForProfile(profile: RegistrationProfileConfirmation): RegistrationResult {
  if (!profile.policyCurrent) return { next: "login", role: profile.role, accessMessage: "Sign in to review the current Terms and Privacy Policy." };
  if (profile.role === "technician") {
    if (profile.technicianApprovalStatus === "pending") return { next: "technician-pending", role: profile.role };
    if (profile.technicianApprovalStatus === "rejected") return { next: "login", role: profile.role, accessMessage: "Your application was not approved. Contact support for help." };
  }
  return { next: "login", role: profile.role };
}

/** Auth and a memory draft only; no profile write until verification. */
export async function registerAccount(email: string, password: string, data: Omit<UserProfileData, "uid">, recover = false): Promise<RegistrationResult> {
  if (operation) throw Object.assign(new Error("Account setup is already in progress."), { code: "registration/in-progress" });
  if (auth.currentUser) throw new Error("Sign out before starting account registration.");
  validateRegistrationProfile(data);
  if (email.trim().toLowerCase() !== data.email.trim().toLowerCase()) throw new Error("Use the same email address for account and profile setup.");
  const initialization = beginProfileInitialization(email);
  const attempt = {}; operation = attempt;
  const requireCurrent = (user: import("firebase/auth").User) => {
    initialization.assertCurrent(user);
    if (auth.currentUser !== user) throw Object.assign(new Error("Your account changed. Sign in again."), { code: "auth/registration-account-changed" });
  };
  let stage = recover ? "recovery-authentication" : "auth-create";
  try {
    const { user } = await bounded(registerUser(email, password, recover), stage);
    requireCurrent(user);
    saveOnboardingDraft(user, data);
    stage = "profile-existence-read";
    await bounded(inspectRegistrationProfile(user, data.role), stage);
    requireCurrent(user);
    stage = "send-verification";
    try {
      const result = await bounded(sendVerificationEmail(user), stage);
      requireCurrent(user);
      if (result.alreadyVerified) return { next: "profile-setup", role: data.role };
      lastVerification = { owner: user, at: Date.now() };
      return { next: "verify-email", role: data.role, verificationRequested: true };
    } catch (error) {
      verificationRequestFailed(user, error);
      diagnose(error, stage);
      requireCurrent(user);
      return { next: "verify-email", role: data.role, verificationRequested: false };
    }
  } catch (error) { diagnose(error, stage); throw error; }
  finally { initialization.finish(); if (operation === attempt) operation = undefined; }
}

export async function requestOnboardingVerification() {
  const user = auth.currentUser;
  if (!user) throw Object.assign(new Error("Sign in to verify your email."), { code: "auth/no-current-user" });
  if (operation) throw Object.assign(new Error("Account setup is already in progress."), { code: "registration/in-progress" });
  if (verificationResendSeconds() > 0) {
    throw Object.assign(new Error("Wait before requesting another verification email."), { code: "registration/resend-cooldown" });
  }
  const attempt = {}; operation = attempt;
  try {
    const result = await bounded(sendVerificationEmail(user), "send-verification");
    if (auth.currentUser !== user) throw Object.assign(new Error("Your account changed. Sign in again."), { code: "auth/registration-account-changed" });
    lastVerification = result.alreadyVerified ? undefined : { owner: user, at: Date.now() };
    return result;
  } catch (error) { verificationRequestFailed(user, error); diagnose(error, "send-verification"); throw error; }
  finally { if (operation === attempt) operation = undefined; }
}

/** Shared verification/recovery transition. Missing memory draft on restart
 * leads to explicit field re-entry, never a replacement Auth identity. */
export async function completeVerifiedRegistration(data = getOnboardingDraft()): Promise<RegistrationResult> {
  if (operation) throw Object.assign(new Error("Account setup is already in progress."), { code: "registration/in-progress" });
  const user = auth.currentUser;
  if (!user) throw Object.assign(new Error("Sign in to continue account setup."), { code: "auth/no-current-user" });
  const initialization = beginProfileInitialization(user.email ?? "");
  const attempt = {}; operation = attempt;
  let stage = "verification-refresh";
  let emailVerificationConfirmed = false;
  const current = () => {
    initialization.assertCurrent(user);
    if (auth.currentUser !== user) throw Object.assign(new Error("Your account changed. Sign in again."), { code: "auth/registration-account-changed" });
  };
  try {
    current();
    await bounded(user.reload(), stage); current();
    const token = await bounded(user.getIdTokenResult(true), stage); current();
    stage = "verification-check";
    if (!user.emailVerified || token.claims.email_verified !== true) {
      throw Object.assign(new Error("Open your verification link, then try again."), { code: "registration/email-not-verified" });
    }
    emailVerificationConfirmed = true;
    stage = "profile-existence-read";
    let profile = await bounded(inspectRegistrationProfile(user, data?.role), stage); current();
    if (!profile) {
      if (!data) return { next: "profile-setup" };
      validateRegistrationProfile(data);
      if (data.email.trim().toLowerCase() !== user.email?.trim().toLowerCase()) throw Object.assign(new Error("Use your signed-in email for profile setup."), { code: "registration/identity-mismatch" });
      saveOnboardingDraft(user, data);
      stage = "profile-create";
      profile = await bounded(createUserProfile({ ...data, uid: user.uid }, { recoverExisting: true }), stage); current();
    } else {
      stage = "profile-email-verification";
      if (!profile.emailVerified) { await bounded(markUserEmailVerified(user.uid), stage); current(); }
    }
    clearOnboardingDraft();
    return nextForProfile(profile);
  } catch (error) {
    const failure = Object.assign(error instanceof Error ? error : new Error("Unable to complete account setup."), {
      code: (error as { code?: string })?.code ?? "registration/unknown",
      registrationStep: (error as { registrationStep?: string })?.registrationStep ?? stage,
      ...(emailVerificationConfirmed ? { emailVerificationConfirmed: true } : {}),
      ...((error as { profileWriteCommitted?: boolean })?.profileWriteCommitted === true ? { profileWriteCommitted: true } : {}),
    });
    diagnose(failure, stage); throw failure;
  }
  finally { initialization.finish(); if (operation === attempt) operation = undefined; }
}
