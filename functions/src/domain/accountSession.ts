export type SessionProfile = { accountStatus?: unknown; lifecyclePending?: unknown; sessionRevokedAt?: unknown };

export function accountSessionDenial(profile: SessionProfile | null, authTime?: number): string | null {
  if (!profile) return "Your account profile is unavailable. Please contact support.";
  if (profile.accountStatus === "deleted") return "This ServicePilot account has been deleted. Please contact support.";
  if (profile.accountStatus === "disabled") return "Your ServicePilot account has been disabled. Please contact support.";
  if (profile.lifecyclePending === true) return "An administrator is updating your account. Access is blocked until the action completes.";
  if (profile.accountStatus !== undefined && profile.accountStatus !== "active") return "Your account is not active. Please contact support.";
  if (profile.sessionRevokedAt !== undefined &&
    (typeof profile.sessionRevokedAt !== "number" || !Number.isFinite(profile.sessionRevokedAt) ||
      typeof authTime !== "number" || !(authTime > profile.sessionRevokedAt))) {
    return "Your previous session has ended. Please sign in again to start a new session.";
  }
  return null;
}
