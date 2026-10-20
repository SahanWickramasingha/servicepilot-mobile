# Trusted Dispatcher provisioning

Subsequent lifecycle work is documented in
[`ACCOUNT_LIFECYCLE_VALIDATION.md`](ACCOUNT_LIFECYCLE_VALIDATION.md). It reuses this
backend, replaces browser lifecycle/audit grants, adds live session enforcement
and an explicit development-only Admin Web emulator mode. Statements below about
preserving the former lifecycle implementation describe this earlier provisioning
task, rather than the current lifecycle architecture.

## Findings and architecture

Admin Web is React/TypeScript/Vite. The previous provisioning service initialized
a secondary browser Firebase Auth instance named `dispatcher-provisioning`,
generated the Dispatcher ID/password in the browser, created Auth and Firestore
records from the browser, and sent Firebase's password-reset email. Client rules
explicitly allowed Super Admin profile creation and pending-profile deletion.
Email failure incorrectly entered the account/profile rollback path.

`ServicePilot_SuperAdmin_Dispatcher_AGENTS.md` describes a larger planned portal,
including mobile Dispatcher access and optional first-login password/lifecycle
changes. Current Dispatcher access is through Admin Web; existing mobile guards
reject that role. This task preserves that implemented architecture and the
existing invitation acceptance, lifecycle, verification and technician-review
flows. It does not implement the unrelated planned requirements.

The existing trusted backend code is under `functions/`, with Firebase Admin SDK
and Nodemailer already installed. The configured Firebase Hosting site serves
static `public/` files, including the existing `auth/action.html`. Repository
handoffs document unavailable billed Functions deployment. The old OTP Worker is
inactive and is not an appropriate Admin SDK backend. No suitable hosted,
billing-free privileged backend is configured.

The implementation therefore reuses the backend project's dependencies in a
**standalone Node 22 HTTP service**. It is deliberately not exported from
`functions/src/index.ts`, requires no Functions deployment, and has no browser
fallback. Production needs an independently approved Node host and email transport
that meet the billing-free constraint; none was provisioned or deployed here.

## API, authorization and data

- `POST /v1/dispatchers`: `{ fullName, email, requestId }`.
- `POST /v1/dispatchers/resend-invitation`: `{ uid }`.
- Both require `Authorization: Bearer <Firebase ID token>`. The backend calls
  Admin SDK `verifyIdToken(token, true)`, derives the actor UID only from the
  verified token, then reads `users/{uid}`. Exact `role == "super_admin"` and
  `accountStatus == "active"` are mandatory. Token role claims and request role
  flags confer no authority. Missing/invalid/expired/revoked tokens fail before
  profile reads or creation. Inactive/unauthorized profiles fail before creation.
- Name/email are validated and normalized server-side. Unexpected fields,
  including actor UID, role, password, verification and Dispatcher ID, are rejected.
  Email validation accepts common ASCII mailboxes, rejects address-list/header
  syntax, and SMTP receives a structured single recipient. Quoted local parts and
  internationalized email addresses are not supported by this provisioning form.
- Auth UID and Dispatcher ID are generated server-side. A cryptographically
  random temporary password is supplied only to Admin SDK `createUser` and is
  never returned, logged, or saved in application documents. Auth and profile
  start with `emailVerified: false`.
- `users/{dispatcherUid}` has `uid`, `dispatcherId`, normalized `fullName`/`email`,
  `role: dispatcher`, `accountStatus: active`, `invitationStatus: pending`,
  `invitationDeliveryStatus`, `emailVerified: false`, verified `createdBy`, and
  server timestamps `createdAt`/`updatedAt`.
- A Firestore transaction commits the profile, completion receipt, and an
  append-only `audit_logs` entry together. The audit action is
  `SUPER_ADMIN_CREATED_DISPATCHER`, with actor/target UIDs, actor role, target type,
  Dispatcher ID metadata and server timestamp. Credentials/reset links are absent.
- Only public success fields are returned: `uid`, `dispatcherId`, and
  `emailDelivery` (`sent`, `failed`, `emulated`, `pending`, or `unknown`). `sent`
  means SMTP accepted the message, not proof of inbox delivery.

