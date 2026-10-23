import { auth, firebaseRuntimeTarget } from "@/src/firebase/config";

export async function callBookingSchedule(input: { action: "accept" | "propose" | "approve" | "review-legacy"; requestId: string;
  date?: string; time?: string; durationMinutes?: number; proposalRevision?: number }): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error("Sign in before changing a booking.");
  const base = process.env.EXPO_PUBLIC_BOOKING_API_URL;
  if (!base) throw new Error("Booking schedule verification is not configured. Contact support; this booking has not been accepted.");
  const url = new URL(base);
  if (url.username || url.password || url.search || url.hash ||
    (url.protocol !== "https:" && !(firebaseRuntimeTarget.emulator && ["127.0.0.1", "localhost", "10.0.2.2"].includes(url.hostname)))) throw new Error("A trusted HTTPS booking backend is required.");
  const token = await user.getIdToken();
  if (auth.currentUser !== user) throw new Error("Account changed. Reopen the booking.");
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(`${base.replace(/\/$/, "")}/v1/bookings/schedule`, { method: "POST", signal: controller.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(input) });
    if (auth.currentUser !== user) throw new Error("Account changed. Reopen the booking.");
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw Object.assign(new Error(typeof body.message === "string" ? body.message : "The schedule could not be confirmed. Retry the same action."), { code: body.code ?? "unavailable" });
    }
    const saved = await response.json();
    if (saved?.requestId !== input.requestId) throw new Error("The backend did not confirm this booking.");
  } catch (cause) {
    if (cause instanceof Error && "code" in cause) throw cause;
    throw new Error("Unable to confirm the schedule online. Reconnect and retry the same action; do not assume it was saved.");
  } finally { clearTimeout(timeout); }
}
