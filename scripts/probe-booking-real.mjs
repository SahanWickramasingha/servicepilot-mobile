// No bearer tokens, customer IDs, booking actions or Firebase data writes.
import { validateBookingHttps } from './lib/booking-real-config.mjs';

try {
  const configured = process.env.EXPO_PUBLIC_BOOKING_API_URL;
  const base = configured ? validateBookingHttps(configured) : 'http://127.0.0.1:8790';
  for (const [path, expected] of [['/v1/bookings/schedule', 401], ['/v1/dispatchers', 404],
    ['/v1/dispatchers/resend-invitation', 404], ['/v1/accounts/lifecycle', 404]]) {
    const response = await fetch(base + path, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
      headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const body = await response.json();
    if (response.status !== expected || body.code !== (expected === 401 ? 'unauthenticated' : 'not-found')) {
      throw Error('Unexpected server profile or authentication boundary.');
    }
    console.log(`${path}: expected HTTP ${expected}`);
  }
  console.log('Booking-only HTTP boundary verified without credentials or booking writes. This does not verify IAM or authenticated acceptance.');
} catch {
  console.error('Booking probe failed: check server mode, port 8790, HTTPS trust/tunnel reachability and booking-only routes. No authenticated booking was submitted.');
  process.exitCode = 1;
}
