export const REVIEW_COMMENT_MAX = 300;
export const REVIEW_PHOTO_MAX = 5;
export const REVIEW_PHOTO_BYTES_MAX = 5 * 1024 * 1024;
export const REVIEW_SOURCE_BYTES_MAX = 15 * 1024 * 1024;

export function validateReview(rating: number, comment: string): string | null {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return "Select 1–5 stars before submitting.";
  if (typeof comment !== "string" || comment.length > REVIEW_COMMENT_MAX) return `Feedback must be ${REVIEW_COMMENT_MAX} characters or fewer.`;
  return null;
}

export function reviewTechnicianId(data: { technicianId?: unknown; assignedTechnicianId?: unknown }): string {
  const current = typeof data.technicianId === "string" ? data.technicianId.trim() : "";
  const legacy = typeof data.assignedTechnicianId === "string" ? data.assignedTechnicianId.trim() : "";
  if ((!current && !legacy) || (current && legacy && current !== legacy)) {
    throw new Error("This request has missing or conflicting technician records. Please contact support.");
  }
  return current || legacy;
}

export function reviewPhotoPath(customerId: string, reviewId: string, attempt: string, slot: number): string {
  return `review_photos/${customerId}/${reviewId}/${attempt}/${slot}.jpg`;
}

export function validateReviewPhotos(paths: string[], customerId: string, reviewId: string, attempt?: string): void {
  if (!Array.isArray(paths) || paths.length > REVIEW_PHOTO_MAX || (paths.length && !/^[A-Za-z0-9]{20}$/.test(attempt ?? ""))) {
    throw new Error("Select up to 5 valid review photos.");
  }
  paths.forEach((path, index) => {
    if (path !== reviewPhotoPath(customerId, reviewId, attempt!, index)) throw new Error("Invalid review photo ownership or path.");
  });
}

/** Inspect bytes, never trust a filename or the picker's declared MIME type. */
export function supportedImageType(bytes: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte)) return "image/png";
  if (String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
}

export function validateImageBytes(bytes: Uint8Array, prepared = false): void {
  const type = supportedImageType(bytes);
  if (!bytes.length || bytes.length > (prepared ? REVIEW_PHOTO_BYTES_MAX : REVIEW_SOURCE_BYTES_MAX)) {
    throw new Error(prepared ? "The compressed photo exceeds 5 MB. Choose a smaller image." : "Choose an image smaller than 15 MB.");
  }
  if (!type || (prepared && type !== "image/jpeg")) throw new Error("Choose a valid JPEG, PNG or WebP image.");
}
