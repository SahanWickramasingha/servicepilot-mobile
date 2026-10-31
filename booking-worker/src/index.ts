import { createBookingSchedule } from '../../functions/src/domain/bookingSchedule';
import { TrustedRequestError } from '../../functions/src/domain/trustedRequestError';
import { accessToken, configuration, firebaseAuth, lookupAccount, type Env, UpstreamError } from './auth';
import { firestoreStore, values } from './firestore';

let readiness: { identity: string; until: number; pending: Promise<boolean> } | undefined;
function ready(env: Env): Promise<boolean> {
  configuration(env);
  const identity = env.BOOKING_SERVICE_ACCOUNT_EMAIL + env.BOOKING_SERVICE_ACCOUNT_PRIVATE_KEY;
  if (readiness?.identity === identity && readiness.until > Date.now()) return readiness.pending;
  const check = Promise.all([
    lookupAccount(env, '__servicepilot_booking_readiness_nonexistent__'),
    firestoreStore({ project: env.FIREBASE_PROJECT_ID, token: () => accessToken(env) }).ready(),
  ]).then(() => true, () => false);
  let timer: ReturnType<typeof setTimeout>;
  const pending = Promise.race([check, new Promise<boolean>((resolve) => { timer = setTimeout(() => resolve(false), 4000); })])
    .finally(() => clearTimeout(timer));
  readiness = { identity, until: Date.now() + 60_000, pending };
  return pending;
}
async function jsonBody(request: Request): Promise<unknown> {
  if (request.headers.get('Content-Type')?.split(';')[0] !== 'application/json') throw new TrustedRequestError(415, 'invalid-argument', 'A JSON request is required.');
  if (Number(request.headers.get('Content-Length')) > 4096) throw new TrustedRequestError(413, 'invalid-argument', 'Request body is too large.');
  const reader = request.body?.getReader();
  if (!reader) throw new TrustedRequestError(400, 'invalid-argument', 'A valid JSON request is required.');
  let timer: ReturnType<typeof setTimeout>;
  const read = async () => {
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > 4096) throw new TrustedRequestError(413, 'invalid-argument', 'Request body is too large.');
      chunks.push(part.value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    try { return JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes)); }
    catch { throw new TrustedRequestError(400, 'invalid-argument', 'A valid JSON request is required.'); }
  };
  try {
    return await Promise.race([read(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new TrustedRequestError(408, 'invalid-argument', 'Request body timed out.')), 3000); })]);
  } finally { clearTimeout(timer!); void reader.cancel().catch(() => {}); }
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const started = Date.now(), url = new URL(request.url), origin = request.headers.get('Origin');
    const supplied = request.headers.get('X-Booking-Correlation-ID') ?? '';
    const correlationId = /^booking-[a-zA-Z0-9-]{8,80}$/.test(supplied) ? supplied : `booking-${crypto.randomUUID()}`;
    const headers = new Headers({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff', Vary: 'Origin', 'X-Booking-Correlation-ID': correlationId });
    const trace = (stage: string, code?: unknown) => console.info('[booking-trace]', JSON.stringify({ correlationId, stage,
      code: typeof code === 'string' && /^[a-zA-Z0-9_/-]{1,80}$/.test(code) ? code : undefined, elapsedMs: Date.now() - started }));
    const reply = (status: number, body: unknown) => {
      if (url.pathname === '/v1/bookings/schedule') trace('response', `http-${status}`);
      return new Response(status === 204 ? null : JSON.stringify(body), { status, headers });
    };
    try {
      if (request.method === 'GET' && url.pathname === '/healthz') return reply(200, { status: 'ok' });
      if (request.method === 'GET' && url.pathname === '/readyz') {
        const available = await ready(env);
        return reply(available ? 200 : 503, { status: available ? 'ready' : 'unavailable' });
      }
      if (url.pathname !== '/v1/bookings/schedule' || !['POST', 'OPTIONS'].includes(request.method)) return reply(404, { code: 'not-found', message: 'Endpoint not found.' });
      if (origin && !(env.CORS_ALLOWED_ORIGINS ?? '').split(',').map((value) => value.trim()).filter(Boolean).includes(origin)) return reply(403, { code: 'permission-denied', message: 'This origin is not allowed.' });
      if (origin) headers.set('Access-Control-Allow-Origin', origin);
      headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Booking-Correlation-ID');
      headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
      if (request.method === 'OPTIONS') return reply(204, null);
      trace('received');
      const body = await jsonBody(request);
      // Match the Node boundary: a missing token remains 401 even while secrets
      // are not yet installed. Health remains liveness; readiness fails closed.
      if (!/^Bearer [^\s]+$/.test(request.headers.get('Authorization') ?? '')) throw new TrustedRequestError(401, 'unauthenticated', 'Sign in again before changing this schedule.');
      configuration(env);
      const service = createBookingSchedule({ auth: firebaseAuth(env),
        db: firestoreStore({ project: env.FIREBASE_PROJECT_ID, token: () => accessToken(env), deadline: Date.now() + 16_000 }), values });
      return reply(200, await service.change(request.headers.get('Authorization') ?? undefined, body, trace));
    } catch (error) {
      const code = error instanceof TrustedRequestError || error instanceof UpstreamError ? error.code : 'unavailable';
      trace('failed', code);
      if (url.pathname === '/readyz') return reply(503, { status: 'unavailable' });
      if (error instanceof TrustedRequestError) return reply(error.status, { code: error.code, message: error.message });
      return reply(503, { code: 'unavailable', message: 'The backend is unavailable. Retry the same request shortly.' });
    }
  },
};
