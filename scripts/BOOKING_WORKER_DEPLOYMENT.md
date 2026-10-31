# ServicePilot booking Worker — local implementation and rollout

Prepared locally for `servicepilot-756d9`. Nothing deployed, committed or pushed;
no real booking, remote IAM, photo credential or billing setting was changed.
The existing Node booking host remains available for development. Render is no
longer the prepared permanent host. EAS Build builds mobile artifacts; it does
not host the booking backend.

## Compatibility decision

Installed Node dependencies inspected: firebase-admin **13.10.0**,
@google-cloud/firestore **7.11.6**, google-gax **4.6.1**, @grpc/grpc-js **1.14.5**.
The current default Firestore path invokes grpc-js and `http2.connect`.
Workers' Node compatibility includes importable HTTP/2 stubs, not a functioning
HTTP/2 client. Merely enabling nodejs_compat does not make this gRPC path work.
Firestore's `preferRest` option exists, but the complete Node SDK/ADC dependency
graph is not a verified Workers adapter here. No blanket claim that every SDK
configuration is impossible is made.

The prepared adapter uses Web Crypto/JOSE and native fetch to Google OAuth,
Firebase Auth and Firestore REST. Only `jose` is a runtime npm dependency. It does
not import Firebase Admin, gRPC, Google ADC or the photo Worker. The same pure
`functions/src/domain/bookingSchedule.ts` engine now powers Node and Workers.
Node still supplies Admin Auth/Firestore/FieldValue/Timestamp through its adapter.
The shared error class retains Node HTTP error classification.

Official references checked October 31, 2026:

