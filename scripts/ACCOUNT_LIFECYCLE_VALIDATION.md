# Account lifecycle implementation and validation

This handoff describes the lifecycle change. Earlier Change Password, Remember
Me, Dispatcher provisioning, map/service-area, review and notification work was
preserved. No production writes, deployments, billing changes, commits or pushes
were performed. Root `AGENTS.md` and the relevant Super Admin/Dispatcher guidance
were reviewed; there are no nested `AGENTS.md` files in this checkout.

## Confirmed cause and final behavior

The old browser `accountLifecycleService.ts` wrote account status, a map
projection and a lifecycle audit using the client Firestore SDK. It did not
disable/enable Firebase Auth or revoke refresh tokens. Session guards fetched a
profile at sign-in rather than observing administrative changes. Several rules
allowed owner/participant operations without checking current account status.
The existing Delete policy was soft deletion; that policy remains in place.

The existing standalone Node 22 provisioning backend now also serves
`POST /v1/accounts/lifecycle`. It uses the same extracted authorizer as Dispatcher
provisioning: `verifyIdToken(token, true)`, caller UID from the verified token,
and an authoritative profile requiring exactly `super_admin` and `active`.
Revoked sign-in sessions and pending lifecycle operations are denied as well.
Only `{targetUid, action, requestId}` is accepted; forged actor/role/status fields
are rejected. The server reads the target role/status, protects all Super Admin
accounts and self-targeting, and supports Customer, Technician and Dispatcher.

| Action | Firestore gate and Auth behavior |
| --- | --- |
| Disable | Commit `disabled`, pending operation, session cutoff, map revocation and pending audit first. Disable Auth, revoke refresh tokens, then complete the receipt/audit. |
| Enable | Keep access gated while enabling Auth and revoking old sessions. Commit `active` only when Auth operations have completed. Keep approval and verification unchanged. Require a new sign-in; never restore sharing. |
| Delete | Commit `deleted`, disable Auth, revoke sessions and map access. Retain Auth identity, profile, bookings, reviews and audits. Ordinary Enable/Disable cannot reactivate it. |

Technician revocation sets public eligibility false and availability offline and
replaces both precise/private and approximate/public coordinate documents with
sharing-off records containing no coordinates. Enable rebuilds the safe display
projection from the authoritative profile; pending/rejected approval stays
unapproved. Both location records remain off. No private profile/address data is
copied into public map records.

## Reliability and session enforcement

Firestore and Firebase Auth are separate systems, not one transaction. A durable
per-target lock serializes actions; hashed per-actor request receipts make retries
safe. The UI prevents immediate duplicate clicks and retains request IDs after
uncertain network responses. A pending action exposes a Retry action. Different
actions cannot overtake an incomplete one. A new request for the same failed
action can resume it after a browser reload; the audit preserves the initiating
actor and records the latest verified retry actor.
Replays superseded by a newer operation are rejected; even a previously completed
Enable request cannot claim success for a now-deleted account.

Initial transaction failure makes no Auth changes. Later failures leave
`lifecyclePending=true` and access blocked; successful recovery finishes the same
audit. A lost final commit response is checked against the completed receipt.
Missing Auth identities can safely finish Disable/Delete; Enable cannot recreate
an identity. Repeated status-only legacy Disable/Delete operations reconcile Auth
without deleting anything. No bulk reconciliation/migration was executed.

A process crash may leave a durable `running` lock. It is never automatically
stolen: a paused worker could otherwise resume an Auth mutation after a newer
operation. Requests first return in-progress, then recovery-required after two
minutes. A trusted operator must stop/drain ALL workers that could own that
operation, inspect its exact target/action, profile, Auth state, receipt and audit,
and only then mark that lock retryable and retry the SAME action through the
authenticated API. Do not set a profile active to bypass recovery. No automated
production recovery write is included or was run.

Protected Firestore reads/writes now require an active, non-pending profile.
`sessionRevokedAt` is a server-controlled cutoff in epoch seconds. The token's
original `auth_time` must be strictly newer, so refreshing an old token or enabling
an account cannot restore its former session. Same-second new sign-ins can be
rejected; wait at least one second after completion and sign in again. Legacy
profiles without a cutoff continue to work.

An owner can still read their OWN private profile to learn the denial reason;
this is the narrow exception, with no lifecycle writes or other protected data
access. Registration remains available through the existing constrained rules.
Browser lifecycle/audit grants were removed. Server lock/receipt collections deny
all browser access. Existing optional callable map/email endpoints also check
status, pending state and the session cutoff.

