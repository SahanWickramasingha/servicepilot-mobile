import { auth, db, firebaseRuntimeTarget } from "@/src/firebase/config";
import { doc, getDocFromServer } from "firebase/firestore";

type Trace = { correlationId: string; stage: string; elapsedMs: number; origin: string;
  status?: number; contentType?: string; code?: string; errorName?: string; aborted?: boolean };
const diagnostics = { origin: process.env.EXPO_PUBLIC_BOOKING_API_URL ?
  (() => { try { return new URL(process.env.EXPO_PUBLIC_BOOKING_API_URL!).origin; } catch { return "invalid"; } })() : "missing",
  project: firebaseRuntimeTarget?.projectId, emulator: firebaseRuntimeTarget?.emulator, events: [] as Trace[] };
// Development-only ring contains transport metadata, never tokens, IDs or payloads.
if (typeof __DEV__ !== "undefined" && __DEV__) {
  (globalThis as typeof globalThis & { __servicepilotBookingDiagnostics?: typeof diagnostics }).__servicepilotBookingDiagnostics = diagnostics;
}

function safeError(error: unknown) {
  const value = error as { name?: string; code?: unknown; cause?: { code?: unknown } } | null;
  const code = value?.cause?.code ?? value?.code;
  const allowed = /^(?:auth\/[a-z-]+|booking\/[a-z-]+|ENOTFOUND|EAI_AGAIN|ECONNRESET|ECONNREFUSED|ETIMEDOUT|CERT_[A-Z_]+|[0-9]+)$/;
  return { errorName: ["TypeError", "SyntaxError", "AbortError", "TimeoutError", "FirebaseError", "Error"].includes(value?.name ?? "") ? value!.name : "Error",
    code: allowed.test(String(code)) ? String(code) : "transport-or-response" };
}

async function bounded<T>(operation: Promise<T>, milliseconds: number, code: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([operation, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(Object.assign(new Error("Booking operation timed out."), { code })), milliseconds);
    })]);
  } finally { clearTimeout(timer); }
}

/** Configuration is explicit: Android emulation never selects a backend or Auth environment. */
export function bookingScheduleEndpoint(base: string | undefined, emulator: boolean): string {
  const configurationError = () => Object.assign(new Error(
    "Schedule verification is unavailable. Contact support to configure the booking backend, then reopen this booking. This action has not been saved."
  ), { code: "booking/configuration" });
  if (!base?.trim()) throw configurationError();
  let url: URL;
  try { url = new URL(base); } catch { throw configurationError(); }
  const localHttp = emulator && url.protocol === "http:" &&
    ["127.0.0.1", "localhost", "10.0.2.2"].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash ||
    url.pathname !== "/" ||
    (url.protocol !== "https:" && !localHttp)) throw configurationError();
  return `${url.href.replace(/\/$/, "")}/v1/bookings/schedule`;
}

export async function callBookingSchedule(input: { action: "accept" | "propose" | "approve" | "review-legacy"; requestId: string;
  date?: string; time?: string; durationMinutes?: number; proposalRevision?: number }): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error("Sign in before changing a booking.");
  const endpoint = bookingScheduleEndpoint(process.env.EXPO_PUBLIC_BOOKING_API_URL, firebaseRuntimeTarget.emulator);
  const correlationId = `booking-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  const started = Date.now();
  let stage = "token", sent = false, definitiveRejection = false;
  const trace = (details: Partial<Trace> = {}) => {
    const event: Trace = { correlationId, stage, elapsedMs: Date.now() - started, origin: new URL(endpoint).origin, ...details };
    diagnostics.events.push(event);
    if (diagnostics.events.length > 60) diagnostics.events.shift();
    console.info("[booking-trace]", JSON.stringify(event));
  };
  const session = () => {
    if (auth.currentUser !== user) throw Object.assign(new Error("Account changed. Reopen the booking."), { code: "booking/session" });
  };
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    trace();
    const token = await bounded(user.getIdToken(), 10000, "booking/token-timeout");
    session();
    stage = "transport"; trace();
    timeout = setTimeout(() => controller.abort(), 20000);
    sent = true;
    const response = await fetch(endpoint, { method: "POST", signal: controller.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "X-Booking-Correlation-ID": correlationId }, body: JSON.stringify(input) });
    session();
    stage = "response";
    const contentType = response.headers?.get("content-type") ?? "unknown";
    trace({ status: response.status, contentType });
    stage = "parse";
    if (contentType !== "unknown" && !contentType.toLowerCase().includes("application/json")) throw new Error("Non-JSON booking response.");
    const saved = await response.json();
    session();
    if (!response.ok) {
      stage = "rejected";
      definitiveRejection = response.status >= 400 && response.status < 500;
      // Only our server's structured response is surfaced; never an HTML proxy page.
      const code = typeof saved?.code === "string" && /^[a-z/-]{1,64}$/.test(saved.code) ? saved.code : "unavailable";
      trace({ status: response.status, code });
      throw Object.assign(new Error(typeof saved?.message === "string" ? saved.message : "The schedule could not be confirmed. Retry the same action."), { code });
    }
    stage = "acknowledgement";
    if (saved?.requestId !== input.requestId) throw new Error("The backend did not confirm this booking.");
    trace({ status: response.status, code: "confirmed" });
  } catch (cause) {
    trace({ ...safeError(cause), aborted: controller.signal.aborted });
    session();
    if (definitiveRejection || !sent || (cause as { code?: string })?.code === "booking/session") throw cause;
    clearTimeout(timeout);
    // A transport/parse/ack failure can follow a committed transaction. Read the
    // authoritative document once; never perform a fallback write or auto-retry.
    if (input.action === "accept") {
      stage = "reconcile";
      try {
        const snapshot = await bounded(getDocFromServer(doc(db, "service_requests", input.requestId)), 8000, "booking/reconcile-timeout");
        session();
        const job = snapshot.data();
        const technician = job?.technicianId ?? job?.assignedTechnicianId;
        const identityConflict = job?.technicianId && job?.assignedTechnicianId && job.technicianId !== job.assignedTechnicianId;
        if (snapshot.exists() && technician === user.uid && !identityConflict && job?.status === "accepted" && job.schedulingVersion === 1) {
          trace({ code: "confirmed-from-server" });
          return;
        }
        trace({ code: "not-confirmed" });
      } catch (error) { trace(safeError(error)); session(); }
    }
    throw Object.assign(new Error("Unable to confirm the schedule online. Reconnect and retry the same action; do not assume it was saved."),
      { code: "booking/unknown-outcome", correlationId, cause });
  } finally { clearTimeout(timeout); }
}