- [Workers Node compatibility](https://developers.cloudflare.com/workers/runtime-apis/nodejs/)
  and [HTTP/2 stub flag](https://developers.cloudflare.com/workers/configuration/compatibility-flags/#nodejs-http2-module).
- [Firebase JWT verification requirements](https://firebase.google.com/docs/auth/admin/verify-id-tokens).
- [Auth accounts.lookup and OAuth/IAM](https://cloud.google.com/identity-platform/docs/reference/rest/v1/accounts/lookup).
- [Firestore REST authentication/errors](https://firebase.google.com/docs/firestore/use-rest-api),
  [beginTransaction](https://firebase.google.com/docs/firestore/reference/rest/v1/projects.databases.documents/beginTransaction),
  [runQuery](https://firebase.google.com/docs/firestore/reference/rest/v1/projects.databases.documents/runQuery),
  [commit](https://firebase.google.com/docs/firestore/reference/rest/v1/projects.databases.documents/commit).

## Transaction and security boundary

`POST /v1/bookings/schedule` retains the existing bearer token and JSON contract:
`action` (`accept`, `propose`, `approve`, `review-legacy`), `requestId` and the
existing optional date/time/duration/proposalRevision. Success remains 200
`{requestId}`; domain errors remain `{code,message}` with their existing status.
JSON bodies are bounded to 4096 bytes and three seconds. Admin, dispatcher, SMTP,
photo and account-lifecycle routes are absent.

The Worker verifies RS256 signatures using Google's Firebase JWK endpoint,
issuer, audience, expiry, subject, issued-at and auth-time claims. An OAuth
`accounts:lookup` checks current deletion/disable/revocation state on every call,
equivalent to the existing Admin `verifyIdToken(token, true)` behavior. There is
no deployed Auth-emulator or unsigned-token switch. Account/profile lifecycle,
email verification, role, ownership, authoritative approval and availability
remain in the original engine. Auth rejection preserves the Node 401 contract.

Each attempt starts a **Firestore read-write transaction**. Both getAll batches
and both current/legacy 501-limit overlap queries carry the same server token.
Queries project only the four fields consumed by the unchanged overlap engine,
bounding memory without hiding active jobs. More than 500 records fails closed.
The technician lock document is read and its revision written **inside the same
transaction** as the booking and deterministic notification. Server timestamps,
Timestamp values, update masks, field deletion and update-exists preconditions
are preserved. No isolate/global/in-memory reservation lock is used.

Only definitive Firestore `ABORTED` retries the entire callback (up to five
attempts, bounded backoff). Other failures, particularly a lost commit response,
are not blindly retried. The Worker returns 503; existing mobile acceptance
reconciles the authoritative booking read-only and allows the same idempotent
action to be retried. Stable notification document IDs and early returns prevent
duplicate status changes/notices. No new push side effect was added.

The Worker bounds the transaction phase by the request's 16-second deadline,
individual Firestore calls to at most six seconds, rollback to one second and
adapter requests to 40. The mobile transport timeout remains 20 seconds. Slow
Auth/provider calls or lost responses can still yield an ambiguous outcome; no
timeout proves a write was cancelled. No background waitUntil booking mutation.
Trace logs contain correlation ID, stage, safe code and elapsed time only.
Persistent Workers observability is OFF by default; redact any future telemetry.

## Configuration, prerequisites and cost

Work directory: **booking-worker**. Entry: **src/index.ts**. Configuration:
**wrangler.jsonc**. Name: **servicepilot-booking**, separate from photos/OTP.
Compatibility date **2026-10-30** matches the installed workerd ceiling; the
initial October 31 runtime test failed and the supported date passed afterward.
No account ID, custom route or custom domain is invented. The eventual permanent
origin is `https://servicepilot-booking.<actual-account-subdomain>.workers.dev`
or an owner-controlled custom domain. Obtain the actual origin after deployment.
Preview URLs are disabled. No tunnel is a production origin.

| Name | Storage / source |
| --- | --- |
| `FIREBASE_PROJECT_ID` | Wrangler public var, fixed `servicepilot-756d9` |
| `CORS_ALLOWED_ORIGINS` | Wrangler public var; empty for native-only clients, otherwise comma-separated exact reviewed browser origins; never `*` |
| `BOOKING_SERVICE_ACCOUNT_EMAIL` | Worker secret, `client_email` from a **dedicated booking** service-account JSON |
| `BOOKING_SERVICE_ACCOUNT_PRIVATE_KEY` | Worker secret, PKCS8 `private_key` from that same JSON; real newlines or escaped `\n` accepted |

The account naming guard accepts `servicepilot-booking` or
`servicepilot-booking-...@servicepilot-756d9.iam.gserviceaccount.com`. If the owner
chooses another dedicated identity, review/adjust that guard before use; do not
bypass it with the photo account. OAuth cloud-platform scope is only a token
scope: actual access is restricted by that account's IAM. Required existing
permissions: `datastore.databases.get`, `datastore.entities.get`,
`datastore.entities.list`, `datastore.entities.create`, `datastore.entities.update`,
`firebaseauth.users.get` (see `scripts/booking-runtime.role.yaml`). No IAM command
was executed. Google APIs, default Firestore database, current scheduling indexes
and compatible existing Rules must already be ready. No migration is needed.

**Missing/unverified:** Cloudflare account/subdomain and approved deploy identity;
dedicated booking account/key and those permissions; actual permanent URL;
confirmed Workers Free quota headroom; production index/IAM access for this new
principal; deployed latency/load behavior and signed physical-device acceptance.
Existing local/photo credentials do not satisfy these prerequisites by default.

Budget policy: **Workers Free only; zero budget. Do not activate Paid.**
The paid-only `limits.cpu_ms=1000` has been removed. No custom CPU limit or paid
usage model is configured. Free currently allows 100,000 requests/day, 10 ms CPU
per HTTP request, 50 subrequests and 128 MB memory. The daily allowance is shared
across the account's Workers, including photo/OTP traffic. Exceeding a quota may
cause failed requests; it does not authorize an upgrade. If the dashboard/CLI
asks for payment or a paid plan, stop.

This is a Free-compatible **configuration candidate**, not certification of
reliable Free execution. See [BOOKING_WORKER_FREE.md](./BOOKING_WORKER_FREE.md)
for cold/warm local CPU measurements, methodology limits and the release decision.
Network waiting is not CPU time. No authentication, authorization, transaction,
lock, overlap check or idempotency safeguard was removed to chase a timing target.

Firestore reads/writes, retries, Auth quotas, readiness probes, existing photo/R2,
EAS and Play costs/quotas remain separate. No Firebase billing upgrade, deployed
Cloud Function, D1, Durable Object, KV or paid geocoding is required by this adapter.
Do not promise zero cost: an overlap attempt may read up to 1002 matching jobs,
and retries repeat reads. Readiness can add one Firestore read per isolate per
minute when polled (roughly 1440/day continuously); global scaling adds isolates.
See [pricing](https://developers.cloudflare.com/workers/platform/pricing/) and
[limits](https://developers.cloudflare.com/workers/platform/limits/).

## Local installation and checks — no remote deployment

Run from the repository root in PowerShell (Node 22; Java and Firebase CLI for
the emulator). All integration mutations are confined to the loopback demo project:

```powershell
Set-Location C:\Users\WW\Desktop\servicepilot-mobile
Push-Location .\booking-worker
npm.cmd ci
npm.cmd run check
npm.cmd test
npm.cmd run build  # Wrangler --dry-run, no upload
Pop-Location
npm.cmd --prefix functions run build
$env:DEBUG = '' # Firebase debug namespaces must not dump inherited environment
firebase.cmd emulators:exec --project demo-servicepilot-review-author --config firebase.workflow-test.json --only auth,firestore 'npm --prefix booking-worker run test:emulator'
node --test scripts/tests/release-readiness.test.mjs scripts/tests/booking-transport.test.mjs
# Existing Node engine regression (separate clean demo emulator session):
firebase.cmd emulators:exec --project demo-servicepilot-review-author --config firebase.workflow-test.json --only auth,firestore 'node --test scripts/tests/scheduling-emulator.test.mjs'
npm.cmd run release:check:static
node .\scripts\check-release-review.mjs
```

The runtime test uses real local workerd, cryptographically signed synthetic
Firebase JWTs and intercepted Google responses. The REST integration suite uses
an actual local Firestore emulator and independent adapters; its Auth port is a
test stub. These complementary tests do not establish live Google IAM, deployed
Cloudflare CPU/latency or real-device success. Never use `--remote` for local tests.

For optional **read-only real readiness**, provide an approved dedicated JSON in
ignored `secrets/booking-worker-service-account.json`, then create local secrets
without printing their values:

```powershell
$bookingCredentialPath = Join-Path $PWD 'secrets\booking-worker-service-account.json'
$bookingCredential = Get-Content -Raw -LiteralPath $bookingCredentialPath | ConvertFrom-Json
if ($bookingCredential.project_id -ne 'servicepilot-756d9' -or $bookingCredential.client_email -notmatch '^servicepilot-booking(?:-[a-z0-9]+)*@servicepilot-756d9\.iam\.gserviceaccount\.com$') { throw 'Dedicated booking credential required.' }
$bookingVars = @(
  'BOOKING_SERVICE_ACCOUNT_EMAIL=' + ($bookingCredential.client_email | ConvertTo-Json -Compress)
  'BOOKING_SERVICE_ACCOUNT_PRIVATE_KEY=' + ($bookingCredential.private_key | ConvertTo-Json -Compress)
)
$bookingVars | Set-Content -LiteralPath .\booking-worker\.dev.vars -Encoding utf8
Remove-Variable bookingCredential, bookingVars
Push-Location .\booking-worker
npm.cmd run dev  # localhost:8791; normal routes use real Firebase, do not POST real bookings automatically
```

In another shell, GET `http://127.0.0.1:8791/healthz` and `/readyz` with
`Invoke-RestMethod`. Local HTTP is solely development loopback; do not ship it.
Without credentials, liveness is 200 and readiness is 503. `.dev.vars` and secrets
are ignored by Git; all booking-worker files are excluded from the EAS archive.
No credentials were installed by this task. Do not upload the JSON as an asset.

## Health/readiness and rollout — commands prepared, NOT executed

`GET /healthz` is liveness only, `{status:"ok"}`. `GET /readyz` returns 200 ready or
503 unavailable after bounded Auth lookup of a reserved nonexistent UID and one
Firestore `_runtime_health/booking` read. Nothing is written or returned from
these records. Results are cached/single-flight for 60 seconds per identity in
an isolate, with a four-second response bound. Neither a 401 nor readiness proves
write IAM, indexes or authenticated booking acceptance. An owner should run the
existing read-only booking access checker with the **new** credential before use.

Only after owner approval of review, credentials and IAM prerequisites, and a
resolved Free-plan reliability gate (no paid activation is authorized):

```powershell
Push-Location .\booking-worker
npx.cmd wrangler login
# Confirm the owner-approved Cloudflare account; DO NOT use photo secrets.
npm.cmd run deploy  # first deployment safely fails readiness without secrets
$bookingCredentialPath = Join-Path (Split-Path $PWD -Parent) 'secrets\booking-worker-service-account.json'
$bookingCredential = Get-Content -Raw -LiteralPath $bookingCredentialPath | ConvertFrom-Json
if ($bookingCredential.project_id -ne 'servicepilot-756d9' -or $bookingCredential.client_email -notmatch '^servicepilot-booking(?:-[a-z0-9]+)*@servicepilot-756d9\.iam\.gserviceaccount\.com$') { throw 'Dedicated booking credential required.' }
$bookingCredential.client_email | npx.cmd wrangler secret put BOOKING_SERVICE_ACCOUNT_EMAIL
$bookingCredential.private_key | npx.cmd wrangler secret put BOOKING_SERVICE_ACCOUNT_PRIVATE_KEY
Remove-Variable bookingCredential
Pop-Location
$bookingOrigin = Read-Host 'Actual permanent booking Worker HTTPS origin from Wrangler'
Invoke-RestMethod "$bookingOrigin/healthz"
Invoke-RestMethod "$bookingOrigin/readyz"
```

Wrangler secret commands create new remote versions; none were run here. Avoid
recording terminal sessions/pipeline input. Key rotation uses the same dedicated
secret names. Roll back through reviewed Worker versions with `wrangler rollback`
only after confirming the selected version's code/secrets compatibility. Never
relax Rules/auth or remove database locks as a rollback workaround.

Then set `EXPO_PUBLIC_BOOKING_API_URL=$bookingOrigin` in **both** EAS preview and
production environments. Keep each existing `EXPO_PUBLIC_PHOTO_API_URL` value
unchanged; never enter booking secrets in EAS. See
[GOOGLE_PLAY_RELEASE.md](./GOOGLE_PLAY_RELEASE.md) for the exact EAS environment,
APK/AAB, signing, privacy/deletion/Data safety and physical-device release gates.
Retain `EXPO_PUBLIC_USE_FIREBASE_EMULATORS=0` and `SERVICEPILOT_RELEASE=1`.
Production guards reject localhost, demo and temporary trycloudflare origins.

Before releasing: use an owner-approved test request and two signed physical
devices to verify authenticated acceptance, overlap rejection, one notification,
same-action retry and network-loss reconciliation against the permanent origin.
No automatic real-booking mutation is authorized by this preparation task.

## Actual local validation

Passed locally: Worker typecheck and five REST/workerd tests (including a signed
200 acceptance acknowledgement with intercepted Google services, invalid token
rejection and the actual HTTP/2 stub probe); four Firestore REST/emulator tests
with the same 16-second production deadline; six unchanged Node scheduling tests;
and 15 availability/standalone HTTP runtime regressions in their proper demo setup.
The REST suite covers independent overlapping accepts, adjacent acceptance,
idempotent proposal/approval and legacy review, authorization boundaries and a
deliberately lost acknowledgement after a real local commit. Mobile and backend
TypeScript, focused lint, static release config and the 18/18 secret-exclusion
audit also passed. Thirteen release/transport regressions passed, bringing the
focused total to 43. Final Wrangler dry-run bundle: 82.57 KiB, gzip 21.89 KiB.
Initial runtime-date and missing-fixture failures were corrected and rerun; no
guard was bypassed. A repeated emulator launch refused occupied port 8387; the
final REST rerun passed using the existing loopback demo namespace with unique
fixtures, without terminating an unidentified process or clearing its records.
These tests do not establish a deployed host or physical-device acceptance.
