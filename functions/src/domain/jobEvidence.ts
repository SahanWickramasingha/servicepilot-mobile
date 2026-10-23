export type JobPhotoStage = "before" | "after";
export type ServiceNotes = { diagnosis: string; workCompleted: string; recommendation: string; parts: { name: string; quantity: number }[] };
export type JobSignature = { customerName: string; path: string; confirmed: true; signedAt?: unknown };
export type JobEvidence = {
  requestId: string; technicianId: string; customerId: string; revision: number;
  beforePhotos: string[]; afterPhotos: string[]; notes?: ServiceNotes; notesUpdatedAt?: unknown; signature?: JobSignature; updatedAt?: unknown;
};
export const JOB_PHOTO_MAX = 3;

export function validateJobPhotoPaths(paths: unknown, technicianId: string, requestId: string, stage: JobPhotoStage): asserts paths is string[] {
  if (!Array.isArray(paths) || paths.length < 1 || paths.length > JOB_PHOTO_MAX || new Set(paths).size !== paths.length) throw new Error("Save between one and three photos for this stage.");
  for (const path of paths) {
    const parts = typeof path === "string" ? path.split("/") : [];
    if (parts.length !== 6 || parts[0] !== "job_photos" || parts[1] !== technicianId || parts[2] !== requestId || parts[3] !== stage ||
      !/^[A-Za-z0-9]{20}$/.test(parts[4]) || !/^[0-2]\.jpg$/.test(parts[5])) throw new Error("Invalid job photo ownership or stage.");
  }
}
export function validateServiceNotes(notes: ServiceNotes): void {
  if (!notes || typeof notes.diagnosis !== "string" || !notes.diagnosis.trim() || notes.diagnosis.length > 3000 ||
    typeof notes.workCompleted !== "string" || !notes.workCompleted.trim() || notes.workCompleted.length > 3000 ||
    typeof notes.recommendation !== "string" || notes.recommendation.length > 3000 || !Array.isArray(notes.parts) || notes.parts.length > 10 ||
    notes.parts.some((part) => !part || typeof part.name !== "string" || !part.name.trim() || part.name.length > 100 || !Number.isInteger(part.quantity) || part.quantity < 1 || part.quantity > 999)) {
    throw new Error("Enter diagnosis and work completed (up to 3000 characters), with at most ten valid parts and quantities.");
  }
}
export function validateJobSignature(signature: JobSignature): void {
  if (!signature || typeof signature.customerName !== "string" || !signature.customerName.trim() || signature.customerName.length > 100 ||
    signature.confirmed !== true || typeof signature.path !== "string" || signature.path.length < 20 || signature.path.length > 15000 ||
    !/^M[0-9., ML]+$/.test(signature.path) || !signature.path.includes("L")) throw new Error("Draw the customer's signature, enter their name and confirm their approval.");
}
/** Existing Job Action marks all four steps required. Availability is independent. */
export function requireCompletionEvidence(evidence: JobEvidence | undefined, requestId: string, technicianId: string, customerId: string): void {
  if (!evidence || evidence.requestId !== requestId || evidence.technicianId !== technicianId || evidence.customerId !== customerId) throw new Error("Save all four service evidence steps before completing this job.");
  validateJobPhotoPaths(evidence.beforePhotos, technicianId, requestId, "before");
  validateJobPhotoPaths(evidence.afterPhotos, technicianId, requestId, "after");
  validateServiceNotes(evidence.notes!); validateJobSignature(evidence.signature!);
}
