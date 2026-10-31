import {
  collection,
  doc,
  getDocFromServer,
  onSnapshot,
  query,
  where,
  Timestamp,
  type SnapshotMetadata,
  limit,
  documentId,
  orderBy,
  startAfter,
  getDocsFromServer,
  getAggregateFromServer,
  getCountFromServer,
  count,
  average,
} from "firebase/firestore";

import { ServiceCategory } from "@/src/constants/serviceRequests";
import { categoryProjectionLabels, resolveServiceCategory, technicianCategory, technicianCategoryLabel, type ServiceCategoryId } from "@/functions/src/domain/serviceCategories";
import { auth, db, firebaseRuntimeTarget } from "@/src/firebase/config";
import { createSessionStream } from "./session-subscriptions";
import { readTechnicianAvailability, TechnicianAvailability } from "@/functions/src/domain/availability";
import { districtIdForName } from "@/functions/src/domain/map";
import { declaredServiceAreaLabel, StoredServiceAreasByDistrict } from "@/functions/src/domain/serviceAreas";
import { MAP_MAX_ITEMS, MAP_PAGE_SIZE } from "@/functions/src/domain/mapProjection";
import { compareTechnicianReviews, isEligibleReviewRating, type TechnicianRatingSummary } from "@/src/utils/technicianRating";
import { reportReviewQueryFailure, type ReviewQueryStage } from "@/src/utils/reviewDiagnostics";

export interface PublicTechnicianProfile {
  uid: string;
  fullName: string;
  email: string;
  phone: string;
  address: string;
  profilePhotoUrl?: string;
  specialization: string;
  serviceCategoryId?: ServiceCategoryId;
  experience: string;
  qualifications: string;
  certifications: string;
  serviceDivision: string;
  averageRating: number;
  reviewCount: number;
  completedJobs: number;
  serviceDistrictIds: string[];
  availability?: TechnicianAvailability;
}

export interface TechnicianReviewSummary {
  id: string;
  requestId: string;
  customerId: string;
  technicianId: string;
  customerName?: string;
  rating: number;
  comment: string;
  photoPaths?: string[];
  createdAt?: Timestamp;
}

type PublicProjection = {
  technicianId: string; fullName: string; specialization: string; serviceCategory?: string; serviceCategoryId?: string; approved: boolean;
  serviceDistrictIds: string[]; serviceAreasByDistrict?: StoredServiceAreasByDistrict;
  averageRating: number; reviewCount: number;
  availability?: unknown;
  publicDetails?: { profilePhotoUrl?: string; experience?: string; qualifications?: string; certifications?: string; completedJobs?: number };
};
function mapTechnician(data: PublicProjection): PublicTechnicianProfile {
  const details = data.publicDetails;
  return {
    uid: data.technicianId,
    fullName: data.fullName || "Service Technician",
    email: "", phone: "", address: "",
    profilePhotoUrl: details?.profilePhotoUrl || undefined,
    specialization: technicianCategoryLabel(data),
    ...(technicianCategory(data) ? { serviceCategoryId: technicianCategory(data)!.id } : {}),
    experience: details?.experience || "Not provided",
    qualifications: details?.qualifications || "Not provided",
    certifications: details?.certifications || "Not provided",
    serviceDistrictIds: data.serviceDistrictIds,
    serviceDivision: data.serviceDistrictIds.map((id) => declaredServiceAreaLabel(id, data.serviceAreasByDistrict)).join("; ") || "Service districts not set",
    averageRating: Number(data.averageRating ?? 0),
    reviewCount: Number(data.reviewCount ?? 0),
    completedJobs: Number(details?.completedJobs ?? 0),
    availability: readTechnicianAvailability(data.availability),
  };
}

function matchesCategory(
  technician: PublicTechnicianProfile,
  category?: string
): boolean {
  if (!category || category === "All") {
    return true;
  }

  return technician.serviceCategoryId === resolveServiceCategory(category)?.id && technician.serviceCategoryId !== undefined;
}