Mobile and web observe their own profile and close access on administrative
changes. Callbacks are discarded on account changes/unmount and superseded token
reads. Mobile startup also checks the cutoff before routing. Normal logout still
waits for location revocation before sign-out. Confirmed administrative revocation
stops local GPS first and signs out without waiting for a now-forbidden remote
cleanup write; the backend has already removed both shared coordinate records.
Listener/token errors block access with a retry message rather than silently
turning an offline mobile session into a successful account check.

An offline client cannot learn a new administrative status until reconnection;
already cached data cannot be remotely erased. Online server operations are
subject to the new rules. No background GPS restart, password persistence,
credential/token logging or dependency was introduced.

## Automated checks

Commands below use disposable demo projects and refuse non-loopback emulator
endpoints. Dependencies are already installed. Java 21+ and Firebase CLI are
required (Java 24 and the installed Firebase CLI were used here). Keep CLI debug
logging off; do not print the shell environment or tokens.

```powershell
npm --prefix functions run build
npm --prefix admin-web run build
node --test scripts/tests/account-session.test.mjs scripts/tests/auth-persistence.test.mjs scripts/tests/change-password.test.mjs scripts/tests/foreground-sharing.test.mjs
$env:DEBUG = ''
$env:JAVA_TOOL_OPTIONS = '-Xmx512m -Djava.net.preferIPv4Stack=true'
$env:CI = '1'
firebase emulators:exec --project demo-servicepilot-dispatcher --config firebase.dispatcher-test.json --only 'auth,firestore' 'node --test scripts/tests/account-lifecycle.test.mjs scripts/tests/dispatcher-provisioning.test.mjs'
```

After those emulators have stopped, run the existing access regressions:

```powershell
firebase emulators:exec --project demo-servicepilot-review-author --config firebase.review-author-test.json --only 'auth,firestore' 'node --test scripts/tests/map-location.test.mjs scripts/tests/map-admin.test.mjs scripts/tests/reviewer-names.test.mjs'
```

All emulator configs use Auth 9197 / Firestore 8187, so run them sequentially.
If the CLI leaves its Java child behind, stop only the process whose command line
names this checkout's `firestore.rules` and the exact demo project from that run.

The focused suites cover missing/invalid/expired/revoked authentication; wrong
roles/inactive Super Admin; self/Super Admin targets; forged input; all target
roles and actions; repeated/concurrent/conflicting operations; deleted Enable
rejection; injected Auth/revocation/initial and final Firestore failures; lost
commit acknowledgement; stalled-lock denial; legacy status reconciliation;
approval/verification preservation; audit identity/outcomes; stale-token access;
map removal/sharing staying off; HTTP and browser integration; primary session
preservation; live client denial and listener cleanup; duplicate clicks; retry IDs;
and explicit demo isolation. Dispatcher invitation acceptance/provisioning,
Change Password, Remember Me, review names, privacy, notifications and ordinary
logout ordering have regression coverage.

Checks actually performed:

- **31/31 emulator tests passed:** 15 lifecycle tests and 16 Dispatcher
  provisioning regressions. The final suite includes legacy disabled accounts,
  unapproved/unverified Enable and lost final commit acknowledgement.
- **30/30 existing emulator regressions passed:** map location/access, updated
  trusted lifecycle/map behavior, real reviewer names and notifications.
- **65/65 client/auth tests passed:** 10 live-session/UI/transport tests, 13
  Remember Me/startup tests, 26 Change Password tests and 16 foreground sharing
  tests. These run actual handlers/modules with controlled SDK/hook adapters;
  they are not device-rendering tests.
- The documented demo fixture script ran twice successfully against fresh local
  emulators. It did not overwrite existing fixture profiles on the second run.
- Backend TypeScript and Admin Web TypeScript/Vite production builds passed.
  Scoped backend and mobile/test ESLint checks passed. The portal lint command
  completed with its same 10 existing warnings; its large-bundle build warning
  remains.
- Full root TypeScript still reports **22 pre-existing errors** in Admin/Vite
  declarations, OTP tests and theme imports/types. Full root lint still reports
  **8 pre-existing errors** in `select-service.tsx` and theme/example modules.
  Full backend lint still reports **4 pre-existing indentation errors** in
  `functions/src/domain/availability.ts`. No unrelated fixes were made.
- `git diff --check` passed. No deployed environment was tested or changed.

