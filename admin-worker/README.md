# ServicePilot separate Admin Worker

For the current Gmail decision-email adapter, configuration and reviewed deployment
command, see [Gmail technician decision emails](../docs/GMAIL_TECHNICIAN_EMAIL.md).
The local template selects `TECHNICIAN_EMAIL_PROVIDER=gmail`; dispatcher invitations
still use `ADMIN_EMAIL_PROVIDER=firebase`. No Gmail credentials are checked in.
This adapter has been tested with mocks only and has not been deployed.

For the subsequent portal navigation, requested-role login and technician
decision-email integration, see
[the focused implementation/release notes](../docs/PORTAL_NAV_LOGIN_DECISION_EMAIL.md).
That integration reuses Resend for custom decisions while preserving the existing
Firebase invitation mode; server-only sender/key configuration is required.

Local preparation only, 2026-11-02. No deployment, IAM change, email delivery,
billing activation, commit or push has been performed. Start with
[`scripts/ADMIN_WEB_CLOUDFLARE_PLAN.md`](../scripts/ADMIN_WEB_CLOUDFLARE_PLAN.md)
for the existing architecture; this adapter implements its separate-Worker option.

## Domain-free dispatcher onboarding

The default template now selects `ADMIN_EMAIL_PROVIDER=firebase`. You do not need
to own a domain or configure Resend to use this mode. A future Cloudflare Pages
`pages.dev` portal, Worker `workers.dev` API, and Firebase's project-hosted email
action page provide the HTTPS endpoints. No provider/site has been deployed here.

Official Firebase documentation was checked before implementation:

