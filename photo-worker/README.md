# ServicePilot private photos

Local implementation only. Nothing in these instructions has been deployed or
provisioned. Do not run the cloud setup/deployment commands until explicitly
authorized. Never paste credentials into chat or commit `.dev.vars`/key files.

## Architecture

```text
Expo app -- Firebase ID token in Authorization header --> Photo Worker
  |                                                       |
  | booking/evidence transaction                          | private PHOTOS binding
  v                                                       v
Firestore <-- trusted photo_objects confirmations -------- R2
```

Firebase Auth, accounts, Firestore bookings, reviews, notifications, scheduling,
timer, notes, signature and Admin Web remain. No new Firebase Function is needed.
The existing `servicepilot-otp` Worker is not changed or reused for this service.

New request/before/after photos use **only R2**. There is no Firebase upload
fallback. Firestore retains strings in existing arrays (`imageUrls`,
`beforePhotos`, `afterPhotos`), with the provider/version encoded as
`r2:v1:<64-hex-server-id>`. Old Firebase paths remain readable; no records/files
are bulk migrated. New legacy Firebase references cannot bypass confirmation.

The Worker chooses physical object keys only after authorization. New trusted
reservations carry `objectKeyVersion: 2` and use these separate prefixes:

| Purpose | R2 object key |
| --- | --- |
| Customer request | `photos/v1/customer-requests/<server-id>` |
| Technician before | `photos/v1/technician-before/<server-id>` |
| Technician after | `photos/v1/technician-after/<server-id>` |

Existing records without that internal version retain `photos/v1/<server-id>`
for upload retries, confirmation, viewing and cleanup. External `r2:v1:<id>`
references do not change. Clients cannot choose keys or the internal version;
neither is returned in API responses. R2 prefixes are generated object names,
so **no dashboard folders, object moves or reference migration are required**.

| Purpose | Count | Actual uploaded file limit | Format |
| --- | --- | --- | --- |
| Customer request | Optional 0–2 | strictly `< 2,000,000` bytes | JPEG/PNG/WebP |
| Technician before | 1–3 when saving the photo step | `<= 5,242,880` bytes (5 MiB) | processed JPEG |
| Technician after | 1–3 when saving the photo step | `<= 5,242,880` bytes (5 MiB) | processed JPEG |

Technician limits and existing picker JPEG processing are retained from the
previous implementation. Customer images are not compressed to evade their limit.
Zero-photo bookings never call the photo API, even with no API URL or R2 available.

## Authentication and trusted Firestore boundary

- `jose` verifies Firebase RS256 signatures, issuer, audience/project, expiry,
  subject, issued-at and authentication time. Google remote JWKS are cached for
  at most one hour; a missing kid refreshes subject to a 30-second cooldown.
  Key/network outages fail closed. There is no unsigned/emulator-token bypass.
- Every operation performs a current Firebase Auth `accounts:lookup` using the
  caller ID token. Missing/disabled/deleted users and `validSince` revocation are
  rejected. JWT verification alone is not treated as an account-state check.
- Firestore account status, lifecycle, approval, assignment and the project's
  numeric `sessionRevokedAt` policy are rechecked. Roles/UIDs in upload payloads
  are never accepted as authority. Local logout clears/aborts the app's work;
  logout alone does not globally revoke already issued Firebase tokens.
- Own profile, job, evidence and receipt authorization reads use the caller's
  Firebase ID token through Firestore REST, so project Rules still apply.
- A dedicated service account with the custom permissions in
  `firestore-role.yaml` uses short-lived OAuth tokens for trusted photo metadata,
  atomic cleanup snapshots and expiry queries. It uses Web Crypto/REST, **not
  firebase-admin**. OAuth tokens cache for at most 55 minutes and are never sent
  to mobile clients. No Auth-admin, Storage-admin, Editor or Owner role is needed.
- IAM permissions are database permissions, not collection-level isolation.
  Firestore Rules do not restrict this OAuth identity. Its code restricts every
  write to `photo_objects/<64-hex-id>`; protect and rotate its Worker secrets.
  This server identity is necessary because clients must not write their own
  confirmations and cleanup must serialize with booking/evidence commits.