function matchesDivision(
  technician: PublicTechnicianProfile,
  division?: string
): boolean {
  if (!division || division === "All") {
    return true;
  }

  const id = districtIdForName(division);
  return technician.serviceDivision === division || !!id && technician.serviceDistrictIds.includes(id);
}

const directoryStream = createSessionStream<[PublicTechnicianProfile[], boolean]>(() => [[], false]);
export function subscribeToApprovedTechnicians(
  onNext: (technicians: PublicTechnicianProfile[]) => void,
  onError: (error: Error) => void,
  filters?: {
    category?: ServiceCategory | "All" | string;
    division?: string;
    pageCount?: number;
    onHasMore?: (hasMore: boolean) => void;
  }
) {
  const count = Math.min(MAP_MAX_ITEMS, Math.max(1, filters?.pageCount ?? 1) * MAP_PAGE_SIZE);
  const districtId = districtIdForName(filters?.division ?? "");
  const category = filters?.category && filters.category !== "All" ? categoryProjectionLabels(filters.category) : undefined;
  const techniciansQuery = query(collection(db, "technician_map_profiles"), where("approved", "==", true),
    ...(districtId ? [where("serviceDistrictIds", "array-contains", districtId)] : []),
    ...(category ? [where("serviceCategory", "in", category)] : []),
    orderBy(documentId()), limit(count));
  // Include client-side filters as well as the bounded query in the stream identity.
  const key = JSON.stringify([filters?.category || "All", filters?.division || "All", count]);
  return directoryStream(key, (emit, fail) => {
    let alive = true, generation = 0;
    const unsubscribe = onSnapshot(
      techniciansQuery,
      (snapshot) => {
        const version = ++generation;
        // Follow-up server gets recheck CURRENT approval; no private profile read.
        void Promise.all(snapshot.docs.map((item) => getDocFromServer(item.ref))).then((verified) => {
          if (!alive || version !== generation) return;
          const technicians = verified
          .filter((item) => item.data()?.approved === true)
          .map((item) => mapTechnician(item.data() as PublicProjection))
          .filter((technician) =>
            matchesCategory(technician, filters?.category)
          )
          .filter((technician) =>
            matchesDivision(technician, filters?.division)
          )
          .sort((first, second) => {
            if (second.averageRating !== first.averageRating) {
              return second.averageRating - first.averageRating;
            }

            return first.fullName.localeCompare(second.fullName);
          });

          emit(technicians, snapshot.size === count && count < MAP_MAX_ITEMS);
        }).catch((error) => { if (alive && version === generation) fail(error); });
      },
      (error) => { generation++; if (alive) fail(error); }
    );
    return () => { alive = false; unsubscribe(); };
  }, (items, hasMore) => { onNext(items); filters?.onHasMore?.(hasMore); }, onError);
}

export async function getApprovedTechnician(
  technicianId: string
): Promise<PublicTechnicianProfile | null> {
  const snapshot = await getDocFromServer(
    doc(db, "technician_map_profiles", technicianId)
  );

  if (!snapshot.exists()) {
    return null;
  }

  const data = snapshot.data() as PublicProjection;
  if (data.approved !== true) {
    return null;
  }

  return mapTechnician(data);
}

/** Single public document; recheck approval on the server for each live change. */
const approvedTechnicianStream = createSessionStream<[PublicTechnicianProfile | null]>(() => [null]);
export function subscribeToApprovedTechnician(technicianId: string,
  onNext: (technician: PublicTechnicianProfile | null) => void, onError: (error: Error) => void) {
  return approvedTechnicianStream(technicianId, (emit, fail) => {
    let alive = true, generation = 0;
    const stop = onSnapshot(doc(db, "technician_map_profiles", technicianId), { includeMetadataChanges: true }, (snapshot) => {
      if (!alive) return;
      const version = ++generation;
      // Cached status cannot confirm that a technician is still accepting bookings.
      if (snapshot.metadata.fromCache) {
        if (snapshot.exists() && snapshot.data().approved === true) emit(mapTechnician({ ...snapshot.data(), availability: undefined } as PublicProjection));
        return;
      }
      void getApprovedTechnician(technicianId).then((item) => {
        if (alive && version === generation) emit(item);
      }, (error) => { if (alive && version === generation) fail(error); });
    }, (error) => { if (alive) { generation++; fail(error); } });
    return () => { alive = false; generation++; stop(); };
  }, onNext, onError);
}

