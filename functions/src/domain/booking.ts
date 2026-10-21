export class BookingError extends Error {
  constructor(public readonly code: "booking/conflict" | "booking/account" | "booking/invalid" | "booking/session", message: string) {
    super(message);
    this.name = "BookingError";
  }
}

export function bookingAccount(profile: Record<string, unknown> | undefined, role: "customer" | "technician") {
  if (!profile || profile.role !== role || (profile.accountStatus !== undefined && profile.accountStatus !== "active") || profile.lifecyclePending === true) {
    throw new BookingError("booking/account", `An active ${role === "customer" ? "Customer" : "Technician"} account is required. Sign in again or contact support.`);
  }
  if (role === "technician" && profile.technicianApprovalStatus !== "approved") {
    throw new BookingError("booking/account", "An approved Technician account is required.");
  }
}

/** Identity comes from the saved request, including the established legacy field. */
export function bookingTechnician(job: Record<string, unknown>): string {
  const current = typeof job.technicianId === "string" ? job.technicianId.trim() : "";
  const legacy = typeof job.assignedTechnicianId === "string" ? job.assignedTechnicianId.trim() : "";
  if ((!current && !legacy) || current && legacy && current !== legacy) {
    throw new BookingError("booking/conflict", "This booking has missing or conflicting technician records. Contact support.");
  }
  return current || legacy;
}

export function requireBookingTransition(from: unknown, to: string, actor: "customer" | "technician") {
  const pending = from === "requested" || from === "pending";
  const accepted = from === "accepted" || from === "assigned";
  const allowed = actor === "customer" ? pending && to === "cancelled"
    : pending && (to === "accepted" || to === "rejected") ||
      accepted && (to === "in_progress" || to === "cancelled") ||
      from === "in_progress" && to === "completed";
  if (!allowed) throw new BookingError("booking/conflict", "This booking has already changed. Refresh its details before choosing an action.");
}

export function actionableBookingError(error: unknown): Error {
  if (error instanceof BookingError) return error;
  const code = (error as { code?: string })?.code?.replace(/^firestore\//, "");
  const message = code === "permission-denied" || code === "unauthenticated"
    ? "This booking could not be saved. Verify your account, refresh the booking and technician availability, then retry."
    : code === "unavailable" || code === "deadline-exceeded"
      ? "Unable to confirm the booking online. Check your connection and retry the same submission to check whether it was saved."
      : code === "aborted" || code === "failed-precondition"
        ? "The booking changed while saving. Refresh its details and retry."
        : undefined;
  return message ? Object.assign(new Error(message), { code }) : error instanceof Error ? error : new Error("Unable to save this booking. Please retry.");
}
