import { collection, doc, getDocFromServer, onSnapshot, runTransaction, serverTimestamp } from "firebase/firestore";
import { deleteObject, getMetadata, ref, uploadBytesResumable } from "firebase/storage";
import * as ImagePicker from "expo-image-picker";
import { auth, db, storage } from "@/src/firebase/config";
import { bookingAccount, bookingTechnician } from "@/functions/src/domain/booking";
import { type JobEvidence, type JobPhotoStage, type JobSignature, type ServiceNotes, validateJobPhotoPaths, validateJobSignature, validateServiceNotes } from "@/functions/src/domain/jobEvidence";
import { createSessionStream } from "./session-subscriptions";
import { prepareSelectedPhotos, pickReviewPhotos, readPhotoBytes, type SelectedReviewPhoto } from "./reviewPhotos.service";
import { validateImageBytes } from "@/src/utils/reviewValidation";
export type { JobEvidence, JobPhotoStage, JobSignature, ServiceNotes };
const stream = createSessionStream<[JobEvidence | null, boolean]>(() => [null, false]);
export function subscribeToJobEvidence(requestId: string, next: (data: JobEvidence | null, confirmed: boolean) => void, error: (cause: Error) => void) {
  return stream(requestId, (emit, fail) => onSnapshot(doc(db, "job_evidence", requestId), { includeMetadataChanges: true },
    (snapshot) => emit(snapshot.exists() ? snapshot.data() as JobEvidence : null, !snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites), fail), next, error);
}
function session(uid: string, signal?: AbortSignal) {
  if (!uid || auth.currentUser?.uid !== uid || auth.currentUser.emailVerified !== true || signal?.aborted) throw new Error("This session changed. Reopen the job before saving.");
}
type EvidenceChange = { beforePhotos: string[] } | { afterPhotos: string[] } | { notes: ServiceNotes } | { signature: JobSignature };
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  return value;
}
export async function saveJobEvidence(requestId: string, expectedRevision: number, change: EvidenceChange): Promise<void> {
  const uid = auth.currentUser?.uid ?? ""; session(uid);
  if ("beforePhotos" in change) validateJobPhotoPaths(change.beforePhotos, uid, requestId, "before");
  if ("afterPhotos" in change) validateJobPhotoPaths(change.afterPhotos, uid, requestId, "after");
  if ("notes" in change) validateServiceNotes(change.notes);
  if ("signature" in change) validateJobSignature(change.signature);
  // All referenced photos must exist before the client can acknowledge a save.
  const paths = "beforePhotos" in change ? change.beforePhotos : "afterPhotos" in change ? change.afterPhotos : [];
  for (const path of paths) {
    const metadata = await getMetadata(ref(storage, path)); session(uid);
    if (metadata.contentType !== "image/jpeg" || !metadata.size || metadata.size > 5 * 1024 * 1024 ||
      metadata.customMetadata?.technicianId !== uid || metadata.customMetadata?.requestId !== requestId) throw new Error("A job photo is unavailable. Select and upload it again.");
  }
  await runTransaction(db, async (transaction) => {
    const job = (await transaction.get(doc(db, "service_requests", requestId))).data();
    const profile = (await transaction.get(doc(db, "users", uid))).data();
    const reference = doc(db, "job_evidence", requestId), snapshot = await transaction.get(reference);
    session(uid); bookingAccount(profile, "technician");
    if (!job || bookingTechnician(job) !== uid || !("beforePhotos" in change ? ["accepted", "assigned", "in_progress"] : ["in_progress"]).includes(job.status)) throw new Error("Only the assigned technician can save evidence on an eligible job.");
    const saved = snapshot.exists() ? snapshot.data() as JobEvidence : undefined;
    // Acknowledgement may have been lost: an exact replay is already successful.
    if (saved && Object.entries(change).every(([key, value]) => {
      const previous = saved[key as keyof JobEvidence];
      if (key === "signature" && saved.signature) {
        const { signedAt: _signedAt, ...signature } = saved.signature;
        return JSON.stringify(canonical(signature)) === JSON.stringify(canonical(value));
      }
      return JSON.stringify(canonical(previous)) === JSON.stringify(canonical(value));
    })) return;
    if ((saved?.revision ?? 0) !== expectedRevision) throw new Error("Service evidence changed on another screen. Reopen it before saving your changes.");
    transaction.set(reference, { ...(saved ?? { beforePhotos: [], afterPhotos: [] }), ...change,
      ...( "signature" in change ? { signature: { ...change.signature, signedAt: serverTimestamp() } } : {} ),
      requestId, technicianId: uid, customerId: job.customerId, revision: expectedRevision + 1, updatedAt: serverTimestamp() });
  });
  session(uid);
}
export async function pickJobPhotos(remaining: number, camera = false): Promise<SelectedReviewPhoto[]> {
  if (remaining <= 0) throw new Error("You can save up to three photos per stage.");
  if (!camera) return pickReviewPhotos(Math.min(3, remaining));
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) throw new Error("Camera permission was denied. You can still choose a photo from your library.");
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 1, exif: false });
  return result.canceled ? [] : prepareSelectedPhotos(result.assets, 1);
}
export function newJobPhotoAttempt(): string { return doc(collection(db, "job_evidence")).id; }
export async function uploadJobPhoto(requestId: string, stage: JobPhotoStage, attemptId: string, slot: number, photo: SelectedReviewPhoto, onProgress: (value: number) => void, signal?: AbortSignal): Promise<string> {
  const uid = auth.currentUser?.uid ?? ""; session(uid, signal);
  const path = `job_photos/${uid}/${requestId}/${stage}/${attemptId}/${slot}.jpg`;
  validateJobPhotoPaths([path], uid, requestId, stage);
  validateImageBytes(await readPhotoBytes(photo.uri), true); session(uid, signal);
  const blob = await (await fetch(photo.uri)).blob();
  try {
    // A retry uses the same immutable upload path, never an overwrite.
    try { const existing = await getMetadata(ref(storage, path)); session(uid, signal); if (existing.size === photo.size) return path; }
    catch (error) { if ((error as { code?: string }).code !== "storage/object-not-found") throw error; }
    const task = uploadBytesResumable(ref(storage, path), blob, { contentType: "image/jpeg", cacheControl: "private, max-age=0, no-store",
      customMetadata: { requestId, technicianId: uid, stage, attemptId } });
    const cancel = () => task.cancel(); signal?.addEventListener("abort", cancel);
    const stopAuth = auth.onAuthStateChanged((user) => { if (user?.uid !== uid) task.cancel(); });
    try { await new Promise<void>((resolve, reject) => task.on("state_changed", (value) => onProgress(value.bytesTransferred / value.totalBytes), reject, resolve)); session(uid, signal); }
    finally { stopAuth(); signal?.removeEventListener("abort", cancel); }
    return path;
  } finally { (blob as Blob & { close?: () => void }).close?.(); }
}
/** Never delete without a fresh ownership/reference check; ambiguous commits keep files. */
export async function cleanupJobUploads(requestId: string, uid: string, paths: string[]): Promise<void> {
  session(uid);
  const saved = (await getDocFromServer(doc(db, "job_evidence", requestId))).data() as JobEvidence | undefined; session(uid);
  const referenced = [...(saved?.beforePhotos ?? []), ...(saved?.afterPhotos ?? [])];
  for (const path of paths) {
    if (!path.startsWith(`job_photos/${uid}/${requestId}/`) || referenced.includes(path)) continue;
    try { session(uid); await deleteObject(ref(storage, path)); }
    catch (error) { if ((error as { code?: string }).code !== "storage/object-not-found") throw error; }
  }
}
