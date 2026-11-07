export interface Env {
  FIREBASE_PROJECT_ID: string;
  ADMIN_WEB_ORIGIN: string;
  ADMIN_EMAIL_FROM?: string;
  ADMIN_EMAIL_PROVIDER: string;
  TECHNICIAN_EMAIL_PROVIDER?: string;
  GMAIL_CLIENT_ID?: string;
  GMAIL_CLIENT_SECRET?: string;
  GMAIL_REFRESH_TOKEN?: string;
  ADMIN_SERVICE_ACCOUNT_EMAIL: string;
  ADMIN_SERVICE_ACCOUNT_PRIVATE_KEY: string;
  RESEND_API_KEY?: string;
  FIREBASE_WEB_API_KEY?: string;
}

// Never attach upstream bodies, request headers, tokens or provider error text.
export class ProviderError extends Error {
  constructor(readonly code = 'admin/provider-unavailable') { super(code); }
}

export function configuration(env: Env) {
  let origin: URL;
  try { origin = new URL(env.ADMIN_WEB_ORIGIN); } catch { throw new ProviderError('admin/configuration'); }
  if (env.FIREBASE_PROJECT_ID !== 'servicepilot-756d9' || origin.origin !== env.ADMIN_WEB_ORIGIN ||
    origin.protocol !== 'https:' || origin.username || origin.password ||
    !/^servicepilot-admin(?:-[a-z0-9]+)*@servicepilot-756d9\.iam\.gserviceaccount\.com$/.test(env.ADMIN_SERVICE_ACCOUNT_EMAIL ?? '') ||
    !(env.ADMIN_SERVICE_ACCOUNT_PRIVATE_KEY ?? '').replace(/\\n/g, '\n').includes(['-----BEGIN', 'PRIVATE KEY-----'].join(' ')) ||
    !['firebase', 'resend'].includes(env.ADMIN_EMAIL_PROVIDER) ||
    (env.ADMIN_EMAIL_PROVIDER === 'firebase' && !/^[A-Za-z0-9_-]{20,200}$/.test(env.FIREBASE_WEB_API_KEY ?? '')) ||
    (env.ADMIN_EMAIL_PROVIDER === 'resend' && (!env.RESEND_API_KEY ||
      !/^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(env.ADMIN_EMAIL_FROM ?? '')))) {
    throw new ProviderError('admin/configuration');
  }
}

// Shared per-request budget includes OAuth, JWKS, Auth, Firestore, and mail.
// Reserve some Free-plan subrequests for transaction cleanup and ambiguity reads.
export function requestFetch(transport: typeof fetch = fetch, deadline = Date.now() + 24_000): typeof fetch {
  let calls = 0;
  return async (input, init = {}) => {
    if (++calls > 45 || Date.now() >= deadline) throw new ProviderError('admin/request-budget');
    // workerd does not implement redirect:'error'. Manual mode plus an explicit
    // rejection prevents credentials being forwarded to a redirected host.
    const response = await transport(input, { ...init, redirect: 'manual',
      signal: AbortSignal.timeout(Math.max(1, Math.min(5000, deadline - Date.now()))) });
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel();
      throw new ProviderError('admin/upstream-redirect');
    }
    return response;
  };
}
