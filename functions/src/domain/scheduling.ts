/** Approved policy: explicit whole minutes, capacity one, [start,end), no buffer. */
export const BOOKING_TIME_ZONE = "Asia/Colombo";
export function colomboStart(date: string, time: string): number {
  const match = /^(\d{2}):(\d{2}) (AM|PM)$/.exec(time);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !match) throw new Error("Choose a valid Colombo date and time.");
  const hour = Number(match[1]), minute = Number(match[2]);
  if (hour < 1 || hour > 12 || minute > 59) throw new Error("Choose a valid Colombo time.");
  const hours = hour % 12 + (match[3] === "PM" ? 12 : 0);
  const local = `${date}T${String(hours).padStart(2, "0")}:${match[2]}:00`;
  const start = Date.parse(`${local}+05:30`);
  if (!Number.isFinite(start) || new Date(start + 330 * 60000).toISOString().slice(0, 16) !== local.slice(0, 16)) throw new Error("Choose a valid calendar date.");
  return start;
}
export function bookingInterval(date: string, time: string, durationMinutes: number) {
  if (!Number.isSafeInteger(durationMinutes) || durationMinutes <= 0) throw new Error("Enter an explicit positive duration in whole minutes.");
  const start = colomboStart(date, time), end = start + durationMinutes * 60000;
  if (!Number.isSafeInteger(end) || !Number.isFinite(new Date(end).getTime()) || end > 253402300799999) throw new Error("The service end time is outside the supported date range.");
  return { start, end };
}
export function intervalsOverlap(a: { start: number; end: number }, b: { start: number; end: number }) {
  return a.start < b.end && b.start < a.end;
}
