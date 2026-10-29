import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { auth } from "@/src/firebase/config";
import { isR2Photo, r2PhotoId } from "@/src/utils/photoReferences";
import { loadReviewPhoto } from "./reviewPhotos.service";

type Purpose = "request" | "before" | "after";
class PhotoAPIError extends Error {
  constructor(public code: string, message: string, public operation = "photo-upload", public uploadAcknowledged = false) { super(message); }
}
const unavailable = () => new PhotoAPIError("photos/unavailable", "Photos are temporarily unavailable. Your selections are kept; please retry later.");
export function photoAPIBase(): string {
  const configured = process.env.EXPO_PUBLIC_PHOTO_API_URL;
  if (!configured) throw unavailable();
  try {
    const url = new URL(configured);
    const local = __DEV__ && url.protocol === "http:" && /^(localhost|127\.0\.0\.1|10\.0\.2\.2)$/.test(url.hostname);
    if (!(url.protocol === "https:" || local) || url.username || url.password || url.search || url.hash || url.pathname !== "/") throw unavailable();
    return url.origin;
  } catch { throw unavailable(); }
}
function photoError(status: number, code?: string): PhotoAPIError {
  const denied = status === 401 || status === 403;
  const message = denied ? "Photo access was denied. Sign in again and retry."
    : status === 413 ? "This image is too large. Choose an image within the photo limit."
      : status === 415 ? "Choose a supported JPEG, PNG or WebP image."
        : status === 409 ? code === "conflict" ? "This photo expired or changed. Remove and reselect it before saving." : "This photo could not be confirmed. Retry with the original selections."
          : status === 429 ? "Too many photo requests. Wait a minute and retry."
            : "Unable to confirm this photo online. Your selections are kept; check your connection and retry.";
  return new PhotoAPIError(["invalid-session", "access-denied", "image-too-large", "unsupported-image", "upload-unconfirmed", "conflict", "rate-limited"].includes(code ?? "") ? `photos/${code}` : "photos/unavailable", message);
}
function photoSession(uid: string, signal?: AbortSignal) {
  const user = auth.currentUser;
  if (!user || user.uid !== uid || user.emailVerified !== true || signal?.aborted) throw new PhotoAPIError("booking/session", "Your account changed. Reopen this request before saving.");
  return user;
}
async function tokenFor(user: NonNullable<typeof auth.currentUser>): Promise<string> {
  try { return await user.getIdToken(); }
  catch { throw new PhotoAPIError("photos/auth-unavailable", "Unable to verify your sign-in. Check your connection and sign in again before saving photos."); }
}
async function api(path: string, uid: string, method = "GET", data?: unknown, signal?: AbortSignal): Promise<any> {
  const base = photoAPIBase(), user = photoSession(uid, signal), token = await tokenFor(user);
  photoSession(uid, signal);
  if (auth.currentUser !== user) throw photoError(401);
  const controller = new AbortController(), cancel = () => controller.abort();
  signal?.addEventListener("abort", cancel);
  const stop = auth.onAuthStateChanged((next) => { if (next !== user) cancel(); });
  const timer = setTimeout(cancel, 30_000);
  try {
    const response = await fetch(`${base}/v1/photos${path}`, { method, headers: { Authorization: `Bearer ${token}`, ...(data === undefined ? {} : { "Content-Type": "application/json" }) },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }), signal: controller.signal });
    photoSession(uid, signal); if (auth.currentUser !== user) throw photoError(401);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw photoError(response.status, body.code);
    return body;
  } catch (cause) { if (cause instanceof PhotoAPIError) throw cause; photoSession(uid, signal); throw photoError(503); }
  finally { clearTimeout(timer); stop(); signal?.removeEventListener("abort", cancel); }
}
function confirmed(result: any, id: string): string {
  if (result.id !== id || result.reference !== `r2:v1:${id}` || result.state !== "confirmed") throw photoError(409);
  return result.reference;
}
/** XHR preserves native Blob support and genuine upload byte progress on Expo. */
async function sendBlob(id: string, blob: Blob, mime: string, uid: string, progress: (n: number) => void, signal?: AbortSignal) {
  const base = photoAPIBase(), user = photoSession(uid, signal), token = await tokenFor(user);
  if (auth.currentUser !== user) throw photoError(401);
  const xhr = new XMLHttpRequest(), cancel = () => xhr.abort();
  signal?.addEventListener("abort", cancel);
  const stop = auth.onAuthStateChanged((next) => { if (next !== user) cancel(); });
  try {
    return await new Promise<any>((resolve, reject) => {
      xhr.open("PUT", `${base}/v1/photos/${id}`); xhr.timeout = 60_000;
      xhr.setRequestHeader("Authorization", `Bearer ${token}`); xhr.setRequestHeader("Content-Type", mime);
      xhr.upload.onprogress = (event) => { if (auth.currentUser === user && !signal?.aborted && event.lengthComputable) progress(event.loaded / event.total); };
      xhr.onerror = xhr.ontimeout = () => reject(photoError(503));
      xhr.onabort = () => reject(new PhotoAPIError("booking/session", "Photo upload stopped. Retry with the original account."));
      xhr.onload = () => {
        if (auth.currentUser !== user || signal?.aborted) { reject(photoError(401)); return; }
        let result; try { result = JSON.parse(xhr.responseText); } catch { reject(photoError(503)); return; }
        if (xhr.status >= 200 && xhr.status < 300) resolve(result); else reject(photoError(xhr.status, result.code));
      };
      if (signal?.aborted || auth.currentUser !== user) { reject(photoError(401)); return; }
      xhr.send(blob);
    });
  } finally { stop(); signal?.removeEventListener("abort", cancel); }
}
export async function uploadPrivatePhoto(input: { uid: string; requestId: string; purpose: Purpose; attemptId: string; slot: number; blob: Blob; bytes: Uint8Array; contentType: string }, progress: (n: number) => void, signal?: AbortSignal): Promise<string> {
  photoAPIBase(); photoSession(input.uid, signal);
  const size = input.bytes.length;
  if (!size || size !== input.blob.size || (input.purpose === "request" ? size >= 2_000_000 : size > 5 * 1024 * 1024)) throw new Error("Choose a photo within the allowed file-size limit.");
  const reservation = await api("", input.uid, "POST", { requestId: input.requestId, purpose: input.purpose, attemptId: input.attemptId,
    slot: input.slot, size, contentType: input.contentType, sha256: bytesToHex(sha256(input.bytes)) }, signal);
  if (!/^[a-f0-9]{64}$/.test(reservation.id) || !isR2Photo(reservation.reference) || reservation.reference !== `r2:v1:${reservation.id}`) throw photoError(503);
  if (reservation.state === "confirmed") return confirmed(await api(`/${reservation.id}/status`, input.uid, "GET", undefined, signal), reservation.id);
  try {
    const result = await sendBlob(reservation.id, input.blob, input.contentType, input.uid, progress, signal);
    const ref = confirmed(result, reservation.id); progress(1); return ref;
  } catch (cause) {
    photoSession(input.uid, signal);
    // PUT may have stored bytes before a failed metadata commit/lost response.
    // Reconcile exactly this server-generated id, never upload a second object.
    try { const ref = confirmed(await api(`/${reservation.id}/finalize`, input.uid, "POST", undefined, signal), reservation.id); progress(1); return ref; }
    catch { photoSession(input.uid, signal); throw cause instanceof PhotoAPIError ? cause : photoError(503); }
  }
}
export async function confirmPrivatePhoto(ref: string, uid: string): Promise<void> {
  const id = r2PhotoId(ref); confirmed(await api(`/${id}/status`, uid), id);
}
export async function deleteUnreferencedPrivatePhoto(ref: string, uid: string): Promise<void> {
  await api(`/${r2PhotoId(ref)}`, uid, "DELETE");
}
export async function loadPrivatePhoto(ref: string): Promise<string> {
  if (!isR2Photo(ref)) return loadReviewPhoto(ref); // Read-only historical Firebase provider.
  const base = photoAPIBase(), user = auth.currentUser;
  if (!user) throw photoError(401);
  const token = await tokenFor(user), controller = new AbortController(), timer = setTimeout(() => controller.abort(), 30_000);
  const stop = auth.onAuthStateChanged((next) => { if (next !== user) controller.abort(); });
  let blob: Blob | undefined;
  try {
    if (auth.currentUser !== user) throw photoError(401);
    const response = await fetch(`${base}/v1/photos/${r2PhotoId(ref)}`, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal });
    if (!response.ok || auth.currentUser !== user) throw photoError(response.status);
    blob = await response.blob(); if (!blob.size || blob.size > 5 * 1024 * 1024 || auth.currentUser !== user) throw photoError(503);
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader(); reader.onerror = () => reject(photoError(503));
      reader.onload = () => auth.currentUser === user ? resolve(String(reader.result)) : reject(photoError(401)); reader.readAsDataURL(blob!);
    });
  } finally { clearTimeout(timer); stop(); (blob as (Blob & { close?: () => void }) | undefined)?.close?.(); }
}