export const TECHNICIAN_REVIEWS_PAGE_SIZE = 20;
export type TechnicianReviewCursor =
  | { kind: "dated"; id: string; createdAt: unknown; includeUndated: boolean }
  | { kind: "undated"; id: string | null };
export type TechnicianReviewPage = { reviews: TechnicianReviewSummary[]; cursor: TechnicianReviewCursor | null };
const cacheMetadata = { fromCache: true, hasPendingWrites: false } as SnapshotMetadata;
export type ReviewConnectionState = "updating" | "saved" | "confirmed";
const reviewsStream = createSessionStream<[TechnicianReviewSummary[], SnapshotMetadata, TechnicianRatingSummary | null, TechnicianReviewCursor | null, ReviewConnectionState?]>(
  () => [[], cacheMetadata, null, null]);
const reviewControls = new Map<string, { viewer: string | null; retry: () => void; refresh: () => void }>();

async function reviewRead<T>(stage: ReviewQueryStage, read: () => Promise<T>): Promise<T> {
  try { return await read(); }
  catch (error) { reportReviewQueryFailure(error, stage, firebaseRuntimeTarget); throw error; }
}

function eligibleReviews(technicianId: string) {
  return query(collection(db, "service_reviews"), where("technicianId", "==", technicianId), where("rating", "in", [1, 2, 3, 4, 5]));
}
function datedReviews(technicianId: string) {
  return query(eligibleReviews(technicianId), orderBy("createdAt", "desc"), orderBy(documentId(), "desc"));
}
function mapReview(id: string, data: Record<string, unknown>): TechnicianReviewSummary | null {
  if (!isEligibleReviewRating(data.rating)) return null;
  return { id, requestId: String(data.requestId ?? ""), customerId: String(data.customerId ?? ""),
    technicianId: String(data.technicianId ?? ""), customerName: typeof data.customerName === "string" ? data.customerName : undefined,
    rating: data.rating, comment: typeof data.comment === "string" ? data.comment : "",
    photoPaths: Array.isArray(data.photoPaths) ? data.photoPaths.filter((path): path is string => typeof path === "string").slice(0, 5) : [],
    createdAt: data.createdAt as Timestamp | undefined };
}
function pageFromDocuments(docs: { id: string; data(): Record<string, unknown> }[], kind: "dated" | "undated", includeUndated: boolean): TechnicianReviewPage {
  const last = docs.at(-1);
  const cursor: TechnicianReviewCursor | null = last && docs.length === TECHNICIAN_REVIEWS_PAGE_SIZE
    ? kind === "dated" ? { kind, id: last.id, createdAt: last.data().createdAt, includeUndated } : { kind, id: last.id }
    : kind === "dated" && includeUndated ? { kind: "undated", id: null } : null;
  // orderBy(createdAt) omits missing fields. The explicit, user-paged legacy pass
  // reads IDs in bounded chunks and emits ONLY reviews omitted by that ordering.
  const reviews = docs.filter((doc) => kind !== "undated" || !("createdAt" in doc.data()))
    .map((doc) => mapReview(doc.id, doc.data())).filter((row): row is TechnicianReviewSummary => row !== null)
    .sort(compareTechnicianReviews);
  return { reviews, cursor };
}