Admin SDK generates a Firebase password-reset/setup link using the configured
portal origin's `/login` as the continue URL. Nodemailer sends the link. The
browser supplies no redirect URL. The emulator mail mode creates the link but
sends no real email and explicitly reports `emulated`. Existing invitations can
also be resent when the Dispatcher profile is active and pending.

The first Super Admin still comes from the existing trusted bootstrap script
`scripts/bootstrap-super-admin.mjs` or its existing manual setup. It was not run
against production. `AdminAuthContext.tsx`, its session, and normal portal login
logic were not changed. The frontend only obtains the current user's ID token;
it never creates/signs in a secondary account.

## Reliability and rules

Server-only collections:

| Collection | Purpose |
| --- | --- |
| `dispatcher_provisioning_operations` | Actor-scoped hashed request ID, input fingerprint, generated UID/ID and operation state. |
| `dispatcher_provisioning_emails` | Hashed normalized-email reservation to serialize concurrent creation. |
| `dispatcher_invitation_deliveries` | Delivery attempt, short lease, cooldown and outcome; no reset links. |

The modal retains one request ID across retries of unchanged input and blocks
duplicate clicks. Completed replays return the same account without creating
another audit or email. Concurrent requests for the same request/email are
serialized or receive a safe conflict. Existing Auth email collisions never
overwrite roles or delete the existing account.

Auth creation, Firestore transactions, and SMTP delivery are **separate steps**.
If the profile/audit transaction fails, rollback deletes only an Auth user whose
creation succeeded in that particular operation. It never deletes by email and
never deletes a pre-existing account. Before rollback it checks whether a lost
commit response actually represented a completed transaction. Email failure
preserves the committed account/profile/audit and enables safe resend.

Ambiguous Auth creation, failed rollback, and process termination can require
trusted reconciliation. Reservations are retained instead of taking them over or
guessing which account to delete. Operators must inspect the operation's exact
UID, Auth creation provenance, profile and audit before any repair; never delete
an account merely because its email matches. No automated destructive recovery or
live migration was run. Email acceptance followed by a lost receipt can require
retry after the 120-second delivery lease; exactly-once email delivery is not
claimed. Confirmed sends have a 60-second retry cooldown.

Rules now allow client `users` creation only for existing public Customer and
Technician registration. Direct privileged Dispatcher creation and browser
rollback deletion are denied, even for Super Admin. Provisioning/delivery
collections deny all client reads/writes. Existing invitation acceptance,
lifecycle audit writes, profile access, maps and review rules are preserved.
The new provisioning audit action is not in the client audit allowlists.
No new Firestore indexes are required: backend coordination uses point reads.

## Local emulator validation

From the repository root, with dependencies already installed and Java 21+ on
PATH (Java 24 was used here), run these exact PowerShell commands:

```powershell
npm --prefix functions run build
$env:DEBUG = ''
$env:JAVA_TOOL_OPTIONS = '-Xmx512m -Djava.net.preferIPv4Stack=true'
$env:CI = '1'
firebase emulators:exec --project demo-servicepilot-dispatcher --config firebase.dispatcher-test.json --only 'auth,firestore' 'node --test scripts/tests/dispatcher-provisioning.test.mjs'
```

Ports are Auth `9197` and Firestore `8187`. The test refuses non-loopback emulator
hosts or a different non-demo project context. It seeds disposable fixtures with
Admin SDK and keeps test ID tokens in memory, never prints them, and sends no
external email. It exercises the actual HTTP server and frontend service, real
Auth/Firestore behavior, rules, password-reset action, and the standalone runtime.
The normal Admin Web config remains unchanged; tests inject a demo Auth instance
into the actual frontend service. Do not point normal production Auth sessions at
the demo backend for manual UI testing.

To run the standalone service itself with already-running demo emulators:

