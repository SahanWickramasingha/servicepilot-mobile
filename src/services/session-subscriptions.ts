import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/src/firebase/config";
import { createSharedSubscription } from "@/src/utils/sharedSubscription";

const observers = new Set<() => void>();
let stopAuth: (() => void) | undefined;
let previousViewer = auth.currentUser?.uid ?? null;
function watchSession(change: () => void) {
  observers.add(change);
  if (!stopAuth) stopAuth = onAuthStateChanged(auth, () => {
    const viewer = auth.currentUser?.uid ?? null;
    if (previousViewer && previousViewer !== viewer) {
      // Avatars use a viewer-specific memory key; don't keep the old session's images.
      void import("expo-image").then(({ Image }) => Image.clearMemoryCache()).catch((error) => {
        console.warn("Unable to clear the session image cache:", error);
      });
    }
    previousViewer = viewer;
    for (const observer of observers) observer();
  });
  return () => { observers.delete(change); if (!observers.size) { stopAuth?.(); stopAuth = undefined; } };
}

export function createSessionStream<Next extends unknown[], Failure extends unknown[] = [Error]>(reset: () => Next) {
  return createSharedSubscription<Next, Failure>({
    current: () => auth.currentUser?.uid ?? null,
    watch: watchSession,
  }, reset);
}
