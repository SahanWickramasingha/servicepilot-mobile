import { deleteField, doc, runTransaction, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase/config";
import { buildMapProfile } from "../../../functions/src/domain/mapProjection";
import { selectedTechnicianCategory, technicianCategory } from "../../../functions/src/domain/serviceCategories";
import { isReviewableTechnicianApplication } from "../../../functions/src/domain/technicianApplication";

export async function reviewTechnicianApplication({ technicianUid, dispatcherUid, status, rejectionReason }: {
  technicianUid: string; dispatcherUid: string; status: "approved" | "rejected"; rejectionReason?: string;
}): Promise<void> {
  const reason = rejectionReason?.trim();
  if (!technicianUid || !dispatcherUid || status === "rejected" && (!reason || reason.length > 2000)) throw new Error("A valid application review with a reason of up to 2,000 characters is required.");
  const userRef = doc(db, "users", technicianUid);
  await runTransaction(db, async (transaction) => {
    const profile = (await transaction.get(userRef)).data();
    if (!profile || profile.uid !== technicianUid || !isReviewableTechnicianApplication(profile)) throw new Error("Application already reviewed, unverified or incomplete. Refresh the applications list.");
    const category = technicianCategory(profile);
    const categoryFields = category ? selectedTechnicianCategory(category.id) : {};
    transaction.update(userRef, { ...categoryFields, technicianApprovalStatus: status, reviewedBy: dispatcherUid,
      reviewedAt: serverTimestamp(), updatedAt: serverTimestamp(), rejectionReason: status === "rejected" ? reason : deleteField() });
    transaction.set(doc(db, "technician_map_profiles", technicianUid), {
      ...buildMapProfile(technicianUid, { ...profile, ...categoryFields, technicianApprovalStatus: status }), updatedAt: serverTimestamp(),
    });
  });
}
