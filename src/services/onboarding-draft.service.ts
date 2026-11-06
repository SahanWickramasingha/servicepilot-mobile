import type { User } from "firebase/auth";
import { auth } from "@/src/firebase/config";
import type { UserProfileData } from "./user.service";

type Draft = Omit<UserProfileData, "uid">;
let draft: { owner: User; data: Draft } | undefined;

// Memory only. Never store credentials or pass private form fields in routes.
export function saveOnboardingDraft(owner: User, data: Draft) {
  if (auth.currentUser !== owner) throw new Error("Your account changed. Sign in again.");
  const { fullName, email, phone, address, role, policyAccepted, serviceCategoryId,
    specialization, experience, qualifications, certifications, serviceAreas, serviceDivision } = data;
  draft = { owner, data: { fullName, email, phone, address, role, policyAccepted,
    serviceCategoryId, specialization, experience, qualifications, certifications, serviceAreas, serviceDivision } };
}
export function getOnboardingDraft(): Draft | undefined {
  if (draft?.owner !== auth.currentUser) { draft = undefined; return; }
  return draft ? { ...draft.data } : undefined;
}
export function clearOnboardingDraftUnless(user: User | null) {
  if (draft?.owner !== user) draft = undefined;
}
export function clearOnboardingDraft() { draft = undefined; }
