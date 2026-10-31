import { deleteField, doc, getDocFromServer, serverTimestamp, writeBatch } from "firebase/firestore";
import { db } from "../firebase/config";
import { buildMapProfile } from "../../../functions/src/domain/mapProjection";
import { selectedTechnicianCategory, technicianCategory } from "../../../functions/src/domain/serviceCategories";

export async function reviewTechnicianApplication({ technicianUid, dispatcherUid, status, rejectionReason }: {
  technicianUid: string; dispatcherUid: string; status: "approved" | "rejected"; rejectionReason?: string;
}): Promise<void> {
  const reason = rejectionReason?.trim();
  if (!technicianUid || !dispatcherUid || status === "rejected" && !reason) throw new Error("A valid application review is required.");
  const userRef = doc(db, "users", technicianUid);
  const profile = (await getDocFromServer(userRef)).data();
  if (!profile) throw new Error("Technician application unavailable.");
  const category = technicianCategory(profile);
  const categoryFields = category ? selectedTechnicianCategory(category.id) : {};
  const batch = writeBatch(db);
  batch.update(userRef, { ...categoryFields, technicianApprovalStatus: status, reviewedBy: dispatcherUid,
    reviewedAt: serverTimestamp(), updatedAt: serverTimestamp(), rejectionReason: status === "rejected" ? reason : deleteField() });
  batch.set(doc(db, "technician_map_profiles", technicianUid), {
    ...buildMapProfile(technicianUid, { ...profile, ...categoryFields, technicianApprovalStatus: status }), updatedAt: serverTimestamp(),
  });
  await batch.commit();
}
