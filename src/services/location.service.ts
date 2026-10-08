import { collection, doc, documentId, getDocFromServer, getDocsFromServer, limit, onSnapshot, orderBy,
  query, runTransaction, serverTimestamp, setDoc, startAfter, Timestamp, where, writeBatch } from "firebase/firestore";
import { auth, db } from "@/src/firebase/config";
import { readTechnicianAvailability, TechnicianAvailability } from "@/functions/src/domain/availability";
import { approximateCoordinate, DISTRICTS, locationIsFresh, resolveServiceDistrictIds, validCoordinate } from "@/functions/src/domain/map";
import { buildMapProfile, mapServiceCategory, MAP_MAX_ITEMS, MAP_PAGE_SIZE } from "@/functions/src/domain/mapProjection";
import { StoredServiceAreasByDistrict, encodeServiceAreas, readServiceAreas, retainServiceAreas } from "@/functions/src/domain/serviceAreas";
import { classifyMapServiceError, MapServiceError } from "@/src/utils/mapServiceError";
export type MapTechnician = {
  uid: string; fullName: string; specialization: string; serviceDistrictIds: string[];
  averageRating: number; reviewCount: number;
  serviceAreasByDistrict?: StoredServiceAreasByDistrict;
  availability?: TechnicianAvailability;
};
export type SharedMapLocation = { latitude: number; longitude: number; updatedAtMs?: number };
export type PublicMapLocationSnapshot = { location: SharedMapLocation | null; updatedAtMs?: number };
export type MapPage = { items: MapTechnician[]; cursor?: string; hasMore: boolean };
export type JobLocation = { status: "available"; technicianId: string; latitude: number; longitude: number; updatedAtMs: number } |
  { status: "not-sharing" | "stale" };

function mapProfile(uid: string, data: Record<string, any> | undefined): MapTechnician {
  if (!data) throw new MapServiceError("service", "failed-precondition");
  return { uid, fullName: data.fullName, specialization: data.specialization,
    serviceDistrictIds: data.serviceDistrictIds, averageRating: data.averageRating, reviewCount: data.reviewCount,
    ...(readTechnicianAvailability(data.availability) ? { availability: readTechnicianAvailability(data.availability) } : {}),
    ...(data.serviceAreasByDistrict !== undefined ? { serviceAreasByDistrict: data.serviceAreasByDistrict } : {}) };
}

/** Bounded public projection listener. Every emission rechecks authoritative approval via server gets. */
export function subscribeToMapTechnicians(districtId: string, category: string | undefined, pageCount: number,
  onNext: (page: MapPage) => void, onError: (error: Error) => void): () => void {
  if (!DISTRICTS.some((district) => district.id === districtId)) throw new Error("Select a valid service district.");
  const count = Math.min(MAP_MAX_ITEMS, Math.max(1, pageCount) * MAP_PAGE_SIZE);
  const directory = query(collection(db, "technician_map_profiles"), where("approved", "==", true),
    where("serviceDistrictIds", "array-contains", districtId), ...(category ? [where("serviceCategory", "==", category)] : []),
    orderBy(documentId()), limit(count));
  let alive = true, generation = 0;
  const fail = async (cause: unknown, version: number) => {
    const error = await classifyMapServiceError(cause);
    if (alive && generation === version) onError(error);
  };
  const unsubscribe = onSnapshot(directory, { includeMetadataChanges: true }, (snapshot) => {
    const version = ++generation;
    if (snapshot.metadata.fromCache) { void fail(new MapServiceError("network", "unavailable"), version); return; }
    // Reads are limited to this page (8/16/24), never private users or GPS documents.
    void Promise.all(snapshot.docs.map((item) => getDocFromServer(item.ref))).then((verified) => {
      if (!alive || generation !== version) return;
      const items = verified.map((item) => mapProfile(item.id, item.data()))
        .filter((item) => item.serviceDistrictIds.includes(districtId) &&
          (!category || mapServiceCategory(item.specialization) === category));
      items.sort((a, b) => b.averageRating - a.averageRating || a.fullName.localeCompare(b.fullName));
      onNext({ items, cursor: snapshot.docs.at(-1)?.id, hasMore: snapshot.size === count && count < MAP_MAX_ITEMS });
    }).catch((cause) => { void fail(cause, version); });
  }, (cause) => { void fail(cause, ++generation); });
  return () => { alive = false; generation++; unsubscribe(); };
}