- Clients cannot read, list or write `photo_objects`. Rules consult those records
  internally to require a confirmed, unexpired, correctly owned/scoped photo for
  a new reference. Existing saved references can be retained after expiry.

Customers may upload only before a request exists, under their own verified
booking attempt. Its attempt ID equals its request ID, fixing two upload slots.
Technicians need current approved assignment; before is allowed for
`accepted`/`assigned`/`in_progress`, after only `in_progress`. Completed photos
remain readable to eligible participants; completed evidence cannot be mutated.
Existing narrowly authorized super-admin viewing applies only to referenced job
photos; customer request photos do not gain an admin/public access grant.

## Upload lifecycle and cleanup

1. `POST /v1/photos` reserves a stable server-generated ID for actor/request/
   purpose/attempt/slot, byte size, MIME and SHA-256. Payloads are at most 2 KiB.
2. `PUT /v1/photos/:id` streams the actual body into the private R2 binding.
   Bytes are counted independently of Content-Length, signatures/MIME checked,
   and native incremental `crypto.DigestStream` verifies the complete digest.
   A one-byte barrier prevents R2 reaching its known length before upstream EOF
   and all validation. Transfers time out after 20 seconds; no full-image Worker
   buffering is used. Conditional puts prevent replacing an immutable object.
3. After R2 HEAD confirms size/type/association, a fresh account/job check and
   Firestore transaction mark the record confirmed. Only then can the client
   commit a booking/evidence reference through the existing transaction/rules.
4. Object success with metadata failure, lost responses and duplicate attempts
   replay the same ID. `POST /:id/finalize` reconciles an existing object. The app
   does one bounded reconciliation after a failed PUT. Failed saves retain inputs
   and selections; no success is displayed for unconfirmed photos.

IDs are stable within the mounted form/stage retry. Changing photo selections
before a booking changes the pre-booking intent. After a booking transaction was
attempted, its original ID/intent remain locked and receipt reconciliation comes
first. Never start a new form to retry an unknown committed result; inspect
Bookings after process termination. Drafts and submission state are memory-only.

Pending/unreferenced uploads expire after at most 24 hours (configurable down to
300 seconds). No automatic deletion runs from an uncertain mobile save. Explicit
DELETE and the scheduled cleanup first transactionally read the photo, request,
evidence and relevant account. Referenced objects and completed-job objects are
retained. A `deleting` tombstone blocks new client references before R2 deletion;
concurrent booking/evidence writes force a transaction retry or Rules denial.
Deletion retries are idempotent. `deleted` tombstones prevent resurrecting an
expired intent. There is no bulk delete or live migration script.

Cleanup pages only **three** expired metadata records per invocation, including
reservations with no object, using the default `expiresAt` ascending single-field
index and a private R2 cursor. Each Store instance caps Firestore RPCs at 36 to
leave headroom under Free Workers' subrequest limit. No new composite index is
needed. Deleted tombstones are retained; there is no document-history purge.

No cron is enabled by default. After separate approval, add a suitable schedule
to Wrangler, for example `"triggers": { "crons": ["*/15 * * * *"] }`, then deploy.
Capacity is three records/run; choose a reviewed frequency for expected volume
and monitor backlog/Firestore quotas. Local test trigger:
`npx.cmd wrangler dev --local --test-scheduled`, then request
`http://localhost:8787/__scheduled` **only against that local test server**.
No public production cleanup endpoint exists.

## Private viewing

`GET /v1/photos/:id` reauthorizes each request and streams private R2 bytes with
`Cache-Control: private, no-store` and `nosniff`. IDs are opaque references, not
object keys or public URLs. There are no signed links or token query parameters.
The React Native loader uses Authorization headers, then the existing in-memory
FileReader/data-URI image viewer. Firebase legacy paths use authenticated Firebase
bytes. Images/modal state clear on account changes; authorized viewing reloads
after navigation/restart. Already delivered bytes cannot be remotely recalled.

## Configuration

