import {
  collection,
  doc,
  getDoc,
  getDocFromServer,
  onSnapshot,
  query,
  serverTimestamp,
  Timestamp,
  where,
  runTransaction,
  type Transaction,
} from "firebase/firestore";

import {
  RequestPriority,
  RequestStatus,
  ServiceCategory,
} from "@/src/constants/serviceRequests";
import { auth, db } from "@/src/firebase/config";
import { createSessionStream } from "./session-subscriptions";
import { liveDocuments } from "@/src/utils/liveDocuments";
import { requireAvailableTechnician } from "@/functions/src/domain/availability";
import { actionableBookingError, bookingAccount, bookingTechnician, BookingError, requireBookingTransition } from "@/functions/src/domain/booking";
import { requireCompletionEvidence, type JobEvidence } from "@/functions/src/domain/jobEvidence";
import { workElapsedMs, type WorkTimer } from "@/functions/src/domain/workTimer";
import { UserProfile } from "@/src/services/user.service";
import { type PublicTechnicianProfile } from "@/src/services/technician.service";
import { bookingInterval, BOOKING_TIME_ZONE } from "@/functions/src/domain/scheduling";
import { callBookingSchedule } from "./bookingSchedule.service";

export interface ServiceRequest {
  id: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  technicianId: string;
  technicianName: string;
  serviceCategory: ServiceCategory;
  title: string;
  description: string;
  address: string;
  serviceArea: string;
  division: string;
  preferredDate: string;
  preferredTime: string;
  scheduledAt?: Timestamp;
  priority: RequestPriority;
  status: RequestStatus;
  assignedTechnicianId?: string | null;
  assignedTechnicianName?: string | null;
  assignedDispatcherId?: string | null;
  imageUrls: string[];
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  acceptedAt?: Timestamp;
  rejectedAt?: Timestamp;
  startedAt?: Timestamp;
  completedAt?: Timestamp;
  cancelledAt?: Timestamp;
  cancelledBy?: string;
  rejectionReason?: string;
  technicianCancellationReason?: string;
  technicianCancelledAt?: Timestamp;
  customerCancellationReason?: string;
  workTimer?: WorkTimer;
  durationMinutes?: number;
  scheduledEndAt?: Timestamp;
  schedulingVersion?: number;
  scheduleRevision?: number;
  scheduleProposal?: { date: string; time: string; durationMinutes: number; revision: number };
}

export type RequestTechnicianReviewTarget =
  | {
      ok: true;
      technicianId: string;
      technicianName: string;
      source: "technicianId" | "assignedTechnicianId";
    }
  | {
      ok: false;
      reason: "missing" | "conflict";
      message: string;
    };

export type CreateServiceRequestInput = {
  /** Stable for one form submission and its retries; a new intent gets a new ID. */
  attemptId?: string;
  profile: UserProfile;
  technician: PublicTechnicianProfile;
  serviceCategory: ServiceCategory;
  title: string;
  description: string;
  address: string;
  division?: string;
  preferredDate: string;
  preferredTime?: string;
  scheduledAt: Date;
  durationMinutes: number;
  priority: RequestPriority;
  imageUrls?: string[];
};

function mapServiceRequest(
  id: string,
  data: Record<string, unknown>
): ServiceRequest {
  return {
    id,
    customerId: String(data.customerId ?? ""),
    customerName: String(data.customerName ?? ""),
    customerEmail: String(data.customerEmail ?? ""),
    customerPhone: String(data.customerPhone ?? ""),
    technicianId: String(
      data.technicianId ||
        data.assignedTechnicianId ||
        ""
    ),
    technicianName: String(
      data.technicianName ??
        data.assignedTechnicianName ??
        ""
    ),
    serviceCategory:
      data.serviceCategory as ServiceCategory,
    title: String(data.title ?? ""),
    description: String(data.description ?? ""),
    address: String(data.address ?? ""),
    serviceArea: String(data.serviceArea ?? ""),
    division: String(
      data.division ?? data.serviceArea ?? ""
    ),
    preferredDate: String(data.preferredDate ?? ""),
    preferredTime: String(data.preferredTime ?? ""),
    scheduledAt: data.scheduledAt as Timestamp | undefined,
    priority: (data.priority ?? "normal") as RequestPriority,
    status: (data.status ?? "pending") as RequestStatus,
    assignedTechnicianId:
      (data.assignedTechnicianId as string | null | undefined) ??
      null,
    assignedTechnicianName:
      (data.assignedTechnicianName as string | null | undefined) ??
      null,
    assignedDispatcherId:
      (data.assignedDispatcherId as string | null | undefined) ??
      null,
    imageUrls: Array.isArray(data.imageUrls)
      ? (data.imageUrls as string[])
      : [],
    createdAt: data.createdAt as Timestamp | undefined,
    updatedAt: data.updatedAt as Timestamp | undefined,
    acceptedAt: data.acceptedAt as Timestamp | undefined,
    rejectedAt: data.rejectedAt as Timestamp | undefined,
    startedAt: data.startedAt as Timestamp | undefined,
    completedAt: data.completedAt as Timestamp | undefined,
    cancelledAt: data.cancelledAt as Timestamp | undefined,
    cancelledBy: data.cancelledBy as string | undefined,
    rejectionReason: data.rejectionReason as string | undefined,
    technicianCancellationReason:
      data.technicianCancellationReason as string | undefined,
    technicianCancelledAt:
      data.technicianCancelledAt as Timestamp | undefined,
    customerCancellationReason:
      data.customerCancellationReason as string | undefined,
    workTimer: data.workTimer as WorkTimer | undefined,
    durationMinutes: data.durationMinutes as number | undefined,
    scheduledEndAt: data.scheduledEndAt as Timestamp | undefined,
    schedulingVersion: data.schedulingVersion as number | undefined,
    scheduleRevision: data.scheduleRevision as number | undefined,
    scheduleProposal: data.scheduleProposal as ServiceRequest["scheduleProposal"],
  };
}