export async function getMapTechnicianPage(districtId: string, category?: string, cursor?: string): Promise<MapPage> {
  if (!DISTRICTS.some((district) => district.id === districtId)) throw new Error("Select a valid service district.");
  try {
    const directory = query(collection(db, "technician_map_profiles"), where("approved", "==", true),
      where("serviceDistrictIds", "array-contains", districtId), ...(category ? [where("serviceCategory", "==", category)] : []),
      orderBy(documentId()), ...(cursor ? [startAfter(cursor)] : []), limit(MAP_PAGE_SIZE));
    const snapshot = await getDocsFromServer(directory);
    // Each get independently checks CURRENT authoritative approval. Never swallow denied gets.
    const verified = await Promise.all(snapshot.docs.map((item) => getDocFromServer(item.ref)));
    return { items: verified.map((item) => mapProfile(item.id, item.data())),
      cursor: snapshot.docs.at(-1)?.id, hasMore: snapshot.size === MAP_PAGE_SIZE };
  } catch (cause) { throw await classifyMapServiceError(cause); }
}

export async function getMapTechnicians(districtId: string, category?: string): Promise<MapTechnician[]> {
  return (await getMapTechnicianPage(districtId, category)).items;
}

const savedJobReferences = new Map<string, string>();
export async function getJobTechnicianLocation(requestId: string): Promise<JobLocation> {
  const customerId = auth.currentUser?.uid;
  if (!customerId) throw new MapServiceError("access", "unauthenticated");
  try {
    const job = (await getDocFromServer(doc(db, "service_requests", requestId))).data();
    if (!job || job.customerId !== customerId || !["accepted", "assigned", "in_progress"].includes(job.status)) {
      throw new MapServiceError("access", "permission-denied");
    }
    const current = typeof job.technicianId === "string" && job.technicianId.trim() ? job.technicianId : undefined;
    const legacy = typeof job.assignedTechnicianId === "string" && job.assignedTechnicianId.trim() ? job.assignedTechnicianId : undefined;
    const technicianId = current ?? legacy;
    if (!technicianId || technicianId.includes("/") || current && legacy && current !== legacy) throw new MapServiceError("service", "failed-precondition");
    const publicLocation = (await getDocFromServer(doc(db, "technician_map_locations", technicianId))).data();
    if (publicLocation?.sharingEnabled !== true) return { status: "not-sharing" };
    if (!locationIsFresh(publicLocation.updatedAt?.toMillis())) return { status: "stale" };
    const referenceKey = `${customerId}:${technicianId}`;
    if (savedJobReferences.get(referenceKey) !== requestId) {
      await setDoc(doc(db, "technician_location_access", technicianId, "customers", customerId), {
        requestId, technicianId, customerId, updatedAt: serverTimestamp(),
      });
      savedJobReferences.set(referenceKey, requestId);
    }
    // Rules recheck the authoritative job, approval, sharing and freshness on every get.
    const location = (await getDocFromServer(doc(db, "technician_locations", technicianId))).data();
    const updatedAtMs = location?.updatedAt?.toMillis();
    if (!location || !locationIsFresh(updatedAtMs) || !validCoordinate(location as SharedMapLocation)) return { status: "stale" };
    return { status: "available", technicianId, latitude: location.latitude, longitude: location.longitude, updatedAtMs };
  } catch (cause) { if (cause instanceof MapServiceError) throw cause; throw await classifyMapServiceError(cause); }
}

export async function syncOwnMapProfile(uid: string): Promise<void> {
  if (auth.currentUser?.uid !== uid) throw new Error("Please sign in as this Technician.");
  await runTransaction(db, async (transaction) => {
    const userRef = doc(db, "users", uid), mapRef = doc(db, "technician_map_profiles", uid);
    const profile = (await transaction.get(userRef)).data();
    if (!profile || profile.role !== "technician") throw new Error("A Technician profile is required.");
    const existing = (await transaction.get(mapRef)).data();
    const serviceDistrictIds = resolveServiceDistrictIds(profile);
    const desired = buildMapProfile(uid, { ...profile, serviceDistrictIds });
    if (profile.serviceDistrictIds === undefined) transaction.update(userRef, { serviceDistrictIds, updatedAt: serverTimestamp() });
    const same = existing && Object.keys(existing).length === Object.keys(desired).length + 1 &&
      Object.entries(desired).every(([key, value]) => JSON.stringify(existing[key]) === JSON.stringify(value));
    if (!same) transaction.set(mapRef, { ...desired, updatedAt: serverTimestamp() });
  });
}

