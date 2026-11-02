import content from "./legal-content.json";
export const TERMS_VERSION = content.termsVersion;
export const PRIVACY_POLICY_VERSION = content.privacyPolicyVersion;
export const LEGAL_CONTENT = content;
export type PolicyAcceptance = { termsVersion?: unknown; privacyPolicyVersion?: unknown; acceptedAt?: unknown };
export function hasCurrentPolicyAcceptance(value: PolicyAcceptance | null | undefined): boolean {
  const timestamp = value?.acceptedAt instanceof Date ? value.acceptedAt.getTime() :
    value?.acceptedAt && typeof value.acceptedAt === "object" && "toMillis" in value.acceptedAt && typeof value.acceptedAt.toMillis === "function" ? value.acceptedAt.toMillis() : undefined;
  return value?.termsVersion === TERMS_VERSION && value?.privacyPolicyVersion === PRIVACY_POLICY_VERSION && Number.isFinite(timestamp);
}