export async function getTechnicianReviewsPage(technicianId: string, cursor: TechnicianReviewCursor): Promise<TechnicianReviewPage> {
  const viewer = auth?.currentUser?.uid;
  const constraints = cursor.kind === "dated" ? [startAfter(cursor.createdAt, cursor.id)] : cursor.id ? [startAfter(cursor.id)] : [];
  const source = cursor.kind === "dated" ? datedReviews(technicianId) : query(eligibleReviews(technicianId), orderBy(documentId(), "desc"));
  const snapshot = await reviewRead(cursor.kind === "dated" ? "dated-page" : "legacy-page",
    () => getDocsFromServer(query(source, ...constraints, limit(TECHNICIAN_REVIEWS_PAGE_SIZE))));
  if (auth?.currentUser?.uid !== viewer) throw new Error("The signed-in account changed. Please reopen your reviews.");
  return pageFromDocuments(snapshot.docs, cursor.kind, cursor.kind === "dated" && cursor.includeUndated);
}

export function retryTechnicianReviews(technicianId: string): void {
  const control = reviewControls.get(technicianId);
  if (control?.viewer === (auth?.currentUser?.uid ?? null)) control?.retry();
}

/** Revalidate server aggregates/head on focus, even when the limited realtime
 * query is unchanged (for example a legacy review outside that window changed). */
export function refreshTechnicianReviews(technicianId: string): void {
  const control = reviewControls.get(technicianId);
  if (control?.viewer === (auth?.currentUser?.uid ?? null)) control?.refresh();
}

