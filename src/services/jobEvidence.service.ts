import { collection, doc, getDocFromServer, onSnapshot, runTransaction, serverTimestamp } from "firebase/firestore";
import * as ImagePicker from "expo-image-picker";
import { auth, db } from "@/src/firebase/config";
import { bookingAccount, bookingTechnician } from "@/functions/src/domain/booking";
import { type JobEvidence, type JobPhotoStage, type JobSignature, type ServiceNotes, normalizeServiceNotes, validateJobPhotoPaths, validateJobSignature } from "@/functions/src/domain/jobEvidence";
import { createSessionStream } from "./session-subscriptions";
import { prepareSelectedPhotos, pickReviewPhotos, type SelectedReviewPhoto } from "./reviewPhotos.service";
import { validateImageBytes } from "@/src/utils/reviewValidation";
import { uploadPrivatePhoto, confirmPrivatePhoto, deleteUnreferencedPrivatePhoto } from "./privatePhotos.service";
import { isR2Photo } from "@/src/utils/photoReferences";
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
  if ("notes" in change) change = { notes: normalizeServiceNotes(change.notes) };
  if ("signature" in change) validateJobSignature(change.signature);
  // All referenced photos must exist before the client can acknowledge a save.
  const paths = "beforePhotos" in change ? change.beforePhotos : "afterPhotos" in change ? change.afterPhotos : [];
  const prior = paths.some((path) => !isR2Photo(path)) ? (await getDocFromServer(doc(db, "job_evidence", requestId))).data() as JobEvidence | undefined : undefined;
  for (const path of paths) {
    if (isR2Photo(path)) await confirmPrivatePhoto(path, uid);
    else if (!("beforePhotos" in change ? prior?.beforePhotos : prior?.afterPhotos)?.includes(path)) throw new Error("Choose and upload a new photo before saving. Existing historical photos remain available.");
    session(uid);
  }
  // Preflight reads provide useful errors. Rules recheck the authoritative account
  // and job at commit; the evidence revision transaction serializes edits. Keeping
  // redundant preflight reads out of that transaction leaves Rules expression
  // budget for validating all ten parts in a maximum-size evidence record.
  const [jobSnapshot, profileSnapshot] = await Promise.all([
    getDocFromServer(doc(db, "service_requests", requestId)), getDocFromServer(doc(db, "users", uid)),
  ]);
  const job = jobSnapshot.data(), profile = profileSnapshot.data();
  await runTransaction(db, async (transaction) => {
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
      ...("notes" in change ? { notesUpdatedAt: serverTimestamp() } : {}),
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
  const blob = await (await fetch(photo.uri)).blob();
  try {
    if (!blob.size || blob.size > 5 * 1024 * 1024) throw new Error("Choose a processed job photo of 5 MiB or less.");
    const bytes = await new Promise<Uint8Array>((resolve, reject) => {
      const reader = new FileReader(); reader.onerror = () => reject(new Error("Unable to read the selected photo."));
      reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer)); reader.readAsArrayBuffer(blob);
    });
    validateImageBytes(bytes, true); session(uid, signal);
    return await uploadPrivatePhoto({ uid, requestId, purpose: stage, attemptId, slot, blob, bytes, contentType: "image/jpeg" }, onProgress, signal);
  } finally { (blob as Blob & { close?: () => void }).close?.(); }
}
/** Explicit cleanup only; legacy Firebase files are never mutated by this flow. */
export async function cleanupJobUploads(requestId: string, uid: string, paths: string[]): Promise<void> {
  session(uid);
  const saved = (await getDocFromServer(doc(db, "job_evidence", requestId))).data() as JobEvidence | undefined; session(uid);
  const referenced = [...(saved?.beforePhotos ?? []), ...(saved?.afterPhotos ?? [])];
  for (const path of paths) if (isR2Photo(path) && !referenced.includes(path)) { session(uid); await deleteUnreferencedPrivatePhoto(path, uid); }
}
