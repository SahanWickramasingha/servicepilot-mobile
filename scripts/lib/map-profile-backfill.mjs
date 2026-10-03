import { createRequire } from "node:module";
const require = createRequire(new URL("../../functions/package.json", import.meta.url));
const { buildMapProfile } = require("./lib/domain/mapProjection.js");
const { resolveServiceDistrictIds } = require("./lib/domain/map.js");
const { FieldValue } = require("firebase-admin/firestore");

export function proposeMapProfile(technicianId, source, existing) {
  if (!source || source.role !== "technician") return null;
  const serviceDistrictIds = resolveServiceDistrictIds(source);
  if (source.serviceDistrictIds !== undefined && (!Array.isArray(source.serviceDistrictIds) ||
    JSON.stringify(source.serviceDistrictIds) !== JSON.stringify(serviceDistrictIds))) {
    throw new Error("Technician service districts require validation.");
  }
  const projection = buildMapProfile(technicianId, { ...source, serviceDistrictIds });
  const normalize = source.serviceDistrictIds === undefined;
  const same = existing && Object.keys(existing).length === Object.keys(projection).length + 1 &&
    Object.entries(projection).every(([key, value]) => JSON.stringify(existing[key]) === JSON.stringify(value));
  if (!normalize && same) return null;
  return { technicianId, serviceDistrictIdsChange: normalize ? { from: null, to: serviceDistrictIds } : undefined,
    mapProfileChange: same ? undefined : projection };
}

export async function backfillMapProfile(db, technicianId, apply = false) {
  const userRef = db.doc(`users/${technicianId}`), mapRef = db.doc(`technician_map_profiles/${technicianId}`);
  if (!apply) {
    const [user, map] = await db.getAll(userRef, mapRef);
    return proposeMapProfile(technicianId, user.data(), map.data());
  }
  return db.runTransaction(async (transaction) => {
    const [user, map] = await transaction.getAll(userRef, mapRef);
    // Recompute under a transaction; never write a stale approval/rating snapshot.
    const proposal = proposeMapProfile(technicianId, user.data(), map.data());
    if (proposal?.serviceDistrictIdsChange) transaction.update(userRef, { serviceDistrictIds: proposal.serviceDistrictIdsChange.to });
    if (proposal?.mapProfileChange) transaction.set(mapRef, { ...proposal.mapProfileChange, updatedAt: FieldValue.serverTimestamp() });
    return proposal;
  });
}