function sortByCreatedDesc(
  requests: ServiceRequest[]
): ServiceRequest[] {
  return [...requests].sort((first, second) => {
    const firstMillis = first.createdAt?.toMillis() ?? 0;
    const secondMillis = second.createdAt?.toMillis() ?? 0;
    return secondMillis - firstMillis;
  });
}

export function createServiceRequestAttemptId(): string { return doc(collection(db, "service_requests")).id; }

function bookingSession(uid: string) {
  if (auth.currentUser?.uid !== uid || auth.currentUser.emailVerified !== true) {
    throw new BookingError("booking/session", "Please sign in with your verified account before saving this booking.");
  }
}

function bookingNotification(transaction: Transaction, requestId: string, data: {
  userId: string; type: string; title: string; message: string; priority: string;
}) {
  // The booking and its existing personal notification succeed or fail together.
  transaction.set(doc(db, "notifications", `${requestId}_${data.type}`), {
    ...data, requestId, read: false, createdAt: serverTimestamp(),
  });
}

export async function createServiceRequest(input: CreateServiceRequestInput): Promise<string> {
  const uid = auth.currentUser?.uid;
  if (!uid || uid !== input.profile.uid) throw new BookingError("booking/session", "Unable to create a request for this account. Please sign in again.");
  bookingSession(uid);
  const attemptId = input.attemptId ?? createServiceRequestAttemptId();
  if (!/^[A-Za-z0-9]{20}$/.test(attemptId)) throw new BookingError("booking/invalid", "Invalid submission. Reopen the booking form.");
  const requestRef = doc(db, "service_requests", attemptId);
  const receiptRef = doc(db, "booking_attempts", uid, "requests", attemptId);
  try {
    return await runTransaction(db, async (transaction) => {
      const profile = (await transaction.get(doc(db, "users", uid))).data();
      const receipt = await transaction.get(receiptRef);
      bookingSession(uid); bookingAccount(profile, "customer");
      if (receipt.exists()) {
        const saved = (await transaction.get(requestRef)).data();
        if (!saved || saved.customerId !== uid) throw new BookingError("booking/conflict", "The saved submission could not be confirmed. Contact support.");
        // A receipt is an immutable identity for the original intent, not a capacity lock.
        return requestRef.id;
      }
      const projection = (await transaction.get(doc(db, "technician_map_profiles", input.technician.uid))).data();
      bookingSession(uid);
      if (!projection || projection.technicianId !== input.technician.uid || projection.approved !== true) {
        throw new BookingError("booking/account", "This technician is no longer approved. Select an approved technician and retry.");
      }
      requireAvailableTechnician(projection.availability);
      if (!(input.scheduledAt instanceof Date) || !Number.isFinite(input.scheduledAt.getTime()) || input.scheduledAt.getTime() <= Date.now()) {
        throw new BookingError("booking/invalid", "Please select a valid future preferred date and time.");
      }
      const area = input.division?.trim() || input.technician.serviceDivision;
      const interval = bookingInterval(input.preferredDate, input.preferredTime ?? "", input.durationMinutes);
      if (input.scheduledAt.getTime() !== interval.start) throw new BookingError("booking/invalid", "The selected time must use Asia/Colombo.");
      transaction.set(requestRef, {
        customerId: uid, customerName: profile!.fullName, customerEmail: profile!.email, customerPhone: profile!.phone,
        technicianId: projection.technicianId, technicianName: projection.fullName,
        serviceCategory: input.serviceCategory, title: input.title.trim(), description: input.description.trim(), address: input.address.trim(),
        serviceArea: area, division: area, preferredDate: input.preferredDate.trim(), preferredTime: input.preferredTime?.trim() ?? "",
        scheduledAt: Timestamp.fromDate(input.scheduledAt), priority: input.priority, status: "requested", imageUrls: input.imageUrls ?? [],
        scheduledEndAt: Timestamp.fromMillis(interval.end), durationMinutes: input.durationMinutes,
        schedulingVersion: 1, bookingTimeZone: BOOKING_TIME_ZONE, scheduleRevision: 0,
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
      transaction.set(receiptRef, { requestId: requestRef.id, customerId: uid, createdAt: serverTimestamp() });
      bookingNotification(transaction, requestRef.id, {
        userId: projection.technicianId, type: "new_customer_request", title: "New Customer Request",
        message: `${profile!.fullName} requested ${input.title.trim() || input.serviceCategory}.`, priority: input.priority === "urgent" ? "important" : "normal",
      });
      return requestRef.id;
    });
  } catch (error) {
    // A concurrent create-only commit can be denied by rules before Firestore
    // retries its stale read. Confirm THIS attempt's persisted result, never a
    // query for a similar booking or a guess based on an error code.
    if (["permission-denied", "already-exists", "aborted"].includes((error as { code?: string }).code ?? "")) {
      try {
        bookingSession(uid);
        const receipt = (await getDocFromServer(receiptRef)).data();
        if (receipt?.requestId === attemptId && receipt.customerId === uid) {
          const saved = (await getDocFromServer(requestRef)).data();
          bookingSession(uid);
          if (saved?.customerId === uid) return requestRef.id;
        }
      } catch { /* An unconfirmed or unauthorized read cannot turn failure into success. */ }
    }
    throw actionableBookingError(error);
  }
}

const requestsStream = createSessionStream<[ServiceRequest[]]>(() => [[]]);
export function subscribeToTechnicianRequests(
  technicianId: string,
  onNext: (requests: ServiceRequest[]) => void,
  onError: (error: Error) => void
) {
  const requestsQuery = query(
    collection(db, "service_requests"),
    where("technicianId", "==", technicianId)
  );

  return requestsStream(`technician:${technicianId}`, (emit, fail) => {
    const rows = liveDocuments(mapServiceRequest);
    return onSnapshot(
    requestsQuery,
    (snapshot) => {
      emit(
        sortByCreatedDesc(rows(snapshot))
      );
    },
    fail
    );
  }, onNext, onError);
}

export function subscribeToCustomerRequests(
  customerId: string,
  onNext: (requests: ServiceRequest[]) => void,
  onError: (error: Error) => void
) {
  const requestsQuery = query(
    collection(db, "service_requests"),
    where("customerId", "==", customerId)
  );

  return requestsStream(`customer:${customerId}`, (emit, fail) => {
    const rows = liveDocuments(mapServiceRequest);
    return onSnapshot(
    requestsQuery,
    (snapshot) => {
      emit(
        sortByCreatedDesc(rows(snapshot))
      );
    },
    fail
    );
  }, onNext, onError);
}

const requestStream = createSessionStream<[ServiceRequest | null]>(() => [null]);
export function subscribeToServiceRequest(
  requestId: string,
  onNext: (request: ServiceRequest | null) => void,
  onError: (error: Error) => void
) {
  return requestStream(requestId, (emit, fail) => onSnapshot(
    doc(db, "service_requests", requestId),
    (snapshot) => {
      if (!snapshot.exists()) {
        emit(null);
        return;
      }

      emit(
        mapServiceRequest(snapshot.id, snapshot.data())
      );
    },
    fail
  ), onNext, onError);
}

export function getRequestTechnicianReviewTarget(
  request: ServiceRequest
): RequestTechnicianReviewTarget {
  const technicianId = request.technicianId?.trim();
  const assignedTechnicianId =
    request.assignedTechnicianId?.trim() ?? "";

  if (
    technicianId &&
    assignedTechnicianId &&
    technicianId !== assignedTechnicianId
  ) {
    return {
      ok: false,
      reason: "conflict",
      message:
        "This request has conflicting technician records and cannot be reviewed. Please contact support.",
    };
  }

  if (technicianId) {
    return {
      ok: true,
      technicianId,
      technicianName:
        request.technicianName ||
        request.assignedTechnicianName ||
        "Service Technician",
      source: "technicianId",
    };
  }

  if (assignedTechnicianId) {
    return {
      ok: true,
      technicianId: assignedTechnicianId,
      technicianName:
        request.assignedTechnicianName ||
        request.technicianName ||
        "Service Technician",
      source: "assignedTechnicianId",
    };
  }

  return {
    ok: false,
    reason: "missing",
    message:
      "This request has no technician identity available to review.",
  };
}

export async function getServiceRequest(
  requestId: string
): Promise<ServiceRequest | null> {
  const snapshot = await getDoc(
    doc(db, "service_requests", requestId)
  );

  if (!snapshot.exists()) {
    return null;
  }

  return mapServiceRequest(snapshot.id, snapshot.data());
}

export async function cancelServiceRequest(
  requestId: string,
  customerId: string
): Promise<void> {
  const currentUser = auth.currentUser;

  if (!currentUser) {
    throw new Error("Please sign in before cancelling a request.");
  }

  if (currentUser.uid !== customerId) {
    throw new Error("You can only cancel your own request.");
  }

  try {
    await runTransaction(db, async (transaction) => {
      const reference = doc(db, "service_requests", requestId);
      const job = (await transaction.get(reference)).data();
      const profile = (await transaction.get(doc(db, "users", currentUser.uid))).data();
      bookingSession(currentUser.uid); bookingAccount(profile, "customer");
      if (!job || job.customerId !== currentUser.uid) throw new BookingError("booking/account", "You can only cancel your own request.");
      if (job.status === "cancelled" && job.cancelledBy === "customer") return;
      requireBookingTransition(job.status, "cancelled", "customer");
      const technicianId = bookingTechnician(job);
      transaction.update(reference, { status: "cancelled", cancelledAt: serverTimestamp(), cancelledBy: "customer", updatedAt: serverTimestamp() });
      bookingNotification(transaction, requestId, { userId: technicianId, type: "customer_cancelled_request", title: "Customer Cancelled Request",
        message: `${job.customerName || "A customer"} cancelled ${job.title || "a service request"}.`, priority: "important" });
    });
  } catch (error) { throw actionableBookingError(error); }
}

export async function updateTechnicianRequestStatus(
  requestId: string,
  status:
    | "accepted"
    | "rejected"
    | "in_progress"
    | "completed"
    | "cancelled",
  options: { reason?: string } = {}
): Promise<void> {
  const currentUser = auth.currentUser;

  if (!currentUser) {
    throw new Error("Please sign in before updating this request.");
  }

  if (status === "accepted") {
    await callBookingSchedule({ action: "accept", requestId });
    return;
  }

  const reason = options.reason?.trim() ?? "";

  if (status === "rejected" && !reason) {
    throw new Error("Please enter a rejection reason.");
  }

  if (status === "cancelled" && !reason) {
    throw new Error("Please enter a cancellation reason.");
  }

  const timestampField =
    status === "rejected"
        ? "rejectedAt"
        : status === "in_progress"
          ? "startedAt"
          : status === "completed"
            ? "completedAt"
            : "technicianCancelledAt";

  const updatePayload: Record<string, unknown> = {
    status,
    [timestampField]: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (status === "rejected") {
    updatePayload.rejectionReason = reason;
  }

  if (status === "cancelled") {
    updatePayload.cancelledBy = "technician";
    updatePayload.technicianCancellationReason = reason;
  }

  const transition = () => runTransaction(db, async (transaction) => {
    const requestRef = doc(db, "service_requests", requestId);
    const snapshot = await transaction.get(requestRef);
    if (!snapshot.exists()) throw new Error("Request not found.");
    const data = snapshot.data();
    const job = mapServiceRequest(snapshot.id, data);
    if (bookingTechnician(data) !== currentUser.uid || auth.currentUser?.uid !== currentUser.uid) {
      throw new Error("You can only update your assigned requests.");
    }
    const profile = (await transaction.get(doc(db, "users", currentUser.uid))).data();
    bookingSession(currentUser.uid); bookingAccount(profile, "technician");
    if (job.status === status && (status !== "cancelled" || data.cancelledBy === "technician")) return;
    requireBookingTransition(job.status, status, "technician");
    if (status === "completed") {
      const evidence = (await transaction.get(doc(db, "job_evidence", requestId))).data() as JobEvidence | undefined;
      requireCompletionEvidence(evidence, requestId, currentUser.uid, job.customerId);
    }
    // Never update availability on acceptance/completion: no automatic one-job cap.
    const timerChange = status === "in_progress"
      ? { workTimer: { elapsedMs: 0, runningSince: serverTimestamp(), pausedAt: null, revision: 0 } }
      : (status === "completed" || status === "cancelled") && job.workTimer && !job.workTimer.pausedAt
        ? { workTimer: { ...job.workTimer, pausedAt: serverTimestamp(), revision: job.workTimer.revision + 1 } } : {};
    transaction.update(requestRef, { ...updatePayload, ...timerChange });
    const notificationByStatus = {
    accepted: {
      type: "technician_accepted_request" as const,
      title: "Technician Accepted Request",
      message: `${job.technicianName || "Your technician"} accepted ${job.title || "your service request"}.`,
      priority: "normal" as const,
    },
    rejected: {
      type: "technician_rejected_request" as const,
      title: "Technician Rejected Request",
      message: `${job.technicianName || "Your technician"} rejected ${job.title || "your service request"}.`,
      priority: "important" as const,
    },
    in_progress: {
      type: "job_started" as const,
      title: "Job Started",
      message: `${job.technicianName || "Your technician"} started your service job.`,
      priority: "normal" as const,
    },
    completed: {
      type: "job_completed" as const,
      title: "Job Completed",
      message: `${job.technicianName || "Your technician"} marked your service job complete.`,
      priority: "important" as const,
    },
    cancelled: {
      type: "technician_cancelled_job" as const,
      title: "Technician Cancelled Job",
      message: `${job.technicianName || "Your technician"} cancelled ${job.title || "your service job"}.`,
      priority: "critical" as const,
    },
  }[status];

    bookingNotification(transaction, requestId, {
    userId: job.customerId,
    ...notificationByStatus,
  });
  });
  try { await transition(); }
  catch (error) {
    // A concurrent timer/status commit may make the Rules evaluation stale before
    // the SDK retries. Re-read in one bounded transaction; every guard runs again.
    if ((error as { code?: string }).code?.replace(/^firestore\//, "") === "permission-denied") {
      try { await transition(); return; } catch (retryError) { throw actionableBookingError(retryError); }
    }
    throw actionableBookingError(error);
  }
}

/** Absolute pause/resume intent plus revision protects retries and competing screens. */
export async function setJobTimerPaused(requestId: string, paused: boolean, expectedRevision: number): Promise<void> {
  const uid = auth.currentUser?.uid ?? ""; bookingSession(uid);
  await runTransaction(db, async (transaction) => {
    const reference = doc(db, "service_requests", requestId);
    const job = (await transaction.get(reference)).data();
    const profile = (await transaction.get(doc(db, "users", uid))).data();
    bookingSession(uid); bookingAccount(profile, "technician");
    if (!job || bookingTechnician(job) !== uid || job.status !== "in_progress") throw new BookingError("booking/conflict", "Only your in-progress job timer can be changed.");
    const timer = job.workTimer as WorkTimer | undefined;
    if (!timer && !job.startedAt) throw new BookingError("booking/conflict", "This older job has no recorded start time. Duration is unavailable.");
    if (!!timer?.pausedAt === paused) return;
    if ((timer?.revision ?? 0) !== expectedRevision) throw new BookingError("booking/conflict", "The timer changed on another screen. Refresh before trying again.");
    transaction.update(reference, { updatedAt: serverTimestamp(), workTimer: paused
      ? { elapsedMs: timer?.elapsedMs ?? 0, runningSince: timer?.runningSince ?? job.startedAt, pausedAt: serverTimestamp(), revision: expectedRevision + 1 }
      : { elapsedMs: workElapsedMs(timer), runningSince: serverTimestamp(), pausedAt: null, revision: expectedRevision + 1 } });
  }).catch(async (error: unknown) => {
    // Firestore can reject a concurrent stale rule evaluation before retrying a
    // transaction. Only a fresh, exact revision/intent proves the save succeeded.
    const code = (error as { code?: string }).code?.replace(/^firestore\//, "");
    if (code === "permission-denied" || code === "unavailable" || code === "deadline-exceeded") {
      try {
        const saved = (await getDocFromServer(doc(db, "service_requests", requestId))).data();
        bookingSession(uid);
        if (saved && bookingTechnician(saved) === uid && saved.status === "in_progress" &&
            saved.workTimer?.revision === expectedRevision + 1 && !!saved.workTimer.pausedAt === paused) return;
      } catch { /* Preserve the original failure when the save cannot be proved. */ }
    }
    throw actionableBookingError(error);
  });
}

export function formatRequestDate(
  timestamp?: Timestamp
): string {
  if (!timestamp) {
    return "Not available";
  }

  return timestamp.toDate().toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
