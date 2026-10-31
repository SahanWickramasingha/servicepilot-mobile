import { createRemoteJWKSet, importPKCS8, jwtVerify, SignJWT } from 'jose';
import type { BookingAuth } from '../../functions/src/domain/bookingSchedule';

export interface Env {
  FIREBASE_PROJECT_ID: string;
  BOOKING_SERVICE_ACCOUNT_EMAIL: string;
  BOOKING_SERVICE_ACCOUNT_PRIVATE_KEY: string;
  CORS_ALLOWED_ORIGINS?: string;
}
export class UpstreamError extends Error {
  constructor(public readonly code: string) { super(code); }
}
export function configuration(env: Env) {
  if (env.FIREBASE_PROJECT_ID !== 'servicepilot-756d9' ||
    !/^servicepilot-booking(?:-[a-z0-9]+)*@servicepilot-756d9\.iam\.gserviceaccount\.com$/.test(env.BOOKING_SERVICE_ACCOUNT_EMAIL ?? '') ||
    !(env.BOOKING_SERVICE_ACCOUNT_PRIVATE_KEY ?? '').replace(/\\n/g, '\n').includes(['-----BEGIN', 'PRIVATE KEY-----'].join(' '))) {
    throw new UpstreamError('booking/configuration');
  }
}
const keys = createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'), {
  timeoutDuration: 5000, cacheMaxAge: 300_000, cooldownDuration: 30_000,
});
let cached: { email: string; key: string; token: string; until: number; pending?: never } | undefined;
// Token caching is not a scheduling lock. Each Firestore transaction retains
// its own server-side transaction token and authoritative lock-document write.
export async function accessToken(env: Env): Promise<string> {
  configuration(env);
  if (cached?.email === env.BOOKING_SERVICE_ACCOUNT_EMAIL && cached.key === env.BOOKING_SERVICE_ACCOUNT_PRIVATE_KEY && cached.until > Date.now()) return cached.token;
  const key = await importPKCS8(env.BOOKING_SERVICE_ACCOUNT_PRIVATE_KEY.replace(/\\n/g, '\n'), 'RS256');
  const assertion = await new SignJWT({ scope: 'https://www.googleapis.com/auth/cloud-platform' })
    .setProtectedHeader({ alg: 'RS256' }).setIssuer(env.BOOKING_SERVICE_ACCOUNT_EMAIL)
    .setAudience('https://oauth2.googleapis.com/token').setIssuedAt().setExpirationTime('1h').sign(key);
  const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }), signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new UpstreamError('booking/oauth');
  const result = await response.json() as { access_token?: string; expires_in?: number };
  if (!result.access_token || !Number.isFinite(result.expires_in) || result.expires_in! <= 60) throw new UpstreamError('booking/oauth');
  cached = { email: env.BOOKING_SERVICE_ACCOUNT_EMAIL, key: env.BOOKING_SERVICE_ACCOUNT_PRIVATE_KEY,
    token: result.access_token, until: Date.now() + Math.min(3300, result.expires_in! - 60) * 1000 };
  return cached.token;
}
export async function lookupAccount(env: Env, uid: string) {
  const response = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup', { method: 'POST',
    headers: { Authorization: `Bearer ${await accessToken(env)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetProjectId: env.FIREBASE_PROJECT_ID, localId: [uid] }), signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new UpstreamError(response.status === 403 ? 'booking/auth-iam' : 'booking/auth-upstream');
  const result = await response.json() as { users?: { localId: string; disabled?: boolean; validSince?: string }[] };
  return result.users?.find((user) => user.localId === uid);
}
export function firebaseAuth(env: Env): BookingAuth {
  return { async verifyIdToken(token) {
    const { payload, protectedHeader } = await jwtVerify(token, keys, { algorithms: ['RS256'], audience: env.FIREBASE_PROJECT_ID,
      issuer: `https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}`, requiredClaims: ['sub', 'exp', 'iat', 'auth_time'] });
    const now = Date.now() / 1000;
    if (payload.aud !== env.FIREBASE_PROJECT_ID || typeof protectedHeader.kid !== 'string' || !protectedHeader.kid ||
      !payload.sub || payload.sub.length > 128 || payload.sub.includes('/') || payload.sub === '.' || payload.sub === '..' ||
      !Number.isInteger(payload.iat) || payload.iat! <= 0 || payload.iat! > now ||
      !Number.isInteger(payload.auth_time) || Number(payload.auth_time) <= 0 || Number(payload.auth_time) > payload.iat!) throw new UpstreamError('auth/invalid-token');
    // Equivalent to Admin verifyIdToken(token, true): current Auth record,
    // disabled/deleted-account rejection, and auth_time revocation boundary.
    const user = await lookupAccount(env, payload.sub);
    if (!user || user.disabled || !Number.isFinite(Number(user.validSince ?? '0')) ||
      Number(payload.auth_time) < Number(user.validSince ?? '0')) throw new UpstreamError('auth/revoked-token');
    return { uid: payload.sub, auth_time: Number(payload.auth_time), email_verified: payload.email_verified === true };
  } };
}
