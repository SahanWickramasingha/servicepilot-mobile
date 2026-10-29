export type SubmissionOperation = "receipt-read" | "receipt-confirm" | "booking-transaction" | "photo-read" | "photo-metadata" | "photo-upload" | "photo-confirm" | "photo-cleanup";
const codes = new Set(["permission-denied", "unauthenticated", "unavailable", "deadline-exceeded", "aborted", "failed-precondition", "already-exists",
  "storage/unknown", "storage/unauthorized", "storage/unauthenticated", "storage/object-not-found", "storage/bucket-not-found", "storage/project-not-found", "storage/retry-limit-exceeded", "storage/canceled", "storage/quota-exceeded", "storage/invalid-checksum"]);
/** Only allowlisted enums/numbers leave this boundary. Never log raw SDK errors,
 * URLs, response messages, request data, UIDs, paths, tokens or image bytes. */
export function sanitizedSubmissionFailure(cause: unknown) {
  const error = cause as { code?: string; status?: number; customData?: { serverResponse?: string; status?: number }; serverResponse?: string };
  const normalized = error?.code?.replace(/^firestore\//, "");
  let status = error?.status ?? error?.customData?.status;
  let serverCode: number | undefined, serverStatus: string | undefined;
  try {
    const response = JSON.parse(error?.customData?.serverResponse ?? error?.serverResponse ?? "{}");
    const data = response.error;
    if (Number.isInteger(data?.code) && data.code >= 100 && data.code <= 599) serverCode = data.code;
    if (["PERMISSION_DENIED", "UNAUTHENTICATED", "NOT_FOUND", "RESOURCE_EXHAUSTED", "UNAVAILABLE", "INTERNAL", "INVALID_ARGUMENT", "FAILED_PRECONDITION"].includes(data?.status)) serverStatus = data.status;
  } catch { /* Unstructured server text may contain private data; omit it. */ }
  if (!Number.isInteger(status) || status! < 100 || status! > 599) status = undefined;
  return { code: normalized && codes.has(normalized) ? normalized : "unclassified", httpStatus: status ?? serverCode ?? null,
    serverCode: serverCode ?? null, serverStatus: serverStatus ?? null };
}
export function reportSubmissionFailure(operation: SubmissionOperation, cause: unknown, context: {
  projectId?: string; bucket?: string; authenticated?: boolean; verified?: boolean; ownerMatches?: boolean; photoCount?: number; byteCount?: number; mime?: string;
  uploadAcknowledged?: boolean; confirmation?: "verified" | "absent" | "unavailable";
} = {}) {
  if (__DEV__) console.warn("Request submission operation failed", { operation, ...sanitizedSubmissionFailure(cause),
    // Call sites supply only initialized public configuration and booleans/counts.
    ...context });
}
export function submissionOperationError(operation: SubmissionOperation, cause: unknown, uploadAcknowledged = false): Error {
  const error = new Error(submissionFailureMessage(cause, operation));
  return Object.assign(error, { code: sanitizedSubmissionFailure(cause).code, operation, uploadAcknowledged });
}
export function submissionFailureMessage(cause: unknown, operation?: SubmissionOperation): string {
  const error = cause as { code?: string; operation?: SubmissionOperation; message?: string };
  const code = error?.code?.replace(/^firestore\//, ""), source = operation ?? error?.operation;
  const photo = source?.startsWith("photo-") || code?.startsWith("storage/");
  if (code?.startsWith("photos/")) return error.message ?? "Photos are temporarily unavailable. Your selections are kept; retry later.";
  if (source === "photo-read") return "Unable to read this photo. Choose a JPEG, PNG or WebP image under 2 MB and try again.";
  if (source === "photo-confirm") return "The photo was uploaded, but its saved details could not be verified. Retry, or remove photos before submitting. No booking was submitted.";
  if (code === "storage/canceled") return "Photo upload stopped. Retry with the original account, or remove photos before submitting.";
  if (["permission-denied", "unauthenticated", "storage/unauthorized", "storage/unauthenticated"].includes(code ?? "")) {
    return photo ? "Photo access was denied. Sign in again and retry, or remove photos to submit without them. Storage access rules may need checking."
      : "Booking access was denied. Sign in again and retry the same submission. If it continues, the Firestore rules and account access need checking.";
  }
  if (["unavailable", "deadline-exceeded", "storage/retry-limit-exceeded"].includes(code ?? "")) return photo
    ? "Photo upload could not finish online. Check your connection and retry, or remove photos to submit without them."
    : "Unable to confirm the booking online. Check your connection and retry this same submission to avoid duplicates.";
  if (photo) return "Photo storage could not be confirmed. Retry, or remove photos to submit without them. The storage configuration or connection may need checking.";
  if (code?.startsWith("booking/")) return error.message ?? "Unable to save this booking. Retry the same submission.";
  return "The booking could not be confirmed. Retry this same submission to check whether it was saved.";
}
