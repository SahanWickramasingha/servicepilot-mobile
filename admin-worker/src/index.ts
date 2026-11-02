import { TrustedRequestError } from '../../functions/src/domain/trustedRequestError';
import { configuration, type Env } from './runtime';
import { services } from './services';

type Services = ReturnType<typeof services>;
const paths = new Set(['/v1/dispatchers', '/v1/dispatchers/resend-invitation', '/v1/accounts/lifecycle']);
export async function handleRequest(request: Request, env: Env, createServices: (env: Env) => Services = services): Promise<Response> {
  const origin = request.headers.get('Origin');
  const headers = new Headers({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', 'Vary': 'Origin' });
  const reply = (status: number, data: unknown) => new Response(JSON.stringify(data), { status, headers });
  try {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/healthz') return reply(200, { status: 'ok' });
    if (request.method === 'GET' && url.pathname === '/readyz') {
      configuration(env);
      // Configuration readiness only; no unsolicited Auth/Firestore/mail traffic.
      return reply(200, { status: 'configured', dependencies: 'not-probed' });
    }
    if (!paths.has(url.pathname) || url.search) return reply(404, { code: 'not-found' });
    if (origin && origin !== env.ADMIN_WEB_ORIGIN) return reply(403, { code: 'permission-denied' });
    if (origin && origin === env.ADMIN_WEB_ORIGIN) headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return reply(404, { code: 'not-found' });
    const authorization = request.headers.get('Authorization') ?? '';
    if (!/^Bearer [A-Za-z0-9_.-]+$/.test(authorization) || authorization.length > 8192) return reply(401, { code: 'unauthenticated' });
    if (request.headers.get('Content-Type')?.split(';')[0] !== 'application/json') return reply(415, { code: 'invalid-argument' });
    const reader = request.body?.getReader();
    if (!reader) return reply(400, { code: 'invalid-argument' });
    let size = 0;
    const chunks: Uint8Array[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 4096) { await reader.cancel(); return reply(413, { code: 'invalid-argument' }); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    let body: unknown;
    try { body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
    catch { return reply(400, { code: 'invalid-argument' }); }
    configuration(env);
    const { provisioning, lifecycle } = createServices(env);
    const result = url.pathname === '/v1/dispatchers' ? await provisioning.create(authorization, body) :
      url.pathname === '/v1/dispatchers/resend-invitation' ? await provisioning.resend(authorization, body) : await lifecycle.change(authorization, body);
    return reply(200, result);
  } catch (error) {
    if (error instanceof TrustedRequestError) return reply(error.status, { code: error.code, message: error.message });
    // Raw provider exceptions may contain credentials or email action links.
    return reply(503, { code: 'unavailable', message: 'The backend outcome is unconfirmed. Retry the same request.' });
  }
}

export default { fetch: (request: Request, env: Env) => handleRequest(request, env) };