| Name | Where | Purpose |
| --- | --- | --- |
| `servicepilot-photos` | R2 bucket | Existing private bucket; keep r2.dev and public custom domains disabled |
| `PHOTOS` | Worker binding | R2 access without S3 keys |
| `PHOTO_RATE_LIMITER` | Worker binding, namespace `1001` | 30 operations/minute per actor and per source IP |
| `FIREBASE_PROJECT_ID` | Worker var | `servicepilot-756d9` |
| `FIREBASE_WEB_API_KEY` | Worker var | Public project API key permitted to call Identity Toolkit from Worker |
| `ALLOWED_ORIGINS` | Worker var | Comma-separated exact browser origins; empty works for native/no-Origin calls |
| `PENDING_TTL_SECONDS` | Worker var | 300–86400, default 86400 |
| `PHOTO_UPLOADS_ENABLED` | Worker var | `true`; set `false` to pause reservations/PUTs, retaining reads/finalize |
| `FIREBASE_SERVICE_ACCOUNT_EMAIL` | **Worker secret** | Dedicated least-privilege identity |
| `FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY` | **Worker secret** | PKCS8 signing key; never mobile/env public config |
| `EXPO_PUBLIC_PHOTO_API_URL` | Mobile `.env.local` | HTTPS Worker origin; no credentials, path/query or object URL |

An Android/referrer-restricted Firebase API key may not work from the Worker.
Use an appropriate project key restricted to required APIs; review any key changes
separately rather than broadly weakening the existing app key. No real keys are
included in examples. `.dev.vars` and `secrets/` are gitignored.

## Later setup and rollout — commands NOT executed

1. Use the existing private bucket `servicepilot-photos`; do not create another
   bucket. The user reports public access is disabled; this has not been checked
   remotely. Keep r2.dev and bucket custom domains disabled. Binding `PHOTOS`
   targets this bucket; the Worker itself is named `servicepilot-private-photos`.
2. Review the dedicated Firebase service account/custom IAM role. Example commands
   from the repository root (resource creation is a later authorized action):

```powershell
gcloud iam service-accounts create servicepilot-photo-worker --project servicepilot-756d9
gcloud iam roles create servicepilotPhotoMetadata --project servicepilot-756d9 --file photo-worker/firestore-role.yaml
gcloud projects add-iam-policy-binding servicepilot-756d9 --member="serviceAccount:servicepilot-photo-worker@servicepilot-756d9.iam.gserviceaccount.com" --role="projects/servicepilot-756d9/roles/servicepilotPhotoMetadata"
New-Item -ItemType Directory -Force secrets
gcloud iam service-accounts keys create secrets/servicepilot-photo-worker.json --iam-account=servicepilot-photo-worker@servicepilot-756d9.iam.gserviceaccount.com --project servicepilot-756d9
```

3. Set the public Worker vars in `wrangler.jsonc`, including a working public
   Firebase web API key. Select the correct Cloudflare account with `account_id`
   or `CLOUDFLARE_ACCOUNT_ID`. No credential belongs in this file.
4. Deploy compatible Firestore rules **before client rollout**. The previous live
   receipt denial was from older deployed rules without `booking_attempts`.
   R2 does not bypass that dependency. Preserve notification indexes; deploy them
   separately and wait for READY if missing. No index deployment is performed here.

```powershell
firebase.cmd deploy --only firestore:rules --project servicepilot-756d9 --config firebase.json
firebase.cmd deploy --only firestore:indexes --project servicepilot-756d9 --config firebase.json
```

5. In a separately authorized Cloudflare session, deploy the Worker/binding, then
   set its secrets from the local key file without printing their contents:

```powershell
Push-Location photo-worker
npm.cmd ci
npx.cmd wrangler login
npx.cmd wrangler deploy --var PHOTO_UPLOADS_ENABLED:false
$servicePilotPhotoCredentials = Get-Content -Raw -LiteralPath ../secrets/servicepilot-photo-worker.json | ConvertFrom-Json
if ($servicePilotPhotoCredentials.project_id -ne 'servicepilot-756d9') { throw 'Wrong credential project' }
$servicePilotPhotoCredentials.client_email | npx.cmd wrangler secret put FIREBASE_SERVICE_ACCOUNT_EMAIL
$servicePilotPhotoCredentials.private_key | npx.cmd wrangler secret put FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY
Remove-Variable servicePilotPhotoCredentials
Pop-Location
```

