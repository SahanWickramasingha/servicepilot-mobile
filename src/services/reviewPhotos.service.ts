import * as ImagePicker from "expo-image-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { getBlob, getMetadata, ref, updateMetadata, uploadBytesResumable, deleteObject } from "firebase/storage";
import { auth, storage } from "@/src/firebase/config";
import { REVIEW_PHOTO_BYTES_MAX, REVIEW_PHOTO_MAX, REVIEW_SOURCE_BYTES_MAX, validateImageBytes } from "@/src/utils/reviewValidation";
import type { ReviewContext } from "@/src/services/review.service";

export type SelectedReviewPhoto = { uri: string; size: number };
function releaseBlob(blob: Blob) { (blob as Blob & { close?: () => void }).close?.(); }
async function readPhotoFile(uri: string): Promise<{ blob: Blob; bytes: Uint8Array }> {
  const response = await fetch(uri);
  const blob = await response.blob();
  if (blob.size > REVIEW_SOURCE_BYTES_MAX) { releaseBlob(blob); throw new Error("Choose an image smaller than 15 MB."); }
  const bytes = await new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => { releaseBlob(blob); reject(new Error("Unable to read this photo. Choose it again.")); };
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.readAsArrayBuffer(blob);
  });
  return { blob, bytes };
}
export async function readPhotoBytes(uri: string): Promise<Uint8Array> {
  const { blob, bytes } = await readPhotoFile(uri);
  releaseBlob(blob);
  return bytes;
}

export async function pickReviewPhotos(remaining: number): Promise<SelectedReviewPhoto[]> {
  if (remaining <= 0) throw new Error("You can add up to 5 photos.");
  // System photo picker: no camera, microphone or broad library permission request.
  // The OS grants access only to images the customer chooses.
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsMultipleSelection: true,
    selectionLimit: Math.min(remaining, REVIEW_PHOTO_MAX), allowsEditing: false, quality: 1, exif: false });
  if (result.canceled) return [];
  return prepareSelectedPhotos(result.assets, remaining);
}

/** Shared byte validation/re-encoding for review library picks and job evidence. */
export async function prepareSelectedPhotos(assets: ImagePicker.ImagePickerAsset[], remaining: number): Promise<SelectedReviewPhoto[]> {
  if (assets.length > remaining) throw new Error(`Choose at most ${remaining} more photos.`);
  const photos: SelectedReviewPhoto[] = [];
  for (const asset of assets) {
    if (asset.fileSize && asset.fileSize > REVIEW_SOURCE_BYTES_MAX) throw new Error("Choose an image smaller than 15 MB.");
    validateImageBytes(await readPhotoBytes(asset.uri));
    if (!Number.isFinite(asset.width) || !Number.isFinite(asset.height) || asset.width <= 0 || asset.height <= 0 || asset.width * asset.height > 50000000) {
      throw new Error("Choose a valid image of 50 megapixels or fewer.");
    }
    const context = ImageManipulator.manipulate(asset.uri);
    if (Math.max(asset.width, asset.height) > 1600) context.resize(asset.width >= asset.height ? { width: 1600 } : { height: 1600 });
    const rendered = await context.renderAsync();
    try {
      const output = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
      const bytes = await readPhotoBytes(output.uri);
      validateImageBytes(bytes, true);
      photos.push({ uri: output.uri, size: bytes.length });
    } finally { rendered.release(); context.release(); }
  }
  return photos;
}

export function checkPhotoSession(customerId: string, signal?: AbortSignal) {
  if (signal?.aborted || auth.currentUser?.uid !== customerId) throw new Error("Submission stopped. Reopen the request with the original Customer account.");
}
export async function uploadReviewPhoto(path: string, photo: SelectedReviewPhoto, context: ReviewContext, attemptId: string,
  onProgress: (fraction: number) => void, signal?: AbortSignal): Promise<void> {
  checkPhotoSession(context.customerId, signal);
  const { blob, bytes } = await readPhotoFile(photo.uri);
  try {
    validateImageBytes(bytes, true);
    checkPhotoSession(context.customerId, signal);
    // Pass the native Blob through. Firebase's small-file multipart path creates
    // a Blob from its input; React Native cannot construct Blobs from typed arrays.
    const task = uploadBytesResumable(ref(storage, path), blob, { contentType: "image/jpeg", cacheControl: "private, max-age=0, no-store",
      customMetadata: { customerId: context.customerId, requestId: context.requestId,
        reviewId: `${context.requestId}_${context.customerId}`, technicianId: context.technicianId, attemptId, published: "false" } });
    const cancel = () => { task.cancel(); };
    signal?.addEventListener("abort", cancel);
    const unsubscribe = auth.onAuthStateChanged((user) => { if (user?.uid !== context.customerId) task.cancel(); });
    try {
      await new Promise<void>((resolve, reject) => task.on("state_changed", (snapshot) => onProgress(snapshot.bytesTransferred / snapshot.totalBytes), reject, () => resolve()));
      checkPhotoSession(context.customerId, signal);
    } finally { signal?.removeEventListener("abort", cancel); unsubscribe(); }
  } finally { releaseBlob(blob); }
}

/** Rules deny deletion of any path referenced by a committed review, even when
 * the caller did not receive the commit acknowledgement. No bucket listing. */
export async function cleanupReviewUploads(paths: string[]): Promise<boolean> {
  const results = await Promise.allSettled(paths.map(async (path) => {
    try { await deleteObject(ref(storage, path)); }
    catch (error) { if ((error as { code?: string }).code !== "storage/object-not-found") throw error; }
  }));
  return results.every((result) => result.status === "fulfilled");
}

/** A one-way publication flag can be set only for paths in the immutable review.
 * It permits Storage reads with the same roles as review reads, within Storage's
 * two-Firestore-document lookup limit. File hashes/metadata cannot change. */
export async function publishReviewPhotos(paths: string[]): Promise<void> {
  for (const path of paths) {
    const reference = ref(storage, path);
    const metadata = await getMetadata(reference);
    if (metadata.customMetadata?.published !== "true") {
      await updateMetadata(reference, { customMetadata: { ...metadata.customMetadata, published: "true" } });
    }
  }
}

export async function loadReviewPhoto(path: string): Promise<string> {
  // Authenticated bytes, never a long-lived bearer download URL. Base64 exists
  // only in component memory for React Native Image, never in Firestore/storage.
  const blob = await getBlob(ref(storage, path), REVIEW_PHOTO_BYTES_MAX);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => { releaseBlob(blob); reject(new Error("Unable to display this review photo.")); };
    reader.onload = () => { releaseBlob(blob); resolve(String(reader.result)); };
    reader.readAsDataURL(blob);
  });
}
