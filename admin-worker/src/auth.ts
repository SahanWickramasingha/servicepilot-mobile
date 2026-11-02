import { createRemoteJWKSet, customFetch, jwksCache, importPKCS8, jwtVerify, SignJWT, type JWTVerifyGetKey } from 'jose';
import { ProviderError, type Env } from './runtime';

export const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
let cache: { email: string; key: string; value: string; until: number } | undefined;
const publicKeysCache = {};

export function serviceToken(env: Env, transport: typeof fetch) {
  return async () => {
    if (cache?.email === env.ADMIN_SERVICE_ACCOUNT_EMAIL && cache.key === env.ADMIN_SERVICE_ACCOUNT_PRIVATE_KEY && cache.until > Date.now()) return cache.value;
    const key = await importPKCS8(env.ADMIN_SERVICE_ACCOUNT_PRIVATE_KEY.replace(/\\n/g, '\n'), 'RS256');
    const assertion = await new SignJWT({ scope: 'https://www.googleapis.com/auth/identitytoolkit https://www.googleapis.com/auth/datastore' })
      .setProtectedHeader({ alg: 'RS256' }).setIssuer(env.ADMIN_SERVICE_ACCOUNT_EMAIL)
      .setAudience('https://oauth2.googleapis.com/token').setIssuedAt().setExpirationTime('1h').sign(key);
    const response = await transport('https://oauth2.googleapis.com/token', { method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }) });
    const data = await response.json() as { access_token?: string; expires_in?: number };
    if (!response.ok || typeof data.access_token !== 'string' || !data.access_token || !Number.isFinite(data.expires_in) || data.expires_in! < 120) throw new ProviderError();
    cache = { email: env.ADMIN_SERVICE_ACCOUNT_EMAIL, key: env.ADMIN_SERVICE_ACCOUNT_PRIVATE_KEY,
      value: data.access_token, until: Date.now() + Math.min(3300, data.expires_in! - 60) * 1000 };
    return cache.value;
  };
}

export async function verifyToken(token: string, project: string, keySet: JWTVerifyGetKey) {
  const { payload, protectedHeader } = await jwtVerify(token, keySet, { algorithms: ['RS256'],
    audience: project, issuer: `https://securetoken.google.com/${project}`, requiredClaims: ['sub', 'exp', 'iat', 'auth_time'] });
  if (payload.aud !== project || typeof protectedHeader.kid !== 'string' || !protectedHeader.kid ||
    !payload.sub || payload.sub.length > 128 || payload.sub.includes('/') || ['.', '..'].includes(payload.sub) ||
    !Number.isInteger(payload.iat) || payload.iat! <= 0 || payload.iat! > Date.now() / 1000 ||
    !Number.isInteger(payload.auth_time) || Number(payload.auth_time) <= 0 || Number(payload.auth_time) > payload.iat!) throw new ProviderError('auth/invalid-id-token');
  return { uid: payload.sub, auth_time: Number(payload.auth_time) };
}

type Account = { localId: string; email?: string; disabled?: boolean; validSince?: string };
export function firebaseAuth(project: string, token: () => Promise<string>, transport: typeof fetch, keySet?: JWTVerifyGetKey) {
  const keys = keySet ?? createRemoteJWKSet(new URL(JWKS_URL), { timeoutDuration: 5000, cacheMaxAge: 300_000, [customFetch]: transport, [jwksCache]: publicKeysCache });
  async function call(action: string, body: Record<string, unknown>) {
    const response = await transport(`https://identitytoolkit.googleapis.com/v1/projects/${project}/accounts${action ? ':' + action : ''}`, {
      method: 'POST', headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await response.json() as { users?: Account[]; localId?: string; oobLink?: string; error?: { message?: string } };
    if (!response.ok) {
      // Only these definite creation failures permit the core's safe rollback.
      // Unknown/transport failures retain the reservation for trusted recovery.
      const codes: Record<string, string> = { EMAIL_EXISTS: 'auth/email-already-exists', DUPLICATE_LOCAL_ID: 'auth/uid-already-exists',
        INVALID_EMAIL: 'auth/invalid-email', INVALID_PASSWORD: 'auth/invalid-password', USER_NOT_FOUND: 'auth/user-not-found' };
      throw new ProviderError(codes[data.error?.message ?? ''] ?? 'admin/auth-unavailable');
    }
    return data;
  }
  async function getUser(uid: string) {
    const data = await call('lookup', { localId: [uid] });
    const user = data.users?.find(u => u.localId === uid);
    if (!user) throw new ProviderError('auth/user-not-found');
    return { uid, email: user.email, disabled: user.disabled === true, validSince: user.validSince };
  }
  return {
    async verifyIdToken(value: string, checkRevoked: boolean) {
      if (checkRevoked !== true) throw new ProviderError('auth/revocation-required');
      const decoded = await verifyToken(value, project, keys);
      const user = await getUser(decoded.uid);
      const validSince = Number(user.validSince ?? '0');
      if (user.disabled || !Number.isFinite(validSince) || validSince < 0 || decoded.auth_time < validSince) throw new ProviderError('auth/id-token-revoked');
      return decoded;
    },
    getUser,
    async createUser(input: { uid: string; email: string; displayName: string; password: string; emailVerified: boolean; disabled: boolean }) {
      const data = await call('', { localId: input.uid, email: input.email, displayName: input.displayName,
        password: input.password, emailVerified: input.emailVerified, disabled: input.disabled });
      if (data.localId !== input.uid) throw new ProviderError('admin/auth-create-unknown');
    },
    async deleteUser(uid: string) { await call('delete', { localId: uid }); },
    async updateUser(uid: string, patch: { disabled: boolean }) { await call('update', { localId: uid, disableUser: patch.disabled }); },
    async revokeRefreshTokens(uid: string) {
      // Matches Admin SDK: update validSince using server wall-clock seconds.
      await call('update', { localId: uid, validSince: String(Math.floor(Date.now() / 1000)) });
    },
    async generatePasswordResetLink(email: string, options: { url: string; handleCodeInApp: boolean }) {
      const data = await call('sendOobCode', { requestType: 'PASSWORD_RESET', email, continueUrl: options.url,
        canHandleCodeInApp: false, returnOobLink: true });
      if (typeof data.oobLink !== 'string' || new URL(data.oobLink).protocol !== 'https:') throw new ProviderError();
      return data.oobLink;
    },
  };
}
