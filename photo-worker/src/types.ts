export type Purpose = "request" | "before" | "after";
export type Data = Record<string, any>;
export interface PhotoRecord extends Data {
  id: string; provider: "r2"; ownerId: string; requestId: string; purpose: Purpose;
  // Absent on existing shared-prefix records; never change their physical key.
  objectKeyVersion?: 2;
  attemptId: string; slot: number; size: number; contentType: string; sha256: string;
  state: "pending" | "confirmed" | "deleting" | "deleted"; createdAt: Date; expiresAt: Date;
}
export interface Store {
  get(path: string, callerToken?: string): Promise<Data | null>;
  atomic<T>(paths: string[], change: (rows: Map<string, Data | null>) => { writes: Record<string, Data>; result: T }): Promise<T>;
  expired?(cursor?: { time: string; id: string }): Promise<{ records: PhotoRecord[]; cursor?: { time: string; id: string } }>;
}
export interface Identity { uid: string; authTime: number; verified: boolean; token: string }
export interface Env {
  PHOTOS: R2Bucket;
  PHOTO_RATE_LIMITER: RateLimit;
  FIREBASE_PROJECT_ID: string;
  FIREBASE_WEB_API_KEY: string;
  FIREBASE_SERVICE_ACCOUNT_EMAIL: string;
  FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY: string;
  ALLOWED_ORIGINS?: string;
  PENDING_TTL_SECONDS?: string;
  PHOTO_UPLOADS_ENABLED?: string;
}
export class PhotoError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}
export function check(value: unknown, status = 403, code = "access-denied"): asserts value {
  if (!value) throw new PhotoError(status, code);
}
export const photoPath = (id: string) => `photo_objects/${id}`;
export function objectKey(meta: Pick<PhotoRecord, "id" | "purpose" | "objectKeyVersion">): string {
  if (meta.objectKeyVersion === undefined) return `photos/v1/${meta.id}`;
  check(meta.objectKeyVersion === 2, 500, "invalid-metadata");
  const prefix = { request: "customer-requests", before: "technician-before", after: "technician-after" }[meta.purpose];
  check(prefix, 500, "invalid-metadata");
  return `photos/v1/${prefix}/${meta.id}`;
}
export const reference = (id: string) => `r2:v1:${id}`;