The token strategy follows Firebase's distinction between revoking refresh
sessions and checking existing tokens; see the primary
[Firebase session-management documentation](https://firebase.google.com/docs/auth/admin/manage-sessions).

## Manual browser/Android workflow (not performed on devices)

Start a FRESH non-persistent demo emulator instance in terminal 1:

```powershell
$env:DEBUG = ''
$env:JAVA_TOOL_OPTIONS = '-Xmx512m -Djava.net.preferIPv4Stack=true'
firebase emulators:start --project demo-servicepilot-review-author --config firebase.review-author-test.json --only 'auth,firestore'
```

Terminal 2, seed only the guarded disposable fixtures, then start the backend:

```powershell
$env:GOOGLE_CLOUD_PROJECT = 'demo-servicepilot-review-author'
$env:GCLOUD_PROJECT = 'demo-servicepilot-review-author'
$env:FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9197'
$env:FIRESTORE_EMULATOR_HOST = '127.0.0.1:8187'
node scripts/seed-lifecycle-emulator.mjs
$env:DISPATCHER_MODE = 'emulator'
$env:DISPATCHER_ADMIN_ORIGIN = 'http://localhost:5173'
$env:PORT = '8789'
npm --prefix functions run dispatcher:serve
```

The seed preserves existing fixtures and lifecycle states on rerun. Restart fresh
emulators for a clean baseline; do not run it against a real Firebase project.
It creates `lifecycle-demo-admin`, `lifecycle-demo-other-admin`,
`lifecycle-demo-customer`, `lifecycle-demo-technician`, and
`lifecycle-demo-dispatcher`, with emails `<uid>@example.test`. The synthetic,
local-only fixture password is `Only-for-local-lifecycle-42`.

Terminal 3, run Admin Web with its explicit development-only demo flag:

```powershell
$env:VITE_USE_FIREBASE_EMULATORS = '1'
$env:VITE_DISPATCHER_API_URL = 'http://127.0.0.1:8789'
npm --prefix admin-web run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Open `http://localhost:5173`. This mode uses the same demo project as mobile.
Production builds ignore this flag. Normal web sessions keep their existing
Firebase configuration and persistence. Restart the portal when changing modes.

Terminal 4, one Metro server for two Android emulators:

```powershell
$env:EXPO_PUBLIC_USE_FIREBASE_EMULATORS = '1'
$env:EXPO_PUBLIC_FIREBASE_EMULATOR_HOST = '10.0.2.2'
npx expo start --clear
```

Open the same Metro URL on both devices. No automatic emulator detection was
added. Do not use production accounts. If a separate Metro process is already
serving another environment, stop it before switching. The existing optional
Functions emulator is not required for lifecycle or Firestore maps.

1. Sign in to Admin Web as the local Super Admin. On devices sign in as the
   fixture Technician and Customer. Enable foreground sharing manually; check
   the Customer map shows the Technician. Use Android Extended Controls for GPS
   if needed; no coordinates are supplied by this lifecycle fixture.
2. Disable the Technician from Admin Web. Check the loading state, live denial
   message/sign-out, stopped GPS, immediate map removal, disabled Auth identity,
   profile status and completed audit. Repeat for Customer and Dispatcher (use
   an incognito web window for Dispatcher). The Super Admin must remain signed in.
3. Enable each account. Old sessions must stay denied. Sign in afresh after at
   least one second; check approval/verification unchanged and sharing OFF. An
   unapproved/unverified Technician must still follow existing approval/email
   checks.
4. Rapidly double-click a lifecycle confirmation, then submit conflicting
   actions from two admin windows. Confirm one serialized operation, truthful
   loading/error states and safe retries. Use browser offline mode to simulate a
   lost response, reconnect and Retry; do not assume an offline response means no
   backend changes occurred.
5. Soft-delete each supported role. Confirm Auth/profile still exist, Auth is
   disabled, history/reviews are retained, the map is unavailable and ordinary
   Enable is rejected. Check audit outcomes (pending/retryable/complete) rather
   than treating the action name alone as success.
6. Sign out and switch between two accounts while reads are pending. Confirm
   old listeners/callbacks cannot authorize or sign out the new account. Disconnect
   a mobile session, disable it elsewhere, reconnect and verify access is denied.
7. Exercise self-targeting, another Super Admin target, missing/expired token,
   forged actor/role, and a non-admin caller using the automated demo tests rather
   than pasting real ID tokens into terminals or screenshots. Injected provider/
   storage failures and stale-token server denials are automated test scenarios;
   stopping the whole emulator is not proof of those individual cases.

No interactive browser, Android/two-device, production HTTPS/CORS, or hosted
deployment verification was performed. UI/modal rendering and offline/reconnect
timing require the manual checks above.

## Deployment and configuration FOR REVIEW ONLY

Use the same approved billing-free Node host, runtime ADC/workload identity,
HTTPS endpoint, exact `DISPATCHER_ADMIN_ORIGIN`, SMTP runtime settings and
`VITE_DISPATCHER_API_URL` described in `DISPATCHER_BACKEND_VALIDATION.md`.
The standalone server still requires the existing production SMTP configuration
for Dispatcher invitations; lifecycle operations themselves send no email.
It needs Auth user-update/revocation and Firestore permissions. No service-account
key belongs in Vite/Expo or Git. No suitable production host was provisioned in
this checkout; provider-specific release commands depend on the owner's host.

Review the built backend and updated clients together with the restrictive rules.
Old portals lose browser lifecycle permissions once rules are published, so
coordinate the release. Review-only build/start and rules commands:

```powershell
npm --prefix functions ci
npm --prefix functions run build
# On the approved host AFTER runtime configuration:
npm --prefix functions run dispatcher:serve
# Publish rules only after review and release coordination:
$env:DEBUG = ''
firebase deploy --only firestore:rules --project servicepilot-756d9
```

No new indexes are needed (point reads/transactions only). Use the existing
review-only static portal staging/Hosting commands in
`DISPATCHER_BACKEND_VALIDATION.md`; rebuild with the approved HTTPS backend URL.
Build/release the mobile client through the project's existing approved Expo
distribution process. Do not set the demo flags for a production release.

The standalone lifecycle flow does not require a deployed Cloud Function or a
billing account. If the three legacy optional callable endpoints are already
deployed/accessible, their source patches must also be released through the
existing approved setup or the obsolete endpoints retired; otherwise the old
server code lacks the new post-enable cutoff check. Review-only command, solely
for an EXISTING permitted Functions setup (do not enable billing to run it):

```powershell
firebase deploy --only functions:getMapTechnicians,functions:getJobTechnicianLocation,functions:sendServicePilotVerificationEmail --project servicepilot-756d9
```

The pre-existing full backend lint failures currently block the repository's
Functions predeploy check; resolve them in a separately reviewed change if that
optional deployment is needed. No Functions deployment command was executed.

## Changed files for this lifecycle task

| Files | Purpose |
| --- | --- |
| `functions/src/services/account-lifecycle.service.ts` | Authoritative lifecycle orchestration, locks, receipts, audit and safe map revocation. |
| `functions/src/services/trusted-auth.ts`, `dispatcher-provisioning.service.ts` | Extract/reuse revocation-aware Super Admin authorization. |
| `functions/src/dispatcher-server.ts`, `dispatcher-main.ts` | Add lifecycle endpoint to the existing standalone runtime. |
| `functions/src/domain/accountSession.ts` | Shared authoritative status/pending/session-cutoff policy. |
| `functions/src/services/map.service.ts`, `functions/src/index.ts` | Session cutoff checks in existing optional protected callable endpoints. |
| `firestore.rules` | Remove browser lifecycle/audit grants; protected-operation session gates and server-only lock/receipt access. |
| `admin-web/src/services/accountLifecycleService.ts`, `dispatcherProvisioningService.ts` | Authenticated transport, response validation, safe retry IDs and errors; no browser lifecycle writes. |
| `admin-web/src/components/AccountLifecycleActions.tsx`, `types.ts`, `pages/AuditLogs.tsx` | Duplicate guard, pending Retry, truthful soft-delete/enable copy and audit outcomes. |
| `admin-web/src/auth/AdminAuthContext.tsx`, `pages/Login.tsx`, `firebase/config.ts` | Live denial/session cleanup, clear login messages and explicit development-only demo setup. |
| `src/services/account-session.service.ts`, `src/components/auth/LiveAccountGate.tsx`, `AuthSessionGate.tsx` | Bounded live mobile denial monitor and blocking/retry feedback after Auth restoration. |
| `src/hooks/useMobileSessionAccess.ts`, `src/services/user.service.ts`, `app/(auth)/login.tsx` | Check cutoff before routing; retain role/email/approval/Remember Me decisions. |
| `src/services/auth.service.ts`, `src/utils/foregroundSharing.ts` | Separate confirmed-revocation local cleanup; ordinary logout ordering retained. |
| `scripts/tests/account-lifecycle.test.mjs`, `account-session.test.mjs` | Focused backend, rules, HTTP, client session and retry tests. |
| `scripts/tests/map-admin.test.mjs`, `foreground-sharing.test.mjs`, `auth-persistence.test.mjs` | Adapt lifecycle contract and extend existing cleanup/auth regressions. |
| `scripts/seed-lifecycle-emulator.mjs`, this document, `scripts/DISPATCHER_BACKEND_VALIDATION.md` | Guarded idempotent demo fixture, handoff and current-architecture cross-reference. |

Earlier unrelated working changes and their lockfiles/docs remain uncommitted.
No Change Password implementation, provisioning policy, booking/rating behavior
or map rendering redesign was included in this task.