export async function publishTechnicianLocation(uid: string, point?: { latitude: number; longitude: number; sampledAt?: number }): Promise<void> {
  if (auth.currentUser?.uid !== uid) throw new Error("Please sign in as this Technician.");
  if (point && !validCoordinate(point)) throw new Error("GPS returned an invalid location.");
  const updatedAt = serverTimestamp();
  const base = { technicianId: uid, sharingEnabled: !!point, updatedAt };
  const batch = writeBatch(db);
  // Exact coordinates never go into profiles or public map documents.
  batch.set(doc(db, "technician_locations", uid), point ? { ...base, latitude: point.latitude, longitude: point.longitude,
    sampledAt: Timestamp.fromMillis(point.sampledAt ?? Date.now()) } : base);
  batch.set(doc(db, "technician_map_locations", uid), point ? {
    ...base, latCell: Math.floor(point.latitude * 100), lngCell: Math.floor(point.longitude * 100),
  } : base);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([batch.commit(), new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(Object.assign(new Error("Location update could not be confirmed. Check your connection and retry."), { code: "location/publish-timeout" })), 12000);
    })]);
  } finally { clearTimeout(timer); }
}

function readPublicMapLocation(uid: string, data: Record<string, any> | undefined): PublicMapLocationSnapshot {
  const updatedAtMs = data?.updatedAt?.toMillis?.();
  if (!data || data.technicianId !== uid || data.sharingEnabled !== true || !Number.isInteger(data.latCell) || !Number.isInteger(data.lngCell) ||
      data.latCell < -9000 || data.latCell > 9000 || data.lngCell < -18000 || data.lngCell > 18000) return { location: null, updatedAtMs };
  const point = approximateCoordinate(data.latCell, data.lngCell);
  return { location: validCoordinate(point) ? { ...point, updatedAtMs } : null, updatedAtMs };
}

/** One explicit server read per location action. Never returns private GPS or a cached fallback. */
export async function getLatestMapLocation(uid: string): Promise<PublicMapLocationSnapshot> {
  if (!uid.trim() || uid.includes("/")) throw new Error("Select a valid Technician.");
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const snapshot = await Promise.race([getDocFromServer(doc(db, "technician_map_locations", uid)),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new MapServiceError("network", "deadline-exceeded")), 12000); })]);
    if (snapshot.metadata?.fromCache) throw new MapServiceError("network", "unavailable");
    const result = readPublicMapLocation(uid, snapshot.data());
    return result;
  } catch (cause) { throw await classifyMapServiceError(cause); }
  finally { clearTimeout(timer); }
}

export function subscribeToMapLocation(uid: string, onNext: (location: SharedMapLocation | null, updatedAtMs?: number) => void, onError: (error: Error) => void) {
  return onSnapshot(doc(db, "technician_map_locations", uid), { includeMetadataChanges: true }, (snapshot) => {
    if (snapshot.metadata.fromCache) { onError(new MapServiceError("network", "unavailable")); return; }
    const result = readPublicMapLocation(uid, snapshot.data());
    onNext(result.location, result.updatedAtMs);
  }, (cause) => { void classifyMapServiceError(cause).then(onError); });
}

export async function updateServiceDistricts(uid: string, ids: string[]): Promise<void> {
  if (auth.currentUser?.uid !== uid || ids.some((id) => !DISTRICTS.some((district) => district.id === id))) {
    throw new Error("Select valid service districts for your own account.");
  }
  await runTransaction(db, async (transaction) => {
    const userRef = doc(db, "users", uid);
    const profile = (await transaction.get(userRef)).data();
    if (!profile) throw new Error("Technician profile unavailable.");
    const serviceDistrictIds = [...new Set(ids)];
    const areas = profile.serviceAreasByDistrict !== undefined ? { serviceAreasByDistrict: encodeServiceAreas(serviceDistrictIds, retainServiceAreas(serviceDistrictIds, readServiceAreas(profile.serviceAreasByDistrict))) } : {};
    transaction.update(userRef, { serviceDistrictIds, ...areas, updatedAt: serverTimestamp() });
    transaction.set(doc(db, "technician_map_profiles", uid), {
      ...buildMapProfile(uid, { ...profile, serviceDistrictIds, ...areas }), updatedAt: serverTimestamp(),
    });
  });
}