export function subscribeToTechnicianReviews(
  technicianId: string,
  onNext: (reviews: TechnicianReviewSummary[], metadata: SnapshotMetadata, summary: TechnicianRatingSummary | null, cursor?: TechnicianReviewCursor | null, connection?: ReviewConnectionState) => void,
  onError: (error: Error) => void
) {
  return reviewsStream(technicianId, (emit, fail) => {
    const viewer = auth?.currentUser?.uid ?? null;
    let stopCurrent = () => {}, refreshCurrent = () => {}, waiting = false;
    // Saved results belong to this pooled account/query, not to a connection attempt.
    // The final unsubscribe/account change disposes them with the stream.
    let verified: { page: TechnicianReviewPage; summary: TechnicianRatingSummary } | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let retries = 0, disposed = false, started = false;
    const publishSaved = (connection: ReviewConnectionState) => {
      if (verified) emit(verified.page.reviews, cacheMetadata, verified.summary, verified.page.cursor, connection);
      else if (connection === "updating") emit([], cacheMetadata, null, null, connection);
    };
    const connect = () => {
      if (disposed || waiting) return;
      clearTimeout(retryTimer); retryTimer = undefined;
      stopCurrent(); waiting = true;
      // Do not emit an empty reset on initial subscribe; reconnect feedback is
      // shared too, so late subscribers cannot replay an obsolete error.
      if (started) publishSaved("updating");
      started = true;
      let active = true, revision = 0, refreshing = false;
      let latest: { docs: { id: string; data(): Record<string, unknown> }[]; metadata: SnapshotMetadata } | undefined;
      let focusRead = false, listenerFailed = false, failed = false;
      const current = () => active && viewer === (auth?.currentUser?.uid ?? null);
      let deadline: ReturnType<typeof setTimeout> | undefined;
      const armDeadline = () => {
        clearTimeout(deadline);
        deadline = setTimeout(() => {
          if (current()) {
            const error = Object.assign(new Error("Unable to verify reviews online."), { code: "unavailable" });
            reportReviewQueryFailure(error, "confirmation-timeout", firebaseRuntimeTarget);
            reject(error);
          }
        }, 15000);
      };
      armDeadline();
      const reject = (error: Error) => {
        if (!current()) return;
        clearTimeout(deadline); waiting = false; failed = true; revision++;
        const code = (error as Error & { code?: string }).code?.replace(/^firestore\//, "");
        const recoverable = ["unavailable", "deadline-exceeded", "aborted", "resource-exhausted"].includes(code ?? "");
        if (!recoverable) verified = undefined;
        // Generic streams clear replay data on failure. Publish a saved state
        // instead when we have safe, previously confirmed totals to retain.
        if (verified) publishSaved("saved"); else fail(error);
        if (recoverable && !retryTimer && retries < 3) {
          const delay = [1000, 3000, 10000][retries++];
          retryTimer = setTimeout(() => { retryTimer = undefined; if (current()) connect(); }, delay);
        }
      };
      const markStale = () => {
        if (verified) publishSaved("updating");
      };
      const refresh = async () => {
        if (!current() || listenerFailed || refreshing || !latest) return;
        refreshing = true; failed = false; waiting = true;
        armDeadline();
        const version = revision, snapshot = latest;
        try {
          // Server-side aggregate covers ALL eligible reviews, without downloading
          // their documents or depending on optional deployed aggregation functions.
          const [aggregate, datedCount] = await Promise.all([
            reviewRead("overall-summary", () => getAggregateFromServer(eligibleReviews(technicianId), { count: count(), average: average("rating") })),
            reviewRead("dated-count", () => getCountFromServer(datedReviews(technicianId))),
          ]);
          if (!current() || version !== revision) return;
          const totals = aggregate.data();
          const summary = { count: totals.count, average: totals.count ? totals.average ?? 0 : 0 };
          const includeUndated = summary.count > datedCount.data().count;
          let page = pageFromDocuments(snapshot.docs, "dated", includeUndated);
          if (!snapshot.docs.length && includeUndated) page = await getTechnicianReviewsPage(technicianId, { kind: "undated", id: null });
          if (!current() || version !== revision) return;
          clearTimeout(deadline); clearTimeout(retryTimer); retryTimer = undefined;
          waiting = false; failed = false; retries = 0;
          verified = { page, summary };
          emit(page.reviews, snapshot.metadata, summary, page.cursor, "confirmed");
        } catch (error) { if (version === revision) reject(error as Error); }
        finally {
          refreshing = false;
          if (current() && !failed && version !== revision) void refresh();
        }
      };
      refreshCurrent = () => {
        if (current() && (listenerFailed || failed)) { retries = 0; connect(); return; }
        if (!current() || focusRead || refreshing || waiting) return;
        focusRead = true;
        markStale(); armDeadline();
        const version = revision;
        // One bounded server read, coalesced across consumers of this technician.
        void reviewRead("head-refresh", () => getDocsFromServer(query(datedReviews(technicianId), limit(TECHNICIAN_REVIEWS_PAGE_SIZE)))).then((snapshot) => {
          if (!current() || version !== revision) return;
          if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) {
            latest = undefined; revision++; markStale(); armDeadline(); return;
          }
          latest = snapshot; revision++; void refresh();
        }, (error: Error) => { if (current() && version === revision) reject(error); })
          .finally(() => { focusRead = false; });
      };
      let stop = () => {};
      stopCurrent = () => { active = false; clearTimeout(deadline); stop(); };
      try { stop = onSnapshot(query(datedReviews(technicianId), limit(TECHNICIAN_REVIEWS_PAGE_SIZE)), { includeMetadataChanges: true }, (snapshot) => {
        if (!current() || listenerFailed) return;
        if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) {
          // Invalidate in-flight aggregates; a server aggregate cannot confirm
          // a head that has since become cached or contains local writes.
          latest = undefined; revision++; markStale(); armDeadline(); return;
        }
        markStale();
        latest = snapshot; revision++; void refresh();
      }, (error) => {
        if (!current()) return;
        revision++; listenerFailed = true;
        reportReviewQueryFailure(error, "head-listener", firebaseRuntimeTarget); reject(error);
      }); } catch (error) {
        listenerFailed = true;
        reportReviewQueryFailure(error, "head-listener", firebaseRuntimeTarget); reject(error as Error);
      }
    };
    const control = { viewer, retry: () => { if (!waiting) { retries = 0; connect(); } }, refresh: () => refreshCurrent() };
    reviewControls.set(technicianId, control);
    connect();
    return () => { disposed = true; clearTimeout(retryTimer); verified = undefined; stopCurrent(); if (reviewControls.get(technicianId) === control) reviewControls.delete(technicianId); };
  }, onNext, onError);
}
