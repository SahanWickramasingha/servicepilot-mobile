# Portal navigation, requested login role and decision emails

Implemented locally. No deployment, real email, production record/configuration
write, commit, push or APK build was performed. The pre-existing untracked
`h origin HEAD` file was left untouched. Root AGENTS.md was read; no nested
AGENTS.md files were found.

## Navigation and login

- Sidebar branding and Logout do not shrink. The navigation owns the remaining
  flex space with `min-height: 0` and independent vertical scrolling. Short screens
  use compact padding, without calculating viewport offsets. Main-content
  scrolling and existing active routes/styles remain intact.
- The narrow-screen drawer has an explicit close control, expanded state, focus
  containment, Escape handling, background inertness and focus restoration.
- Login offers native keyboard-operable Super Admin/Dispatcher radio cards,
  contextual form/button text, password visibility and a duplicate-submit guard.
  Firebase persistence configuration is unchanged. There was no existing web
  password-reset control to remove; existing Firebase reset/invitation services
  and mobile reset flows are unchanged.
- The selected role is only a requested portal. The provider checks it against
  the authoritative stored role alongside the existing account/session/revocation
  policy, before accepting invitations or publishing a profile to AdminRoute.
  This also covers the race where the live profile listener wins the one-shot
  sign-in read. Mismatches close the profile listener, sign out, show a clear
  message and offer switching the selection. No role is assigned or persisted
  from the selector. Return destinations are normalized and restricted to the
  authenticated portal. Existing persisted sessions still validate normally.

## Trusted decision email path

The existing approval transaction/service is unchanged: it commits the private
decision, reviewer UID/time/reason and public map projection atomically. The
updated shared Web UI automatically requests the notification after that commit.
Approval success is shown separately from email progress/failure. A failed email
never rolls back or repeats an approval/rejection. A reviewed application's drawer
also loads notification status and offers an authorized email-only retry.

New Admin Worker endpoints reuse the existing bearer/CORS/body/timeout transport:

| Endpoint | Body | Purpose |
| --- | --- | --- |
| `POST /v1/technicians/decision-email` | `technicianUid`, optional `revision` | Request/retry the saved decision's email |
| `POST /v1/technicians/decision-email/status` | `technicianUid` | Read safe notification status for the current saved decision |

The server verifies the Firebase token with revocation checking, then the saved
active Super Admin/Dispatcher profile and session cutoff. Authorization is
rechecked inside the delivery-claim transaction. The decision must be committed,
verified and structurally complete, with a saved reviewer and timestamp. No
client-supplied email, name, approval flag or rejection reason is accepted. The
recipient is resolved from the authoritative application and matched against the
current Auth account before submission. Unavailable/disabled accounts or changed
decisions cannot cause a send.

Approval subject: **Your ServicePilot technician application is approved**.
It says the technician can sign in and explicitly leaves availability/location
sharing unchanged. Rejection subject: **Update on your ServicePilot technician
application**. It includes the saved user-facing reason and makes no approved
access claim. No unsupported support/reapplication workflow is invented. Names
and reasons are escaped in HTML; plain-text equivalents are also provided.

### Delivery and retry contract

- Each decision's UID, full stored timestamp precision, decision and reviewer UID
  produce an opaque revision hash. Receipt documents live at
  `technician_decision_emails/{revision}`. These are server-only under the existing
  default-deny Rules; integration tests deny both client reads and writes, even
  from the reviewing Web account. No Rules/index change is necessary.
- The server atomically claims a 120-second send lease. Concurrent requests reuse
  the receipt instead of submitting twice. The exact provider payload is frozen
  so later name/template/sender changes cannot alter the body for an existing
  idempotency key. The receipt retains only the payload needed for consistent
  retries and operational delivery metadata; it contains no street address, GPS,
  passwords or tokens. No provider bodies, credentials or recipients are logged.
- Provider acceptance is **submitted**, never delivered. Durable submitted
  receipts suppress replay indefinitely. Failed, pending, missing-configuration
  and uncertain outcomes are distinct. Explicit failures can be retried without
  redeciding the application. Short retry cooldowns bound repeated attempts.
