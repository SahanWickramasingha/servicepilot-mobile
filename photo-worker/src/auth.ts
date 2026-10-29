import { createRemoteJWKSet, importPKCS8, jwtVerify, SignJWT, type JWTVerifyGetKey } from "jose";
import { check, PhotoError, type Env, type Identity } from "./types";

export const FIREBASE_JWKS = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
const keys = createRemoteJWKSet(new URL(FIREBASE_JWKS), { cacheMaxAge: 3600_000, cooldownDuration: 30_000, timeoutDuration: 5000 });
/** Test injection supplies cryptographic test keys, never an environment switch
 * that accepts unsigned Firebase Auth Emulator tokens in a deployed Worker. */
export async function verifyFirebaseToken(token: string, project: string, keySet: JWTVerifyGetKey = keys): Promise<Omit<Identity, "token">> {
  try {
    const { payload } = await jwtVerify(token, keySet, { algorithms: ["RS256"],
      issuer: `https://securetoken.google.com/${project}`, audience: project, requiredClaims: ["sub", "exp", "iat", "auth_time"] });
    const now = Date.now() / 1000;
    check(typeof payload.sub === "string" && payload.sub.length > 0 && payload.sub.length <= 128 && !payload.sub.includes("/") && payload.sub !== "." && payload.sub !== "..", 401, "invalid-session");
    check(Number.isInteger(payload.iat) && payload.iat! > 0 && payload.iat! <= now + 5 &&
      typeof payload.auth_time === "number" && Number.isInteger(payload.auth_time) && payload.auth_time > 0 && payload.auth_time <= payload.iat!, 401, "invalid-session");
    return { uid: payload.sub, authTime: payload.auth_time, verified: payload.email_verified === true };
  } catch (cause) {
    if (cause instanceof PhotoError) throw cause;
    const code = (cause as { code?: string }).code;
    if (["ERR_JWT_EXPIRED", "ERR_JWT_CLAIM_VALIDATION_FAILED", "ERR_JWT_INVALID", "ERR_JWS_INVALID", "ERR_JWS_SIGNATURE_VERIFICATION_FAILED", "ERR_JOSE_ALG_NOT_ALLOWED", "ERR_JWKS_NO_MATCHING_KEY"].includes(code ?? "")) throw new PhotoError(401, "invalid-session");
    throw new PhotoError(503, "temporarily-unavailable");
  }
}
export async function authenticate(request: Request, env: Env): Promise<Identity> {
  const header = request.headers.get("Authorization") ?? "";
  check(/^Bearer [A-Za-z0-9_.-]+$/.test(header) && header.length < 8192, 401, "invalid-session");
  const token = header.slice(7), identity = await verifyFirebaseToken(token, env.FIREBASE_PROJECT_ID);
  // Verification alone does not detect Auth-console disable/delete/revocation.
  // Caller-token account lookup verifies current Auth state without Admin SDK.
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(env.FIREBASE_WEB_API_KEY)}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken: token }), signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) {
    const failure = await response.json().catch(() => ({})) as { error?: { message?: string } };
    const invalid = ["INVALID_ID_TOKEN", "TOKEN_EXPIRED", "USER_DISABLED", "USER_NOT_FOUND", "CREDENTIAL_TOO_OLD_LOGIN_AGAIN"].includes(failure.error?.message ?? "");
    throw new PhotoError(invalid ? 401 : 503, invalid ? "invalid-session" : "temporarily-unavailable");
  }
  const body = await response.json() as { users?: { localId: string; disabled?: boolean; validSince?: string; emailVerified?: boolean }[] };
  const user = body.users?.[0];
  check(user && user.localId === identity.uid && user.disabled !== true && Number.isFinite(Number(user.validSince)) &&
    identity.authTime >= Number(user.validSince), 401, "invalid-session");
  return { ...identity, verified: identity.verified && user.emailVerified === true, token };
}

let cached: { email: string; key: string; token: string; until: number } | undefined;
export async function serviceAccessToken(env: Env): Promise<string> {
  if (cached?.email === env.FIREBASE_SERVICE_ACCOUNT_EMAIL && cached.key === env.FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY && cached.until > Date.now()) return cached.token;
  check(env.FIREBASE_SERVICE_ACCOUNT_EMAIL && env.FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY, 503, "temporarily-unavailable");
  const key = await importPKCS8(env.FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY.replace(/\\n/g, "\n"), "RS256");
  const assertion = await new SignJWT({ scope: "https://www.googleapis.com/auth/datastore" })
    .setProtectedHeader({ alg: "RS256" }).setIssuer(env.FIREBASE_SERVICE_ACCOUNT_EMAIL)
    .setAudience("https://oauth2.googleapis.com/token").setIssuedAt().setExpirationTime("1h").sign(key);
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }), signal: AbortSignal.timeout(5000) });
  check(response.ok, 503, "temporarily-unavailable");
  const data = await response.json() as { access_token?: string; expires_in: number };
  check(data.access_token && Number.isFinite(data.expires_in), 503, "temporarily-unavailable");
  cached = { email: env.FIREBASE_SERVICE_ACCOUNT_EMAIL, key: env.FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY,
    token: data.access_token, until: Date.now() + Math.min(3300, data.expires_in - 60) * 1000 };
  return cached.token;
}
