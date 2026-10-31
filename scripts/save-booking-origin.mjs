// Persist only the public booking origin. Preserve every other env line.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { validateBookingHttps } from './lib/booking-real-config.mjs';
const origin = validateBookingHttps(process.env.EXPO_PUBLIC_BOOKING_API_URL);
const path = '.env.local';
const original = existsSync(path) ? readFileSync(path, 'utf8') : '';
const newline = original.includes('\r\n') ? '\r\n' : '\n';
const pattern = /^[\t ]*EXPO_PUBLIC_BOOKING_API_URL[\t ]*=[^\r\n]*/gm;
const matches = [...original.matchAll(pattern)];
if (matches.length > 1) throw Error('Duplicate booking env lines; resolve them explicitly before starting.');
const updated = matches.length ? original.replace(pattern, `EXPO_PUBLIC_BOOKING_API_URL=${origin}`) :
  original + (original && !original.endsWith('\n') ? newline : '') + `EXPO_PUBLIC_BOOKING_API_URL=${origin}${newline}`;
writeFileSync(path, updated);
console.log('Verified booking origin saved; all other env settings preserved.');
