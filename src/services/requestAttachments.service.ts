import * as ImagePicker from "expo-image-picker";
import { auth } from "@/src/firebase/config";
import { uploadPrivatePhoto } from "./privatePhotos.service";

export const REQUEST_PHOTO_MAX_BYTES = 2_000_000;
export type RequestPhoto = { uri: string; size: number; contentType: string };
function release(blob: Blob) { (blob as Blob & { close?: () => void }).close?.(); }
async function readRequestFile(uri: string) {
  const blob = await (await fetch(uri)).blob();
  try {
    if (!blob.size || blob.size >= REQUEST_PHOTO_MAX_BYTES) throw new Error("Choose an image under 2 MB (2,000,000 bytes).");
    const bytes = await new Promise<Uint8Array>((resolve, reject) => {
      const reader = new FileReader(); reader.onerror = () => reject(new Error("Unable to read photo. Choose it again."));
      reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer)); reader.readAsArrayBuffer(blob);
    });
    if (bytes.length !== blob.size) throw new Error("Unable to read this image consistently. Choose it again.");
    return { blob, bytes, contentType: validateRequestPhoto(bytes) };
  } catch (cause) { release(blob); throw cause; }
}
export function validateRequestPhoto(bytes: Uint8Array): string {
  if (!bytes.length || bytes.length >= REQUEST_PHOTO_MAX_BYTES) throw new Error("Choose an image under 2 MB (2,000,000 bytes).");
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b)) return "image/png";
  if (String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "image/webp";
  throw new Error("Choose a JPEG, PNG or WebP image under 2 MB.");
}
export async function pickRequestPhotos(remaining: number): Promise<RequestPhoto[]> {
  if (remaining < 1 || remaining > 2) throw new Error("You can add up to two photos.");
  // System picker grants only selected files. Never compress oversized input.
  let result: ImagePicker.ImagePickerResult;
  try { result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsMultipleSelection: true,
    selectionLimit: remaining, allowsEditing: false, quality: 1, exif: false,
    preferredAssetRepresentationMode: "current" as ImagePicker.UIImagePickerPreferredAssetRepresentationMode }); }
  catch { throw new Error("Unable to open photos. Allow access to selected photos in device settings and try again."); }
  if (result.canceled) return [];
  if (result.assets.length > remaining) throw new Error(`Choose at most ${remaining} more photos.`);
  return Promise.all(result.assets.map(async (asset) => {
    const { blob, bytes, contentType } = await readRequestFile(asset.uri);
    release(blob);
    return { uri: asset.uri, size: bytes.length, contentType };
  }));
}
export async function uploadRequestPhoto(uid: string, id: string, slot: number, photo: RequestPhoto,
  progress: (fraction: number) => void, signal: AbortSignal): Promise<string> {
  if (signal.aborted || auth.currentUser?.uid !== uid) throw new Error("Account changed. Reopen Create Request.");
  const { blob, bytes, contentType } = await readRequestFile(photo.uri);
  try {
    return await uploadPrivatePhoto({ uid, requestId: id, purpose: "request", attemptId: id, slot, blob, bytes, contentType }, progress, signal);
  } catch (cause) {
    // Preserve a stable reservation even when its response was lost. Selection
    // edits may replace this pre-booking intent; uncertain bookings stay locked.
    throw Object.assign(cause instanceof Error ? cause : new Error("Unable to save this photo."), { retainPhotoAttempt: true });
  } finally { release(blob); }
}
/** Pending R2 uploads are collected by the trusted transactional expiry process.
 * This hook never lists/deletes files or depends on photo-service availability. */
export async function cleanupUnsubmittedPhotos(uid: string, id: string): Promise<void> {
  if (auth.currentUser?.uid !== uid || !/^[A-Za-z0-9]{20}$/.test(id)) throw new Error("Account changed.");
}
