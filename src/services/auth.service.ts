import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  signOut,
  User,
  UserCredential,
} from "firebase/auth";

import { auth } from "@/src/firebase/config";
import {
  getFirebaseErrorCode,
  getFirebaseErrorMessage,
  logRegistrationDebug,
  logRegistrationError,
} from "@/src/utils/registrationDebug";

type VerificationEmailResponse = {
  success: boolean;
  alreadyVerified: boolean;
  message: string;
};

async function authDeadline<T>(work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([work, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(Object.assign(new Error("The authentication request could not be confirmed. Retry to continue."),
        { code: "auth/operation-timeout" })), 20_000);
    })]);
  } finally { clearTimeout(timer); }
}

export async function registerUser(
  email: string,
  password: string,
  recover = false
): Promise<UserCredential> {
  // Explicit registration recovery proves ownership; never used by loginUser.
  if (recover) {
    try { return await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password); }
    catch (error) {
      const code = getFirebaseErrorCode(error) ?? "auth/recovery-failed";
      let message = "Unable to authenticate this account for recovery. Try again, or contact support.";
      if (["auth/invalid-credential", "auth/invalid-login-credentials", "auth/wrong-password", "auth/user-not-found"].includes(code)) {
        message = "We could not authenticate this email and password. Use the password from your original registration. Check your email address; if you forgot the password, use Forgot Password on the sign-in screen, then return to recover registration. Your existing account has been kept.";
      } else if (code === "auth/user-disabled") message = "This account is disabled. Contact support; registration recovery cannot reactivate it.";
      else if (code === "auth/network-request-failed") message = "Unable to reach authentication. Check your connection and retry recovery.";
      else if (code === "auth/too-many-requests") message = "Too many recovery attempts. Wait a while before retrying, or reset your password from the sign-in screen.";
      throw Object.assign(new Error(message), { code, registrationStep: "recovery-authentication" });
    }
  }
  logRegistrationDebug({
    step: "createUserWithEmailAndPassword:start",
    uid: null,
    firebaseErrorCode: null,
    firebaseErrorMessage: null,
  });

  try {
    const userCredential = await createUserWithEmailAndPassword(
      auth,
      email.trim(),
      password
    );

    logRegistrationDebug({
      step: "createUserWithEmailAndPassword:success",
      uid: userCredential.user.uid,
      firebaseErrorCode: null,
      firebaseErrorMessage: null,
    });

    return userCredential;
  } catch (error) {
    logRegistrationError({
      step: "createUserWithEmailAndPassword:error",
      uid: null,
      firebaseErrorCode: getFirebaseErrorCode(error),
      firebaseErrorMessage: getFirebaseErrorMessage(error),
    });

    throw error;
  }
}

export async function loginUser(
  email: string,
  password: string,
  rememberMe: boolean = false
): Promise<UserCredential> {
  const { applyLoginPersistence } = await import("@/src/firebase/authPersistence");
  const previousUser = auth.currentUser;
  await authDeadline(applyLoginPersistence(auth, rememberMe));
  if (auth.currentUser !== previousUser) throw Object.assign(new Error("Your account changed. Retry sign-in."), { code: "auth/user-mismatch" });
  return await authDeadline(signInWithEmailAndPassword(
    auth,
    email.trim(),
    password
  ));
}

export async function resetPassword(email: string): Promise<void> {
  const normalized = email.trim().toLowerCase();
  if (normalized.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new Error("Please enter a valid email address.");
  }
  try {
    // The Console email template selects the action handler. A continue URL
    // would only select a destination AFTER handling the action.
    await authDeadline(sendPasswordResetEmail(auth, normalized));
  } catch (error) {
    switch (getFirebaseErrorCode(error)) {
      // Preserve the same neutral outcome with or without enumeration protection.
      case "auth/user-not-found":
      case "auth/user-disabled":
        return;
      case "auth/invalid-email":
        throw new Error("Please enter a valid email address.");
      case "auth/network-request-failed":
        throw new Error("Unable to send the reset request. Check your connection and try again.");
      case "auth/too-many-requests":
        throw new Error("Too many reset requests. Please wait a while before trying again.");
      default:
        throw new Error("Unable to send the reset request right now. Please try again later.");
    }
  }
}

function passwordChangeErrorMessage(error: unknown): string {
  switch (getFirebaseErrorCode(error)) {
    case "auth/wrong-password":
    case "auth/invalid-credential":
    case "auth/invalid-login-credentials":
      return "Your current password is incorrect. Please try again.";
    case "auth/weak-password":
    case "auth/password-does-not-meet-requirements":
      return "Choose a stronger password with at least 8 characters that meets your account's password requirements.";
    case "auth/network-request-failed":
      return "Unable to reach the authentication service. Check your connection and try again.";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait a while before trying again.";
    case "auth/requires-recent-login":
      return "For your security, please sign in again before changing your password.";
    case "auth/user-token-expired":
    case "auth/invalid-user-token":
    case "auth/user-not-found":
    case "auth/user-disabled":
    case "auth/user-mismatch":
      return "Your session is no longer valid. Please sign in again.";
    default:
      return "Unable to change your password. Please try again.";
  }
}

