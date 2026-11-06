type Failure = { code?: string; registrationStep?: string; emailVerificationConfirmed?: boolean; profileWriteCommitted?: boolean };

export function onboardingFailureFeedback(error: Failure | null | undefined, resend = false) {
  const code = error?.code;
  const emailVerified = error?.emailVerificationConfirmed === true;
  let message: string;
  if (["auth/no-current-user", "auth/user-token-expired", "auth/invalid-user-token", "auth/user-disabled", "auth/user-not-found",
    "auth/user-mismatch", "auth/registration-account-changed"].includes(code ?? "")) {
    message = "Your sign-in session changed or is no longer valid. Sign in again to continue with your existing account.";
  } else if (code === "registration/email-not-verified") {
    message = "Your email is not verified yet. Open your verification link, then try again.";
  } else if (emailVerified) {
    message = error?.profileWriteCommitted ?
      "Your email is verified. Your profile was saved, but its server confirmation could not be completed. Continue setup to check the saved profile safely." :
      code === "permission-denied" ?
        "Your email is verified, but profile setup was denied. Your account has been kept. Continue setup to retry safely, or contact support if this continues." :
        "Your email is verified, but profile setup could not be completed. Your account has been kept. Continue setup to retry safely.";
  } else if (code === "auth/too-many-requests") {
    message = "Too many verification requests. Wait before trying again.";
  } else if (code === "registration/resend-cooldown") {
    message = "Wait before requesting another verification email.";
  } else if (code === "registration/in-progress") {
    message = "An account setup request is already in progress. Wait for it to finish.";
  } else if (error?.registrationStep === "verification-refresh" || !resend) {
    message = "Unable to refresh your verification state. Check your connection and retry.";
  } else if (["auth/operation-timeout", "registration/operation-timeout"].includes(code ?? "")) {
    message = "The verification email request could not be confirmed. Wait before trying again; inbox delivery is not confirmed.";
  } else {
    message = "Verification email request failed. Check your connection and retry.";
  }
  return { message, emailVerified };
}
