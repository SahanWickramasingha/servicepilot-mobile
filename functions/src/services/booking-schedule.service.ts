import type { Auth } from 'firebase-admin/auth';
import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { createBookingSchedule, type BookingAuth, type BookingStore } from '../domain/bookingSchedule';
/** Node adapter; the Worker runs this same engine with REST transactions. */
export function createBookingScheduleService({ auth, db, now = Date.now }: { auth: Auth; db: Firestore; now?: () => number }) {
  return createBookingSchedule({ auth: auth as BookingAuth, db: db as unknown as BookingStore, now,
    values: { serverTimestamp: () => FieldValue.serverTimestamp(), deleteField: () => FieldValue.delete(), timestamp: (ms) => Timestamp.fromMillis(ms) } });
}
