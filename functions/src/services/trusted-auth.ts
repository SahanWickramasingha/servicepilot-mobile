import type { Auth } from "firebase-admin/auth";
import type { Firestore } from "firebase-admin/firestore";

import { TrustedRequestError } from '../domain/trustedRequestError';
export { TrustedRequestError } from '../domain/trustedRequestError';

export function createSuperAdminAuthorizer(auth: Auth, db: Firestore) {
  return async (authorization: string | undefined) => {
    const token = /^Bearer ([^\s]+)$/.exec(authorization ?? "")?.[1];
    if (!token) throw new TrustedRequestError(401, "unauthenticated", "Please sign in as Super Admin again.");
    let decoded;
    try {
      decoded = await auth.verifyIdToken(token, true);
    } catch {
      throw new TrustedRequestError(401, "unauthenticated", "Your session is invalid or expired. Please sign in again.");
    }
    const caller = (await db.doc(`users/${decoded.uid}`).get()).data();
    if (caller?.role !== "super_admin" || caller.accountStatus !== "active" || caller.lifecyclePending === true) {
      throw new TrustedRequestError(403, "permission-denied", "Only an active Super Admin can perform this action.");
    }
    if (caller.sessionRevokedAt !== undefined && !(decoded.auth_time > caller.sessionRevokedAt)) {
      throw new TrustedRequestError(401, "unauthenticated", "Please sign in again to start a new session.");
    }
    return decoded.uid;
  };
}