export async function changePassword(
  currentPassword: string,
  newPassword: string,
  confirmPassword: string
): Promise<void> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("Please sign in before changing your password.");
  }
  if (user.isAnonymous || !user.email || !user.providerData.some(
    (provider) => provider.providerId === EmailAuthProvider.PROVIDER_ID
  )) {
    throw new Error("Password changes are available for email/password accounts only. Manage your password with your sign-in provider.");
  }
  // Preserve the exact password values, including intentional spaces.
  if (!currentPassword.length) {
    throw new Error("Enter your current password.");
  }
  if (newPassword.length < 8) {
    throw new Error("Your new password must contain at least 8 characters.");
  }
  if (newPassword !== confirmPassword) {
    throw new Error("Your new password and confirmation must match.");
  }
  if (newPassword === currentPassword) {
    throw new Error("Choose a new password different from your current password.");
  }

  try {
    const credential = EmailAuthProvider.credential(user.email, currentPassword);
    await authDeadline(reauthenticateWithCredential(user, credential));
    // Never update a captured user's password after logout or an account switch.
    if (auth.currentUser !== user) {
      throw Object.assign(new Error("Session changed."), { code: "auth/user-mismatch" });
    }
    await authDeadline(updatePassword(user, newPassword));
    if (auth.currentUser !== user) {
      throw Object.assign(new Error("Session changed."), { code: "auth/user-mismatch" });
    }
  } catch (error) {
    // Return only safe, actionable messages; never log credentials or raw errors.
    throw new Error(passwordChangeErrorMessage(error));
  }
}

export async function sendVerificationEmail(
  user: User
): Promise<VerificationEmailResponse> {
  const requireCurrentUser = () => {
    if (auth.currentUser !== user) throw Object.assign(new Error("Your account changed. Sign in again to verify your email."), { code: "auth/user-mismatch" });
  };
  requireCurrentUser();
  logRegistrationDebug({
    step: "sendEmailVerification:reload-user:start",
    uid: user.uid,
    firebaseErrorCode: null,
    firebaseErrorMessage: null,
  });

  try {
    await authDeadline(user.reload());
    requireCurrentUser();
  } catch (error) {
    logRegistrationError({
      step: "sendEmailVerification:reload-user:error",
      uid: user.uid,
      firebaseErrorCode: getFirebaseErrorCode(error),
      firebaseErrorMessage: getFirebaseErrorMessage(error),
    });

    throw Object.assign(error instanceof Error ? error : new Error("Unable to refresh verification state."), {
      code: getFirebaseErrorCode(error) ?? "auth/verification-refresh-failed", registrationStep: "verification-refresh",
    });
  }

  if (user.emailVerified) {
    logRegistrationDebug({
      step: "sendEmailVerification:already-verified",
      uid: user.uid,
      firebaseErrorCode: null,
      firebaseErrorMessage: null,
    });

    return {
      success: true,
      alreadyVerified: true,
      message: "Email is already verified.",
    };
  }

  logRegistrationDebug({
    step: "sendEmailVerification:start",
    uid: user.uid,
    firebaseErrorCode: null,
    firebaseErrorMessage: null,
  });

  try {
    await authDeadline(sendEmailVerification(user));
    requireCurrentUser();
  } catch (error) {
    logRegistrationError({
      step: "sendEmailVerification:error",
      uid: user.uid,
      firebaseErrorCode: getFirebaseErrorCode(error),
      firebaseErrorMessage: getFirebaseErrorMessage(error),
    });

    throw Object.assign(error instanceof Error ? error : new Error("Unable to request verification email."), {
      code: getFirebaseErrorCode(error) ?? "auth/verification-request-failed", registrationStep: "send-verification",
    });
  }

  logRegistrationDebug({
    step: "sendEmailVerification:success",
    uid: user.uid,
    firebaseErrorCode: null,
    firebaseErrorMessage: null,
  });

  return {
    success: true,
    alreadyVerified: false,
    message: "Verification email request accepted. Inbox delivery is not confirmed.",
  };
}

export async function logoutUser(): Promise<void> {
  // Confirm marker removal before invalidating the session that authorizes it.
  const { foregroundSharing } = await import("@/src/services/foreground-location.service");
  await foregroundSharing.stop();
  await signOut(auth);
}

export async function logoutRevokedUser(): Promise<void> {
  const user = auth.currentUser;
  const { foregroundSharing } = await import("@/src/services/foreground-location.service");
  if (auth.currentUser !== user) return;
  // Cancel local tracking immediately. Do not wait on a now-forbidden network
  // cleanup write: the backend atomically removed the shared coordinates.
  foregroundSharing.endRevokedSession();
  await signOut(auth);
}
