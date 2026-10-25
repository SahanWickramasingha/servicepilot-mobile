import type { Auth } from "firebase-admin/auth";
import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";
import { TrustedRequestError as RequestError } from "./trusted-auth";
import { accountSessionDenial } from "../domain/accountSession";
import { bookingAccount, bookingTechnician } from "../domain/booking";
import { bookingInterval, intervalsOverlap, BOOKING_TIME_ZONE } from "../domain/scheduling";
import { requireAvailableTechnician } from "../domain/availability";

/** Reuses the existing standalone trusted Node host, never a required Cloud Function.
 * Every addition/swap of reserved time reads AND writes the same technician lock.
 * This serializes competing requests, including query phantoms, across instances.
 * The request itself is the reservation; terminal states release it atomically.
 */
export function createBookingScheduleService({ auth, db, now = Date.now }: { auth: Auth; db: Firestore; now?: () => number }) {
  async function change(authorization: string | undefined, body: unknown) {
    const token = /^Bearer ([^\s]+)$/.exec(authorization ?? "")?.[1];
    let caller;
    try { if (!token) throw new Error(); caller = await auth.verifyIdToken(token, true); }
    catch { throw new RequestError(401, "unauthenticated", "Sign in again before changing this schedule."); }
    if (!caller.email_verified) throw new RequestError(403, "permission-denied", "Verify your email before changing a booking.");
    const input = body as Record<string, unknown>;
    if (!input || typeof input !== "object" || Array.isArray(input) ||
      Object.keys(input).some((key) => !["action", "requestId", "date", "time", "durationMinutes", "proposalRevision"].includes(key)) ||
      typeof input.requestId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(input.requestId) ||
      !["accept", "propose", "approve", "review-legacy"].includes(String(input.action))) throw new RequestError(400, "invalid-argument", "Invalid schedule action.");
    const uid = caller.uid, requestId = input.requestId;
    return db.runTransaction(async (tx) => {
      const jobRef = db.doc(`service_requests/${requestId}`);
      const [jobSnap, actorSnap] = await tx.getAll(jobRef, db.doc(`users/${uid}`));
      const job = jobSnap.data(), actor = actorSnap.data();
      if (!job) throw new RequestError(404, "not-found", "Booking not found.");
      const technicianId = bookingTechnician(job);
      const customerAction = input.action === "propose";
      if ((customerAction ? job.customerId : technicianId) !== uid || accountSessionDenial(actor ?? null, caller.auth_time)) throw new RequestError(403, "permission-denied", "This booking is not available to your active account.");
      try { bookingAccount(actor, customerAction ? "customer" : "technician"); }
      catch { throw new RequestError(403, "permission-denied", "An active approved participant account is required."); }
      if (input.action === "accept" && job.status === "accepted") return { requestId };
      if (input.action === "approve" && !job.scheduleProposal && Number.isInteger(input.proposalRevision) && Number(input.proposalRevision) > 0 && job.scheduleRevision === input.proposalRevision) return { requestId };
      const allowed = customerAction ? ["requested", "pending", "accepted", "assigned"] : input.action === "accept" ? ["requested", "pending"] :
        input.action === "review-legacy" ? ["requested", "pending", "accepted", "assigned", "in_progress"] : ["requested", "pending", "accepted", "assigned"];
      if (!allowed.includes(job.status)) throw new RequestError(409, "booking/conflict", "This booking has already changed. Refresh its details.");
      let interval: { start: number; end: number };
      let date = job.preferredDate, time = job.preferredTime, duration = job.durationMinutes;
      if (customerAction || input.action === "review-legacy") { date = input.date; time = input.time; duration = input.durationMinutes; }
      if (input.action === "approve") {
        if (!job.scheduleProposal || job.scheduleProposal.revision !== input.proposalRevision) throw new RequestError(409, "booking/conflict", "The proposed schedule changed. Reopen it before approving.");
        ({ date, time, durationMinutes: duration } = job.scheduleProposal);
      }
      try { interval = bookingInterval(date, time, duration); }
      catch { throw new RequestError(409, "booking/schedule-review", "An explicit valid duration and Colombo schedule are required. Review this booking's schedule."); }
      if (input.action === "review-legacy" && job.schedulingVersion === 1) {
        // A lost acknowledgement must not make an exact retry look like a new
        // schedule edit or send another notification. Later edits still conflict.
        if (job.preferredDate === date && job.preferredTime === time && job.durationMinutes === duration &&
          job.scheduledAt?.toMillis?.() === interval.start && job.scheduledEndAt?.toMillis?.() === interval.end) return { requestId };
        throw new RequestError(409, "booking/conflict", "This schedule was already reviewed.");
      }
      if (interval.start <= now() && input.action !== "review-legacy") throw new RequestError(409, "booking/conflict", "Choose a future Colombo schedule.");
      const stamp = FieldValue.serverTimestamp();
      if (customerAction) {
        if (job.preferredDate === date && job.preferredTime === time && job.durationMinutes === duration) return { requestId };
        if (job.scheduleProposal?.date === date && job.scheduleProposal?.time === time && job.scheduleProposal?.durationMinutes === duration) return { requestId };
        const revision = Math.max(job.scheduleRevision ?? 0, job.scheduleProposal?.revision ?? 0) + 1;
        tx.update(jobRef, { scheduleProposal: { date, time, durationMinutes: duration, revision }, updatedAt: stamp });
        tx.set(db.doc(`notifications/${requestId}_schedule_proposed_${revision}`), { userId: technicianId, requestId,
          type: "schedule_updated", title: "Schedule proposal", message: "The customer proposed a different service time. Review the booking.", priority: "normal", read: false, createdAt: stamp });
        return { requestId };
      }
      const lockRef = db.doc(`booking_schedule_locks/${technicianId}`);
      const [lock, customer, projection] = await tx.getAll(lockRef, db.doc(`users/${job.customerId}`), db.doc(`technician_map_profiles/${technicianId}`));
      try { bookingAccount(customer.data(), "customer"); }
      catch { throw new RequestError(403, "permission-denied", "An active Customer account is required."); }
      if (customer.data()?.emailVerified !== true || actor?.emailVerified !== true) throw new RequestError(403, "permission-denied", "Verified participant profiles are required.");
      if (input.action === "accept") {
        try { requireAvailableTechnician(actor?.availability); requireAvailableTechnician(projection.data()?.availability); }
        catch { throw new RequestError(409, "booking/conflict", "New requests require Available. Refresh technician availability."); }
        if (projection.data()?.approved !== true) throw new RequestError(403, "permission-denied", "An approved Technician is required.");
      }
      // Bounded fail-closed safety limit: never silently ignore additional records.
      const statuses = ["accepted", "assigned", "in_progress"];
      const current = await tx.get(db.collection("service_requests").where("technicianId", "==", technicianId).where("status", "in", statuses).limit(501));
      const legacy = await tx.get(db.collection("service_requests").where("assignedTechnicianId", "==", technicianId).where("status", "in", statuses).limit(501));
      if (current.size > 500 || legacy.size > 500) throw new RequestError(409, "booking/schedule-review", "Too many active schedules to verify safely. Contact support for schedule review.");
      for (const other of new Map([...current.docs, ...legacy.docs].map((item) => [item.id, item])).values()) {
        if (input.action !== "accept" && !statuses.includes(job.status)) break;
        if (other.id === requestId) continue;
        const data = other.data();
        const start = data.scheduledAt?.toMillis?.(), end = data.scheduledEndAt?.toMillis?.();
        if (bookingTechnician(data) !== technicianId || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw new RequestError(409, "booking/schedule-review", "Existing legacy jobs need an explicit schedule review before another booking can be accepted.");
        if (intervalsOverlap(interval, { start, end })) throw new RequestError(409, "booking/overlap", "This time overlaps another accepted service. Choose another interval.");
      }
      const revision = input.action === "approve" ? job.scheduleProposal.revision : job.scheduleRevision ?? 0;
      tx.set(lockRef, { revision: (lock.data()?.revision ?? 0) + 1, updatedAt: stamp });
      tx.update(jobRef, { schedulingVersion: 1, durationMinutes: duration, scheduledAt: Timestamp.fromMillis(interval.start),
        scheduledEndAt: Timestamp.fromMillis(interval.end), bookingTimeZone: BOOKING_TIME_ZONE, preferredDate: date, preferredTime: time,
        scheduleRevision: revision, scheduleProposal: FieldValue.delete(), updatedAt: stamp,
        ...(input.action === "accept" ? { status: "accepted", acceptedAt: stamp } : {}) });
      const type = input.action === "accept" ? "technician_accepted_request" : "schedule_updated";
      tx.set(db.doc(`notifications/${requestId}_${type}${type === "schedule_updated" ? `_${revision}` : ""}`), {
        userId: job.customerId, requestId, type, title: input.action === "accept" ? "Request accepted" : "Schedule confirmed",
        message: "Your technician confirmed the service schedule. Open the booking for details.", priority: "normal", read: false, createdAt: stamp });
      return { requestId };
    });
  }
  return { change };
}