```powershell
$env:DISPATCHER_MODE = 'emulator'
$env:GOOGLE_CLOUD_PROJECT = 'demo-servicepilot-dispatcher'
$env:FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9197'
$env:FIRESTORE_EMULATOR_HOST = '127.0.0.1:8187'
$env:DISPATCHER_ADMIN_ORIGIN = 'http://localhost:5173'
$env:PORT = '8789'
npm --prefix functions run dispatcher:serve
```

Emulator mode refuses real project IDs and non-loopback emulator endpoints.
Production mode refuses emulator variables. Both modes must be selected explicitly.
Keep Firebase CLI debug logging off: an inherited `DEBUG` setting caused the CLI
to dump environment values during the initial validation run. That logging was
disabled for later runs and generated local debug logs were removed.

## Checks performed

- **16 provisioning tests passed**, including missing/invalid/expired/revoked
  tokens; Customer/Dispatcher/disabled/missing-profile callers; active Super Admin;
  forged fields; normalized input; duplicate/repeated/concurrent creation;
  profile-write rollback; failed rollback retention; email failure/resend; real
  Firebase password setup; client create/delete/audit/private-collection denial;
  existing invitation acceptance; unchanged primary session; standalone startup.
- **30 existing emulator access regressions passed** across
  `map-admin.test.mjs`, `map-location.test.mjs`, and `reviewer-names.test.mjs`.
  These retain lifecycle, approvals, maps, ratings, review names and notifications.
- **54 existing mobile auth/sharing tests passed** across
  `auth-persistence.test.mjs`, `change-password.test.mjs`, and
  `foreground-sharing.test.mjs`.
- Backend TypeScript build and Admin Web TypeScript/Vite production build passed.
- Scoped new-backend ESLint and test-file lint passed. Full backend lint has four
  pre-existing indentation errors in `functions/src/domain/availability.ts`.
- Admin Web lint completed with its ten pre-existing warnings outside this change;
  the existing large-bundle build warning remains.
- Root TypeScript reports 22 remaining pre-existing Admin/Vite, OTP and theme
  errors (the replaced browser provisioning code removed two former diagnostics).
  Root lint retains eight existing select-service/theme errors. No new errors in
  the changed provisioning files.
- `git diff --check` passed. No deployment, billing change, production write,
  commit, push, credential file, or new dependency was introduced.

## Files changed for this task

| Files | Change |
| --- | --- |
| `functions/src/services/dispatcher-provisioning.service.ts` | Authorization, normalization, server-generated identifiers/password, reservations, account/profile/audit creation, rollback, invitation delivery and resend. |
| `functions/src/dispatcher-server.ts`, `functions/src/dispatcher-main.ts` | Bounded HTTP API, exact-origin CORS, safe errors, runtime ADC/SMTP and fail-closed emulator/production configuration. |
| `functions/package.json` | Standalone `dispatcher:serve` command; dependencies unchanged. |
| `admin-web/src/services/dispatcherProvisioningService.ts` | Authenticated backend calls; removed all secondary Auth/browser provisioning. |
| `admin-web/src/pages/Dispatchers.tsx`, `admin-web/src/types.ts` | Stable retry IDs, duplicate-submit guard, truthful delivery state, resend action and server-generated ID presentation. |
| `firestore.rules` | Deny privileged profile creation/deletion from clients and protect server-only coordination records; preserve acceptance/lifecycle/other rules. |
| `firebase.dispatcher-test.json`, `scripts/tests/dispatcher-provisioning.test.mjs` | Isolated emulator configuration and focused integration tests. |
| `firebase.dispatcher-hosting.json` | Optional review-only static-hosting configuration preserving staged auth action files. |
| `scripts/DISPATCHER_BACKEND_VALIDATION.md` | This handoff and review commands. |

Pre-existing mobile Change Password and Remember Me changes, their tests and
documentation, and root dependency-lock changes were preserved. No new mobile
authentication edits were made in this task.

## Production prerequisites and commands FOR REVIEW ONLY

Production provisioning is intentionally unavailable until these are configured:

1. An approved Node 22 host meeting the billing-free requirement, serving the
   standalone HTTP service behind HTTPS. Firebase static Hosting cannot run it.
   No hosted backend was discovered or created; the provider-specific upload/
   release command depends on the host selected by the owner.
2. Server-side runtime ADC/workload identity for `servicepilot-756d9` with Firebase
   Auth user-management and required Firestore permissions (for example reviewed
   `roles/firebaseauth.admin` and `roles/datastore.user`). Never bundle Admin
   credentials in Vite/Expo, put service-account keys in Git, or set emulator
   variables in production.
3. An existing SMTP transport with a suitable free allocation; provide server
   secrets `DISPATCHER_SMTP_HOST`, `DISPATCHER_SMTP_PORT`, `DISPATCHER_SMTP_USER`,
   `DISPATCHER_SMTP_PASSWORD`, and `DISPATCHER_SMTP_FROM`. TLS is required.
4. Server configuration: `DISPATCHER_MODE=production`,
   `GOOGLE_CLOUD_PROJECT=servicepilot-756d9`,
   `DISPATCHER_ADMIN_ORIGIN=https://<actual-portal-origin>`, and the host's `PORT`.
   Default binding is loopback; a container host can explicitly set
   `DISPATCHER_BIND_ADDRESS=0.0.0.0` behind its HTTPS ingress. Configure Firebase
   Auth authorized domains for the portal continue URL.
5. Frontend public setting `VITE_DISPATCHER_API_URL=https://<approved-node-host>`.
   This is only the service URL, never credentials. An absent/invalid URL fails
   clearly and never falls back to browser Auth creation.

Build/start commands for the selected Node host, after runtime configuration:

```powershell
npm --prefix functions ci
npm --prefix functions run build
npm --prefix functions run dispatcher:serve
```

Reviewed rules deployment command (NOT EXECUTED):

```powershell
$env:DEBUG = ''
firebase deploy --only firestore:rules --project servicepilot-756d9
```

Optional static frontend release commands (NOT EXECUTED). The separate review
config preserves the existing `public/auth/action.html` and other public files,
adds the new Vite output, and provides SPA routes including `/login`. Review the
staging directory and the configured Hosting site before approving publication:

```powershell
$env:VITE_DISPATCHER_API_URL = 'https://<approved-node-host>'
npm --prefix admin-web run build
$dispatcherHostingStage = Join-Path (Get-Location) '.expo/dispatcher-hosting-review'
New-Item -ItemType Directory -Path $dispatcherHostingStage -Force
Copy-Item -Path 'public/*' -Destination $dispatcherHostingStage -Recurse -Force
Copy-Item -Path 'admin-web/dist/*' -Destination $dispatcherHostingStage -Recurse -Force
firebase deploy --only hosting --config firebase.dispatcher-hosting.json --project servicepilot-756d9
```

No Functions/Blaze deployment or index deployment is required by this approach.
Existing `firebase.json`, hosted content, Function exports and inactive OTP code
were not modified. No migration is required.

## Manual checks not performed / remaining limits

No real SMTP/inbox delivery, hosted HTTPS/CORS integration, manual browser modal
flow, or production account creation was performed. After an owner configures an
approved test host/transport, manually verify create, loading/duplicate-click
behavior, duplicate email, failed email/resend, invitation login/acceptance,
expired session errors, and that the Super Admin remains signed in. Do not use
production accounts merely to validate this change.

Existing broader account lifecycle and Dispatcher verification/access policies
were intentionally not redesigned. New accounts are never marked verified by
provisioning; only Firebase's established verification/reset behavior can establish
Auth verification. The app does not add an offline or client-side privileged
provisioning path. Crash recovery remains a trusted operator action as described
above; it never automatically deletes uncertain/pre-existing accounts.

References: [Admin token verification](https://firebase.google.com/docs/auth/admin/verify-id-tokens),
[Admin user management](https://firebase.google.com/docs/auth/admin/manage-users),
[Admin-generated email action links and mail delivery](https://firebase.google.com/docs/auth/admin/email-action-links),
and [Auth emulator behavior](https://firebase.google.com/docs/emulator-suite/connect_auth).