- [Auth REST password-reset email](https://firebase.google.com/docs/reference/rest/auth#section-send-password-reset-email)
  documents `POST /v1/accounts:sendOobCode?key=...` with `PASSWORD_RESET` and email.
- [sendOobCode](https://docs.cloud.google.com/identity-platform/docs/reference/rest/v1/accounts/sendOobCode)
  distinguishes sending an email from `returnOobLink=true`, which returns a link
  instead of sending. The Firebase provider never sets that field or invokes
  `generatePasswordResetLink`; no reset link enters its application response.
- [Email action handlers](https://firebase.google.com/docs/auth/custom-email-handler)
  describes the default handler hosted on the project's Firebase Hosting domain.
  An owned/custom sending domain is optional, not required for this flow.

An active Super Admin creates the dispatcher through the existing trusted API.
Auth and Firestore start unverified, the invitation stays pending, and the account,
audit and operation receipt commit before requesting email. The engine then checks
the target's current Auth UID/email/disabled state and requests a Firebase password
reset email with the fixed portal `/login` continue URL. The dispatcher sets their
password through Firebase's action handler and signs in on the portal. Existing
login logic accepts the pending invitation; requesting email alone does not accept
the invitation or mark any profile as email-verified.

`accepted` means only Firebase accepted the email request. It does not establish
inbox delivery, receipt, a working action URL or completed password setup. Email
enumeration protection can also hide missing-account information; the prior Auth
lookup reduces that race but cannot make acceptance proof of delivery. `sent` is
retained for existing SMTP/Resend clients and also does not establish inbox delivery.

Accepted requests retain the 60-second resend cooldown and 120-second sending
lease. Reported quota or abuse errors save `failed`; network/5xx uncertainty saves
`unknown`. These paths impose at least a 60-second retry wait and perform no
automatic email retry. A daily quota may require a much longer wait. Committed
accounts, audits and duplicate reservations survive either outcome; never recreate
an account to retry its email. A lost response or receipt can still produce a
duplicate email after retry; exactly-once delivery is not claimed.

Firebase's current [Auth limits](https://firebase.google.com/docs/auth/limits)
list **150 password-reset emails/day on Spark**, shared with all project password
reset flows; the separate link-generation allowance is not the send allowance.
Limits can vary with account usage and abuse controls. Built-in mail is therefore
domain-free, not unlimited or guaranteed delivery. There is no automatic billing
upgrade or fallback to another mail provider. Abuse protection may require a
browser CAPTCHA flow that this server adapter does not implement; it reports the
failure and waits rather than bypassing the challenge.

### Domain-free configuration checklist (future owner setup only)

1. Choose the actual assigned Pages and Worker URLs. Use the exact Pages HTTPS
   origin for `ADMIN_WEB_ORIGIN` and its Worker HTTPS origin for
   `VITE_DISPATCHER_API_URL`; arbitrary placeholder names are not live endpoints.
2. Keep `ADMIN_EMAIL_PROVIDER=firebase`; supply `FIREBASE_WEB_API_KEY` from the
   **same** `servicepilot-756d9` Firebase web project. It is a public Firebase
   identifier, not an Admin credential; store it as a Worker secret here to avoid
   incidental log/config exposure. Check that its API/application restrictions
   permit Identity Toolkit requests from this backend. A browser-referrer-only
   restricted key may fail. Do not weaken an existing key's restrictions blindly.
3. Keep the separate `ADMIN_SERVICE_ACCOUNT_EMAIL` and
   `ADMIN_SERVICE_ACCOUNT_PRIVATE_KEY` for trusted account creation, current Auth
   checks and Firestore transactions. Built-in mail does not remove those needs.
   `RESEND_API_KEY` and `ADMIN_EMAIL_FROM` are **not required in Firebase mode**.
4. In Firebase Authentication, confirm Email/Password sign-in and the password
   reset template/action URL. Authorize the actual `pages.dev` portal hostname as
   an email continue destination. Use the existing working Firebase-hosted handler
   or the Firebase default handler; do not point reset links at the SPA `/login`.
   No console settings have been changed or verified remotely by this task.
5. Existing repository `public/auth/action.html` calls `confirmPasswordReset` and
   intentionally ignores arbitrary URL `continueUrl` values. Its
   `public/auth/action-config.js` currently sets `webSignIn: '/login'` relative to
   its own host. If that custom handler is active while the portal is on Pages,
   its reviewed web sign-in setting needs the actual Pages `/login` URL before
   release. Do not assume the new continue URL overrides it. That handler/config
   was left unchanged to preserve existing mobile/password-reset work. Review the
   project-wide effect before switching any shared email template handler.
6. After publication is separately approved, manually verify an approved staging
   invitation, template, spam/inbox delivery, password completion, correct portal
   return and sign-in. No real email or production account was used in this task.

Future Worker secret setup (remote changes; **not executed**):

```powershell
.\admin-worker\node_modules\.bin\wrangler.cmd secret put FIREBASE_WEB_API_KEY --config .\admin-worker\wrangler.jsonc
```

The built-in password-reset endpoint is also a normal public Firebase Auth feature;
holding the public API key does not grant dispatcher creation or bypass the Admin
API. Do not move service-account credentials into the browser to deliver email.

## Implementation and security

- Worker name `servicepilot-admin`; no booking/photo routes, bindings or code
  imports. Existing booking/photo Workers and their URLs are unchanged by this task.
- HTTPS REST replaces Firebase Admin's gRPC transport and SMTP. The runtime uses
  `jose`, WebCrypto and supported `node:crypto`; Firebase Admin imports are types
  only and absent from the bundle. Workers' HTTP/2 stub does not affect this path.
  Workerd rejects `redirect: 'error'`; the adapter uses manual redirects and rejects
  3xx explicitly before any credential could be forwarded.
- The original provisioning/lifecycle engines now live in
  `functions/src/domain/adminProvisioning.ts` and `adminLifecycle.ts`. Existing Node
  services are thin wrappers supplying SDK timestamp sentinels; the Worker supplies
  REST `REQUEST_TIME` transforms. The authorizer and map projection are shared.
  Runtime adapters implement only the used SDK subset, with explicit type boundaries
  in `src/services.ts`, not a general Firebase Admin SDK implementation.
- RS256 signature, Firebase issuer, exact project audience, expiry, issue time and
  auth time are verified. Current Auth lookup rejects deleted/disabled users and
  revoked sessions; it is not cached. Then the shared authorizer reads `users/{uid}`
  and requires exact active `super_admin`, no pending lifecycle, and a session newer
  than `sessionRevokedAt`. Claims and request fields never confer a trusted role.
- Firestore transactions preserve create/update existence preconditions, ordered
  point reads, atomic audit/receipt/profile writes, email reservations, durable
  lifecycle locks, map revocation and server timestamps. Only definite `ABORTED`
  transactions retry (at most four attempts). Ambiguous commits are not replayed;
  the engines check durable receipts before compensating. No collection scans.
- Creation rollback deletes only the Auth UID created successfully by that operation.
  Unknown Auth creation retains reservations for trusted recovery. Email failure
  preserves the committed account/audit and permits resend. The existing 120-second
  delivery lease and 60-second success cooldown remain. Exactly-once email delivery
  is not promised after a provider acceptance followed by a lost Firestore receipt.
- Disable/delete gate Firestore access and remove public/private map sharing before
  Auth updates. Enable does not restore GPS sharing or invent a missing Auth user.
  Self-management, Super Admin targets, stale operations and conflicting actions
  remain protected. Delete is the existing soft-delete operation.
- Both engines additionally reject pending-lifecycle actors at final completion.
  No live data migration, Firestore rule change or new index is required by this
  adapter. Existing uncommitted rule changes are outside this task.

## Routes

| Route | Behavior |
| --- | --- |
| `POST /v1/dispatchers` | Existing `{ fullName, email, requestId }` contract. |
| `POST /v1/dispatchers/resend-invitation` | Existing `{ uid }` contract. |
| `POST /v1/accounts/lifecycle` | Existing `{ targetUid, action, requestId }`; disable/enable/delete. |
| `OPTIONS` on these paths | Exact-origin CORS preflight. |
| `GET /healthz` | Process liveness, no provider calls. |
| `GET /readyz` | Configuration presence/shape only; explicitly reports `dependencies: not-probed`. It is not live IAM or mail readiness. |

POST requires JSON (maximum 4096 bytes) and Firebase Bearer authentication. Origin
matching is exact; requests without Origin still require authentication. No booking
route or wildcard preview-domain allowance. Provider errors are sanitized; tokens,
passwords, reset links, recipients and raw provider responses are never logged.
Automatic observability is disabled in the template.

## Local setup and tests

From repository root, Node 22.12+ within Node 22:

```powershell
npm.cmd --prefix functions ci
npm.cmd --prefix admin-web ci
npm.cmd --prefix admin-worker ci
npm.cmd --prefix functions run build
npm.cmd --prefix admin-worker run check
npm.cmd --prefix admin-worker test
npm.cmd --prefix admin-worker run build
```

The Worker's `build` script is explicitly **Wrangler deploy --dry-run**, producing
`.worker-build/` locally. It does not publish. Tests use generated in-memory RSA
keys and mocked outbound providers; no real secrets or emails are needed. On this
Windows sandbox, esbuild/workerd needed permission to execute outside the sandbox.

Java 21+ and Firebase CLI are required for actual REST emulator integration:

```powershell
$env:DEBUG = ''
$env:JAVA_TOOL_OPTIONS = '-Xmx512m -Djava.net.preferIPv4Stack=true'
$env:CI = '1'
firebase.cmd emulators:exec --project demo-servicepilot-admin-worker --config firebase.admin-worker-test.json --only 'auth,firestore' 'npm.cmd --prefix admin-worker run test:emulator'
```

Dedicated ports: Firestore 8189, Auth 9199, WebSocket 9152, hub 4402, logging 4502.
The test refuses non-loopback hosts and any other project. Its transport maps the
production Auth URL to the emulator's `/identitytoolkit.googleapis.com` path and
normalizes only the synthetic reset link's HTTP scheme; no link is opened or sent.
There is no environment flag accepting unsigned emulator tokens in the Worker.
If Windows leaves a Java test emulator running after shutdown, verify its exact
demo project and command line before stopping it; never kill all Java processes.

Existing Node backend regressions use the separate original demo project/config:

```powershell
firebase.cmd emulators:exec --project demo-servicepilot-dispatcher --config firebase.dispatcher-test.json --only 'auth,firestore' 'node --test scripts/tests/dispatcher-provisioning.test.mjs scripts/tests/account-lifecycle.test.mjs'
```

For an unconfigured local Worker smoke check:

```powershell
npm.cmd --prefix admin-worker run dev
```

`http://localhost:8793/healthz` works without secrets. Config readiness and privileged
calls fail closed until configured. Local Wrangler is not an offline sandbox once
real credentials are supplied; do not exercise production operations for testing.
No existing environment file was overwritten. `.dev.vars.example` is blank; a
private `.dev.vars` is ignored, but is not needed for the automated tests.

## Owner setup sequence — review only, not executed

1. Select the Cloudflare account, unique Worker/Pages names, stable Admin portal
   HTTPS origin and public Admin Worker HTTPS origin. These account-specific values
   are not known. Use a separate staging project/identity for live integration.
2. Have the IAM owner review `iam-role.review.json` and provision a **separate**
   runtime identity named `servicepilot-admin-runtime@servicepilot-756d9.iam.gserviceaccount.com`
   (or the allowed `servicepilot-admin-...` pattern). Do not reuse booking/photo
   identities or grant Owner/Editor/Firebase Admin. The proposal lists only Auth
   get/create/update/delete/sendEmail and Firestore point-document CRUD/transactions.
   It omits listing, indexes, configuration, IAM and billing administration.
   Review against [Auth API permissions](https://docs.cloud.google.com/identity-platform/docs/access-control)
   and [Firestore IAM](https://docs.cloud.google.com/firestore/native/docs/security/iam).
   This role has not been validated on real IAM. IAM does not isolate these writes
   by app role or document UID; server OAuth bypasses client Firestore rules.
   Code-level allowlists and authoritative authorization remain essential.
3. Supply that identity's private key through trusted secret delivery. This adapter
   implements service-account JWT OAuth, not workload federation. If organization
   policy forbids keys, federation support is a blocker requiring separate work.
   Do not generate or export a key merely to run local tests. Rotate/revoke keys
   through the owner's established procedure; no key was created here.
4. Use the domain-free Firebase checklist above. The existing Resend provider is
   preserved as an explicit alternative: only if choosing `resend`, configure a
   verified sending domain/from address and domain-scoped send-only key. No provider
   account, sender or email template has been configured by this task.
5. Set nonsecret Worker vars `ADMIN_WEB_ORIGIN` (exact HTTPS origin),
   `ADMIN_EMAIL_PROVIDER=firebase` (or explicitly `resend`), and `ADMIN_EMAIL_FROM`
   only for Resend (bare verified mailbox)
   in `admin-worker/wrangler.jsonc`. Keep `FIREBASE_PROJECT_ID=servicepilot-756d9`.
   Blank template values intentionally prevent configured readiness.
6. **Only after separate authorization to change remote secrets**, run interactive
   secret setup from repository root. Never place these in Pages build settings,
   Vite variables, frontend source, or a checked-in JSON file:

   ```powershell
   .\admin-worker\node_modules\.bin\wrangler.cmd secret put ADMIN_SERVICE_ACCOUNT_EMAIL --config .\admin-worker\wrangler.jsonc
   .\admin-worker\node_modules\.bin\wrangler.cmd secret put ADMIN_SERVICE_ACCOUNT_PRIVATE_KEY --config .\admin-worker\wrangler.jsonc
   .\admin-worker\node_modules\.bin\wrangler.cmd secret put FIREBASE_WEB_API_KEY --config .\admin-worker\wrangler.jsonc
   ```

   Enter secrets at the interactive prompt, not as command-line arguments. The
   private key may use literal `\n` escapes for line breaks. Restrict the Cloudflare
   automation token to this account's required Worker edit scope; do not give the
   frontend runtime that token. Secret operations themselves change remote state.
   If explicitly selecting Resend, use `secret put RESEND_API_KEY` with the same
   config instead of requiring `FIREBASE_WEB_API_KEY`. Existing Node SMTP and
   emulator providers are preserved; none are used as an automatic fallback.
7. Once separately approved for publication, the Worker command would be:

   ```powershell
   .\admin-worker\node_modules\.bin\wrangler.cmd deploy --config .\admin-worker\wrangler.jsonc
   ```

   Do not run this during local preparation. Confirm the actual endpoint afterward;
   a template name does not guarantee availability or a successful deployment.

## Cloudflare Pages configuration

`admin-web/wrangler.jsonc` selects `servicepilot-admin-web`, output `dist` relative
to that file. Public `_redirects` preserves BrowserRouter deep links; `_headers`
sets no-store, no-referrer, nosniff, frame denial and disables unused permissions.
Existing Firebase public auth/legal hosting remains separate and unchanged.

For a future Pages Git project: repository build root, Node 22.12+ within 22,
build command `npm ci --prefix admin-web && npm run build:pages --prefix admin-web`,
output `admin-web/dist`. Keep the full repository checkout because Admin Web imports
shared domain files from `functions/src/domain/`. The dashboard settings must agree
with the Pages Wrangler configuration; no project was created here.

The only allowed public build inputs are `VITE_DISPATCHER_API_URL` (actual Worker
HTTPS origin) and `VITE_USE_FIREBASE_EMULATORS=0`. `build:pages` loads Vite production
env precedence and rejects missing/insecure/credential-bearing URLs, emulator mode
and unapproved `VITE_*` names. The existing ordinary `build` command remains available
for local static checks; it does not validate release API configuration.

After the actual public URL is known:

```powershell
$env:VITE_DISPATCHER_API_URL = Read-Host 'Actual Admin Worker HTTPS origin (public)'
$env:VITE_USE_FIREBASE_EMULATORS = '0'
npm.cmd --prefix admin-web run build:pages
```

Review only, after separate approval for Pages publication:

```powershell
Push-Location admin-web
..\admin-worker\node_modules\.bin\wrangler.cmd pages deploy dist --project-name servicepilot-admin-web
Pop-Location
```

Authorize the chosen portal domain in Firebase Auth; preserve existing auth action
handler configuration. Set the exact same portal origin in Worker CORS/continue URL.
Arbitrary Pages preview domains are not automatically authorized. Check login,
deep refreshes, unauthorized/revoked/dispatcher access, create, duplicate retry,
resend, actual inbox delivery, and lifecycle recovery in an approved staging setup
before production release. Do not test by creating production dispatcher accounts.

## Free-plan feasibility and provider costs

**Conditional, not certified production-ready on Free.** Runtime compatibility and
local tests do not prove Cloudflare's production CPU enforcement or actual IAM/mail
setup. Pricing below was checked against official documentation on 2026-11-02.

| Component | Feasibility / cost boundary |
| --- | --- |
| Cloudflare Pages static frontend | Fits Free static hosting. Free has 500 builds/month, 20,000 files and 25 MiB per asset. Existing output is below those asset limits. [Pages limits](https://developers.cloudflare.com/pages/platform/limits/) |
| Admin Worker | Free: 100,000 requests/day, 10 ms CPU/request, 128 MB, 50 external subrequests. Request budget caps adapter fetches at 45, including OAuth/JWKS/Firestore/Auth/mail, with a 24-second provider deadline and four transaction attempts. Contention or budget exhaustion fails safely and can require trusted recovery. A real cold/warm/worst-contention CPU profile is still required; local workerd success does not establish a 10 ms CPU fit. [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) |
| Workers Paid if Free is insufficient | Starts at USD 5/month plus usage beyond included allowances. This task does not select or activate Paid. [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) |
| Firebase built-in email (default) | Domain-free using the project's default email delivery/template/action handler. Spark documentation lists 150 password-reset emails/day; project-wide abuse and account limits also apply. Acceptance is not inbox delivery. No Resend subscription or owned sending domain is required. [Auth quotas](https://firebase.google.com/docs/auth/limits) |
| Resend HTTPS email (optional, preserved) | Free advertises 3,000 emails/month and 100/day. Pro advertises USD 20/month for 50,000/month. Requires verified sender/domain setup; not needed for Firebase mode. [Resend pricing](https://resend.com/pricing), [send API](https://resend.com/docs/api-reference/emails/send-email) |
| Cloudflare Email Service (not implemented) | Arbitrary-recipient sending requires Workers Paid; sends to account-verified destinations are free. Paid includes 3,000 outbound/month, then USD 0.35/1,000. Verified-destination-only sending does not solve arbitrary new dispatcher invitations. [Email pricing](https://developers.cloudflare.com/email-service/platform/pricing/) |
| SMTP | Existing Node provider remains unchanged. It is not used in the Worker; built-in Firebase or optional Resend HTTPS replaces this transport there. No SMTP credentials are uploaded. |
| Firebase | Existing project quota is shared with mobile/booking/photo flows. Default database free allowance includes 50,000 reads, 20,000 writes and 20,000 deletes/day; each operation uses several reads/writes and retries add usage. No billing/plan change or billed Functions is required by this architecture, but IAM/API eligibility and actual account quotas are unverified. [Firestore quotas](https://firebase.google.com/docs/firestore/quotas) |
| Domain and DNS | Owner has no domain. Default `pages.dev`, `workers.dev` and Firebase-hosted action URLs support this flow without purchasing one. Confirm assigned names and Auth authorized domains before release. |

Missing/blocked before live release: chosen account and origins, dedicated runtime
identity/private key with reviewed IAM, same-project `FIREBASE_WEB_API_KEY`, Firebase
authorized-domain and action-handler confirmation, live staging integration and
CPU measurements. A Resend domain/from/key is only required if choosing Resend.
Configuration-only `/readyz` must not be presented as evidence those are working.
The Worker also shares the account's aggregate Free request quota with other Workers.

No live IAM, OAuth, provider mail, DNS, HTTPS/CORS integration or Free-plan CPU test
has been performed. No production migration or remote configuration was executed.

## Validation results

- Worker TypeScript: PASS; Wrangler dry-run: PASS, approximately 320 KiB
  uncompressed / 95.1 KiB gzip with the Firebase provider included.
- Focused adapter/Pages/workerd tests: 16 PASS. Outbound OAuth, JWKS, Auth,
  Firestore and email are mocked in these tests; RSA crypto runs in workerd.
- Real loopback Auth/Firestore REST integration: 8 PASS (actual emulator
  transactions, concurrency, rollback, ambiguous Auth response, invitation retries,
  lifecycle and map protections, built-in acceptance, verification flags and quota/
  uncertain-request cooldowns). All email requests are mocked, including Firebase.
- Existing Node provisioning/lifecycle regression suite: 31 PASS after extraction.
- Backend build and scoped Functions ESLint: PASS. Admin Web production build:
  PASS with its existing large-bundle warning. Admin Web lint: zero errors,
  10 existing warnings. Focused adapter lint: PASS after cleanup.
- Actual `build:pages` with current local configuration: expected FAIL because
  `VITE_DISPATCHER_API_URL` is absent. Positive and negative guard cases pass in
  isolated tests; no dummy URL was inserted into deployment configuration.
- Earlier local runs exposed and corrected the Miniflare 5 API usage, the
  Auth-emulator URL prefix and workerd redirect mode. Sandbox/leftover test-port
  failures were environmental; the final runtime and integration suites passed.
