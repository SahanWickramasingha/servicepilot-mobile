export type JobPhotoStage = "before" | "after";
export type ServiceNotes = { diagnosis: string; workCompleted: string; recommendation: string; parts: { name: string; quantity: number }[] };
export type ServiceNotesDraft = Omit<ServiceNotes, "parts"> & { parts: { name: string; quantity: number | string }[] };
export const SERVICE_NOTES_MIN = 10;
export const SERVICE_NOTES_MAX = 3000;
export type JobSignature = { customerName: string; path: string; confirmed: true; signedAt?: unknown };
export type JobEvidence = {
  requestId: string; technicianId: string; customerId: string; revision: number;
  beforePhotos: string[]; afterPhotos: string[]; notes?: ServiceNotes; notesUpdatedAt?: unknown; signature?: JobSignature; updatedAt?: unknown;
};
export const JOB_PHOTO_MAX = 3;

export function validateJobPhotoPaths(paths: unknown, technicianId: string, requestId: string, stage: JobPhotoStage): asserts paths is string[] {
  if (!Array.isArray(paths) || paths.length < 1 || paths.length > JOB_PHOTO_MAX || new Set(paths).size !== paths.length) throw new Error("Save between one and three photos for this stage.");
  for (const path of paths) {
    // Ownership/stage and trusted confirmation are checked by Firestore Rules.
    // Legacy Firebase paths remain valid for existing saved evidence.
    if (typeof path === "string" && /^r2:v1:[a-f0-9]{64}$/.test(path)) continue;
    const parts = typeof path === "string" ? path.split("/") : [];
    if (parts.length !== 6 || parts[0] !== "job_photos" || parts[1] !== technicianId || parts[2] !== requestId || parts[3] !== stage ||
      !/^[A-Za-z0-9]{20}$/.test(parts[4]) || !/^[0-2]\.jpg$/.test(parts[5])) throw new Error("Invalid job photo ownership or stage.");
  }
}
function blankDefaultPart(part: ServiceNotesDraft["parts"][number]): boolean {
  return !!part && typeof part.name === "string" && !part.name.trim() && [1, "1", ""].includes(part.quantity);
}
function notesErrors(notes: ServiceNotesDraft, minimum: number): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const [field, label] of [["diagnosis", "Diagnosis"], ["workCompleted", "Work completed"]] as const) {
    const text = notes?.[field];
    if (typeof text !== "string" || text.trim().length < minimum) errors[field] = `${label} must contain at least ${minimum} characters after trimming.`;
    else if (text.length > SERVICE_NOTES_MAX) errors[field] = `${label} must be no more than ${SERVICE_NOTES_MAX} characters.`;
  }
  if (notes?.recommendation !== undefined && (typeof notes.recommendation !== "string" || notes.recommendation.length > SERVICE_NOTES_MAX)) errors.recommendation = `Recommendations must be no more than ${SERVICE_NOTES_MAX} characters.`;
  if (notes?.parts !== undefined && !Array.isArray(notes.parts)) errors.parts = "Parts must be a list.";
  else if (Array.isArray(notes?.parts)) {
    if (notes.parts.filter((part) => !blankDefaultPart(part)).length > 10) errors.parts = "Enter at most 10 parts.";
    notes.parts.forEach((part, index) => {
      if (blankDefaultPart(part)) return;
      if (!part || typeof part.name !== "string" || !part.name.trim()) errors[`parts.${index}.name`] = `Part ${index + 1} name is required.`;
      else if (part.name.length > 100) errors[`parts.${index}.name`] = `Part ${index + 1} name must be no more than 100 characters.`;
      const quantity = part?.quantity;
      if ((typeof quantity !== "number" && (typeof quantity !== "string" || !/^[0-9]+$/.test(quantity))) ||
        !Number.isInteger(Number(quantity)) || Number(quantity) < 1 || Number(quantity) > 999) {
        errors[`parts.${index}.quantity`] = `Part ${index + 1} quantity must be a whole number from 1 to 999.`;
      }
    });
  }
  return errors;
}
export function serviceNotesErrors(notes: ServiceNotesDraft): Record<string, string> {
  return notesErrors(notes, SERVICE_NOTES_MIN);
}
function throwNotesError(errors: Record<string, string>): void {
  const first = Object.entries(errors)[0];
  if (first) throw Object.assign(new Error(first[1]), { field: first[0] });
}
export function validateServiceNotes(notes: ServiceNotesDraft): void {
  throwNotesError(serviceNotesErrors(notes));
}
export function normalizeServiceNotes(notes: ServiceNotesDraft): ServiceNotes {
  validateServiceNotes(notes);
  return { diagnosis: notes.diagnosis, workCompleted: notes.workCompleted, recommendation: notes.recommendation ?? "",
    parts: (notes.parts ?? []).filter((part) => !blankDefaultPart(part)).map((part) => ({ name: part.name.trim(), quantity: Number(part.quantity) })) };
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
  // Existing persisted notes were accepted with a nonempty minimum. Keep them
  // usable for completion; all new/edited notes use the stricter write boundary.
  throwNotesError(notesErrors(evidence.notes!, 1)); validateJobSignature(evidence.signature!);
}