- The existing Resend adapter is reused with `Idempotency-Key`. Resend documents
  a **24-hour** retention window for deduplicating identical requests.
  [Provider guarantee](https://resend.com/docs/dashboard/emails/idempotency-keys).
  This implementation blocks uncertain retries after **23 hours**, leaving a
  safety margin. A crashed send remains uncertain across configuration changes;
  restoring settings cannot erase that uncertainty and trigger an unsafe resend.
  Known definitive failures can start a fresh safe retry window.
- The existing Worker request budget remains 24 seconds with bounded subrequests.
  `waitUntil` retains the send/receipt promise if the browser disconnects after
  the request reaches the Worker. No cron, paid queue, deployed Cloud Function
  or new service binding is introduced.

Remaining limitations: this is not an end-to-end exactly-once inbox guarantee.
Unknown outcomes beyond the safe window require an operator to inspect the
provider record; the UI does not blindly resend. Receipt retention and using the
same provider account are part of duplicate protection. No bounce/delivery webhook
is claimed. If the browser closes or loses connectivity **between committing the
decision and starting the notification request**, no receipt exists yet: reopen
the reviewed application and use Request decision email. Older Web/mobile review
clients also require that explicit recovery action; this task does not migrate
historical decisions, add an automatic scan or change mobile source.

## Required configuration

The checked-in Worker defaults use Firebase for invitation/reset emails and an
empty `ADMIN_EMAIL_FROM`. Firebase Auth's setup-email template path does not send
custom application decisions. Decision emails use the existing Resend integration
independently, so Firebase invitations can remain unchanged.

Required for live decision submission:

1. Existing Admin Worker service-account identity/credentials and Firebase project
   configuration; retain `FIREBASE_WEB_API_KEY` when invitation mode is Firebase.
2. Server-only `RESEND_API_KEY` for the existing sending account.
3. `ADMIN_EMAIL_FROM` using a verified domain/sender. Reuse the existing sender if
   configured. Resend requires an owned verified sending domain for normal
   recipient delivery. [Domain requirements](https://resend.com/docs/dashboard/domains/introduction).
4. Pages `VITE_DISPATCHER_API_URL` pointing to the actual HTTPS **Admin Worker**
   origin; retain the existing exact Pages origin in Worker CORS. No email key or
   service-account credential belongs in Vite/mobile variables.

If the optional custom-email settings are absent, the server persists and returns
`not_configured`, makes no provider request and preserves the saved decision.
Malformed credentials or unverified senders are reported as provider failures,
not simulated success. Deployed secrets, DNS and inbox delivery were not inspected
or changed. Configuration syntax checks do not prove provider/domain readiness.

## Validation

- Admin Web TypeScript/production build, Worker TypeScript and Functions TypeScript
  build pass. The domain module is compiled into the Worker; its location under
  `functions/src/domain` does not require a Functions deployment.
- Targeted Web/Worker lint passes with only the existing AuthContext Fast Refresh
  warnings. New domain/type files pass their project's ESLint. Full Admin Web
  lint retains the same ten existing warnings; Vite retains the large-chunk warning.
- **25 host groups** pass, including both matching/mismatched roles, disabled and
  revoked profiles, profile-listener race/cleanup, safe destinations and prior
  approval/category/UI regressions.
- **21 Worker unit/runtime groups** pass with mocked external providers, including
  templates, HTML escaping, status semantics, missing configuration, endpoint
  authorization/CORS, safe errors and bounded keep-alive wiring. The actual
  workerd bundle test and local Wrangler dry-run bundle pass; no deployment occurs.
- **19 isolated Auth/Firestore REST emulator groups** pass. They execute the real
  Web approval transaction and real Worker core/adapters against the full Rules,
  with a mocked email provider. Coverage includes both actor roles, approval and
  rejection, private receipt access denial, forged recipient fields, inactive/
  revoked actors, competing reviews, duplicate requests, submillisecond revision
  identity, provider failure/retry, missing configuration, uncertainty retention,
  and lost acknowledgement recovery. Existing invitation/lifecycle tests remain.
- Real Chrome fixture checks pass for both portals at desktop/narrow widths,
  all technician routes, radio keyboard selection, mismatch/switch/matching
  destinations, password visibility and separate email-only retry. Short navigation
  checks include **1440×400, 390×400, 720×450 and 720×200** effective viewports.
  Every navigation item and Logout is reached, main scroll position is preserved,
  and no horizontal page overflow occurs. The 720×200 case represents the
  effective viewport of a 1440×400 screen at 200% zoom; browser UI zoom itself
  was not manually exercised. Both roles' screenshots were visually inspected.
- `git diff --check` passes. Initial sandbox renderer/workerd startup failures
  were resolved by host execution of the local-only mocked checks. A timestamp
  fixture requesting precision beyond Firestore's stored representation was
  corrected to exercise distinct stored submillisecond values; no check was
  disabled to obtain a pass.

Not performed: real email sends, live provider/account configuration or DNS
verification, production authenticated browser interactions, inbox/bounce proof,
Firefox/Safari/Edge or screen-reader checks, physical devices, native mobile/ APK
validation, production Rules/index inspection, or actual deployment.

Representative previews are under ignored `.expo/technician-management-ui/`:
`portal-login-1440.png`, `portal-login-390.png`, `portal-login-mismatch-390.png`,
`admin-navigation-1440x400.png`, and role-specific narrow navigation images.
Browser fixtures replace Auth/Firestore/provider transports only in their local
Vite server; the release build contains no fixture transport.

Reproduction from the repository root (PowerShell):

```powershell
npm.cmd --prefix functions run build
npm.cmd --prefix admin-worker run check
npm.cmd --prefix admin-worker test
npm.cmd --prefix admin-worker run build  # Local Wrangler dry-run only
npm.cmd --prefix admin-web run build
npm.cmd --prefix admin-web run lint
Push-Location functions
try { .\node_modules\.bin\eslint.cmd src/domain/technicianDecisionEmail.ts src/domain/technicianDecisionEmailTypes.ts }
finally { Pop-Location }
node --test --test-reporter spec scripts/tests/account-session.test.mjs scripts/tests/technician-management.test.mjs scripts/tests/service-categories.test.mjs scripts/tests/technician-access-ui.test.mjs
node scripts/tests/technician-management-browser.mjs
$env:DEBUG = ''
$env:XDG_CONFIG_HOME = Join-Path $env:TEMP 'servicepilot-access-config'
firebase.cmd emulators:exec --project demo-servicepilot-admin-worker --config firebase.admin-worker-test.json --only auth,firestore 'npm.cmd --prefix admin-worker run test:emulator'
```

Chrome/workerd may require host execution where the workspace sandbox prevents
renderer/helper startup. Tests use explicit loopback `demo-` emulator guards and
mock all provider sends. No normal app session is connected to an emulator.

## Changed files

Frontend: `admin-web/src/index.css`, `layouts/AdminLayout.tsx`, `pages/Login.tsx`,
`pages/login.css`, `auth/AdminAuthContext.tsx`, `auth/portalAccess.ts`,
`services/dispatcherProvisioningService.ts`,
`components/technicians/DecisionEmailNotice.tsx`, `TechnicianManagement.tsx`,
`TechnicianApplicationDialog.tsx`, and `technicians.css`.

Backend: `admin-worker/src/index.ts`, `services.ts`, `email.ts`, `firestore.ts`,
`functions/src/domain/technicianDecisionEmail.ts`, and
`technicianDecisionEmailTypes.ts`.

Checks/docs: `admin-worker/package.json`,
`admin-worker/test/decision-email.test.ts`, `decision-email.emulator.ts`,
`scripts/tests/account-session.test.mjs`, `technician-management-browser.mjs`,
`scripts/lib/technician-management-preview.mjs`, `admin-worker/README.md`, and
this document. Firestore Rules/indexes, mobile code and approval transactions
were not modified.

## Deployment requirements — commands for review only

Order: **configure/release the Admin Worker, then rebuild/release Admin Web Pages**.
No Firestore Rules/index deployment, deployed Functions, migration, mobile APK,
booking/photo/OTP Worker release, billing change or new paid queue is required.
This task does not execute any of the following commands.

Use the existing Resend sending account and sender if already configured. Only
run secret creation if that secret is missing. Keep the existing invitation
provider value; decision email support does not require switching it to Resend.

```powershell
Set-Location 'C:\Users\WW\Desktop\servicepilot-mobile'
# Optional, only when RESEND_API_KEY is absent from the existing Worker:
Push-Location admin-worker
try {
    .\node_modules\.bin\wrangler.cmd secret put RESEND_API_KEY --name servicepilot-admin
    if ($LASTEXITCODE -ne 0) { throw 'Resend secret configuration failed.' }
}
finally { Pop-Location }
```

Required release commands after sender/provider configuration is ready:

```powershell
Set-Location 'C:\Users\WW\Desktop\servicepilot-mobile'
Push-Location admin-worker
try {
    $decisionEmailFrom = (Read-Host 'Existing or newly verified ADMIN_EMAIL_FROM address').Trim()
    $existingInvitationProvider = (Read-Host 'Current ADMIN_EMAIL_PROVIDER (firebase or resend; preserve its value)').Trim()
    if ($existingInvitationProvider -notin @('firebase', 'resend')) { throw 'Use the existing invitation provider.' }
    .\node_modules\.bin\wrangler.cmd deploy --name servicepilot-admin --var "ADMIN_EMAIL_FROM:$decisionEmailFrom" --var "ADMIN_EMAIL_PROVIDER:$existingInvitationProvider"
    if ($LASTEXITCODE -ne 0) { throw 'Admin Worker deployment failed.' }
}
finally { Pop-Location }

$env:VITE_DISPATCHER_API_URL = (Read-Host 'Actual deployed servicepilot-admin Worker HTTPS origin').Trim()
$env:VITE_USE_FIREBASE_EMULATORS = '0'
npm.cmd --prefix admin-web run build:pages
if ($LASTEXITCODE -ne 0) { throw 'Admin Web release build failed.' }
Push-Location admin-web
try {
    ..\admin-worker\node_modules\.bin\wrangler.cmd pages deploy dist --project-name servicepilot-admin-web
    if ($LASTEXITCODE -ne 0) { throw 'Admin Web Pages deployment failed.' }
}
finally { Pop-Location }
```

The Admin Worker keeps `FIREBASE_PROJECT_ID=servicepilot-756d9`. Preserve its
existing identity secrets, exact `ADMIN_WEB_ORIGIN`, and Firebase invitation API
key rather than resetting them. The checked-in CORS origin is
`https://servicepilot-admin-web.pages.dev`; a different existing deployment origin
must remain consistent with its release configuration. Plain local `build` is
validation only; `build:pages` checks release environment format and emulator flags
but cannot establish that a supplied HTTPS hostname is the correct deployed API.