The Worker fails closed until secrets/configuration are complete. Initial uploads
remain paused. After configuration/rules checks, enable them for controlled device
validation with `npx.cmd wrangler deploy --var PHOTO_UPLOADS_ENABLED:true` from
this directory. Secret commands change the remote Worker and create deployments;
they are not local checks. No mobile URL is released to customers during setup.
Do not reuse the OTP Worker's secrets. Review/enable bounded cleanup scheduling
before sustained uploads.

6. Set `.env.local` from `.env.photos.example`, e.g.
   `EXPO_PUBLIC_PHOTO_API_URL=https://servicepilot-private-photos.<your-subdomain>.workers.dev`.
   Restart Metro (`npx.cmd expo start --clear`), then validate a staging rollout
   with two devices. Local HTTP is allowed only in development for localhost,
   127.0.0.1 or Android emulator host 10.0.2.2. Production requires HTTPS.
7. Deploy the prepared `storage.rules` separately if maintaining historical
   Firebase Storage: `firebase.cmd deploy --only storage --project servicepilot-756d9 --config firebase.json`.
   It makes request/job Firebase paths read-only, preserving review policy. A
   missing Firebase bucket does not block the new R2 flows; it still blocks
   review-photo uploads/legacy reads until separately resolved.

**Rollback:** keep the Worker origin, confirmations and restrictive Rules for
existing R2 references. Set `PHOTO_UPLOADS_ENABLED=false` and redeploy the Worker
to stop new reservations/uploads while allowing viewing and reconciliation.
Zero-photo bookings continue to use Firestore. Do not roll back to permissive
legacy write rules or automatically send failed R2 uploads to Firebase. Clearing
the mobile API URL would also disable viewing existing R2 photos, so avoid that
as an upload-only rollback. No bulk cleanup/migration is required.

## Local checks

Validated with Node 22.17. Install local dependencies only:

```powershell
npm.cmd ci
npm.cmd --prefix photo-worker ci
npm.cmd --prefix photo-worker run check
npm.cmd --prefix photo-worker test
npm.cmd --prefix photo-worker run build
```

`build` is explicitly `wrangler deploy --dry-run`; it bundles without deploying.
Tests use cryptographically signed test keys, mocked Google/Auth/Firestore, and
workerd's **local** R2 binding with external requests blocked. Firestore Rules are
tested against loopback demo emulators; see `scripts/R2_PHOTO_VALIDATION.md`.
`wrangler dev --local` uses the private local R2 binding. It does not magically
accept unsigned Firebase Auth Emulator tokens: no insecure runtime bypass exists.
Use the automated signed-key fixtures for fully isolated local tests. Real-token
staging setup requires separately authorized accounts/configuration.

## Remaining Firebase Storage dependencies and provider limits

- Review photos: unchanged `reviewPhotos.service.ts`/`review.service.ts`,
  `review_photos` Storage/Firestore policy, publication and photo viewer. They
  continue to require a usable Firebase Storage bucket. Review text/ratings and
  reviewer names are unaffected.
- Existing request/job Firebase paths: authenticated **read-only** compatibility;
  no automatic migration or delete. New scoped photo paths always use R2.
- Customer signatures: unchanged vector stroke data in Firestore `job_evidence`;
  **no Firebase Storage or R2 dependency**. Notes/timer/completion stay unchanged.

Official docs checked 2026-10-29: R2 Standard has 10 GB-month, 1M Class A and 10M
Class B monthly free usage, with free Internet egress; excess usage is billable.
R2 requires an account subscription/checkout. Workers Free currently allows
100,000 requests/day, 10 ms CPU/request, 128 MB memory and 50 subrequests/request.
Native hashing/streaming and explicit RPC/cleanup bounds reduce overhead, but
local tests do **not** prove a real deployment fits CPU/usage quotas or billing
readiness. Monitor staging before enabling production; no plan was upgraded.
Firestore/Auth usage also remains subject to the Firebase project's quotas.

Sources: [R2 setup](https://developers.cloudflare.com/r2/get-started/),
[R2 pricing](https://developers.cloudflare.com/r2/pricing/),
[Workers limits](https://developers.cloudflare.com/workers/platform/limits/),
[native streaming crypto](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/),
[Firebase token verification](https://firebase.google.com/docs/auth/admin/verify-id-tokens),
[Firestore REST authentication](https://firebase.google.com/docs/firestore/use-rest-api),
[Firestore IAM](https://firebase.google.com/docs/firestore/security/iam).
