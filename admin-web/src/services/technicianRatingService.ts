import { collection, onSnapshot, query, where } from "firebase/firestore";
import { auth, db } from "../firebase/config";
import { summarizeTechnicianReviews, type TechnicianRatingSummary } from "../../../src/utils/technicianRating";

// The admin table mounts just one selected rating at a time. Never scan all
// reviews or attach a review listener for every row in its unpaged user table.
export function subscribeToAdminTechnicianRating(technicianId: string,
  next: (summary: TechnicianRatingSummary) => void, error: (cause: Error) => void) {
  const viewer = auth.currentUser?.uid;
  let active = true;
  const current = () => active && !!viewer && auth.currentUser?.uid === viewer;
  const stop = onSnapshot(query(collection(db, "service_reviews"), where("technicianId", "==", technicianId)),
    { includeMetadataChanges: true }, (snapshot) => {
      if (!current() || snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) return;
      next(summarizeTechnicianReviews(snapshot.docs.map((document) => ({ rating: document.data().rating }))));
    }, (cause) => { if (current()) error(cause); });
  return () => { active = false; stop(); };
}
