import { doc, getDocFromServer, runTransaction, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/src/firebase/config";
import { hasCurrentPolicyAcceptance, TERMS_VERSION, PRIVACY_POLICY_VERSION } from "@/functions/src/domain/legalPolicy";
type Prompt = { uid: string; resolve: () => void; reject: () => void };
let showPrompt: ((prompt: Prompt) => void) | undefined;
export function subscribePolicyPrompt(listener: (prompt: Prompt) => void) {
  showPrompt = listener;
  return () => { if (showPrompt === listener) showPrompt = undefined; };
}
export async function acceptCurrentPolicies(): Promise<void> {
  const viewer = auth.currentUser;
  if (!viewer) throw new Error("Please sign in again.");
  await runTransaction(db, async tx => {
    const ref = doc(db, "users", viewer.uid);
    const saved = await tx.get(ref);
    if (auth.currentUser !== viewer) throw new Error("Account changed. Try again.");
    if (!saved.exists()) throw new Error("Profile unavailable.");
    if (!hasCurrentPolicyAcceptance(saved.data())) tx.update(ref, {
      termsVersion: TERMS_VERSION, privacyPolicyVersion: PRIVACY_POLICY_VERSION, acceptedAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
  });
}
/** Called before creating/uploading user content; browsing never fabricates acceptance. */
export async function requirePolicyAcceptance(): Promise<void> {
  const viewer = auth.currentUser;
  if (!viewer) throw new Error("Please sign in again.");
  const profile = await getDocFromServer(doc(db, "users", viewer.uid));
  const accepted = hasCurrentPolicyAcceptance(profile.data());
  if (auth.currentUser !== viewer) throw new Error("Account changed. Try again.");
  if (accepted) return;
  await new Promise<void>((resolve, reject) => {
    if (!showPrompt) { reject(new Error("Read and accept the current Terms and Privacy Policy from Profile before uploading content.")); return; }
    showPrompt({ uid: viewer.uid, resolve, reject: () => reject(new Error("Terms acceptance cancelled. Nothing was submitted.")) });
  });
  if (auth.currentUser !== viewer) throw new Error("Account changed. Try again.");
}
