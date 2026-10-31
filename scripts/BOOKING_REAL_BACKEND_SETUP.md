# Local standalone booking server — real servicepilot-756d9

**Superseded setup status:** see [BOOKING_REAL_READY.md](BOOKING_REAL_READY.md)
for the verified existing credential, read-only Access check and exact restart
commands. The missing-input observations and dedicated-identity requirement below
describe the earlier inspection, not the current runnable setup.

## Implemented server profile

The existing `dispatcher-main.ts` now accepts `DISPATCHER_SERVICES=booking`.
It runs the existing scheduling service at `POST /v1/bookings/schedule`, with
dispatcher creation/resend and account-lifecycle routes unmounted (POST -> 404).
`all` remains the default and preserves the combined Admin Web backend. Unknown
values fail startup. Authentication, authoritative request ownership, eligibility,
availability, bounded overlap queries, transaction locks and deterministic notices
in `booking-schedule.service.ts` were not changed.

`start-booking-real.ps1` builds/runs that same standalone entry in production
Firebase mode, on `127.0.0.1:8790`, with explicitly selected credentials and no
browser origins. It does not seed, migrate or test real bookings. Demo port 8789
is separate. No required Cloud Function or deployed backend is introduced.

## Inspection and missing prerequisites

- `.env.local` has the photo URL and no booking URL. Neither values nor file
  contents were printed or rewritten.
- No booking credential/identity is selected in the task shell. Generic
  `GOOGLE_APPLICATION_CREDENTIALS` and standard gcloud user ADC are absent.
- One ignored `secrets/serviceAccountKey.json` exists for
  `firebase-adminsdk-fbsvc@servicepilot-756d9.iam.gserviceaccount.com`. Only
  type/project/identity metadata was inspected. Its intended reuse and IAM are
  unverified; it was not used to obtain tokens, query IAM or access Firebase.
- The photo Worker `.dev.vars` files and its identity variable are absent locally.
  Its README names the intended `servicepilot-photo-worker` service account, but
  deployed secrets/IAM were not inspected. Supply the actual photo account email
  for comparison, never its key. Its permissions must not change.
- No SMTP/admin-origin settings, gcloud executable or cloudflared executable were
  found in the task environment. No HTTPS tunnel/proxy was started.

Required inputs are an approved separate booking service-account JSON for this
project, its expected email, the actual photo Worker email for identity separation,
and a trusted HTTPS proxy/tunnel URL. A generic Admin credential is not selected
automatically. The operator must establish that a selected credential is approved
for this use; this task does not provision identities, keys or IAM bindings.

`booking-real-preflight.mjs` is offline: checks metadata, RSA key parsing and
distinct identity, hides credential contents, rejects photo-directory credential
paths and known photo principals, and never requests a token. Metadata validation
does not establish active credentials or effective IAM. Server credentials stay
out of Expo public variables and the Metro child environment.

## Exact minimum IAM

These permissions follow the inspected booking code and Google's
[Firestore API permission mapping](https://firebase.google.com/docs/firestore/security/iam#required_permissions_for_api_methods)
and [Auth API permissions](https://cloud.google.com/identity-platform/docs/access-control#api_permissions).

| Permission | Runtime use |
| --- | --- |
| `datastore.databases.get` | Begin/rollback transactions |
| `datastore.entities.get` | Read requests, participants, map projection and lock |
| `datastore.entities.list` | Bounded active-reservation queries |
| `datastore.entities.create` | New deterministic notifications and initial locks |
| `datastore.entities.update` | Atomic schedule/status/lock/notification updates |
| `firebaseauth.users.get` | Revocation/disabled-user lookup for `verifyIdToken(token, true)` |

Review-only custom role: [booking-runtime.role.yaml](booking-runtime.role.yaml).
No role/binding commands are executed. Have the project administrator approve the
separate principal and scope its access to the intended project/default database.
This permission list is not a collection-level access policy; the server's
participant checks remain essential. Server libraries have privileged access;
see [Firestore server access](https://firebase.google.com/docs/firestore/security/rules-conditions#authentication).
The booking runtime needs no document deletion, Auth mutation, Storage, index
management, Owner/Editor/Firebase Admin role or signBlob permission. The local
service-account key signs its own OAuth assertions; no impersonation is added.

For comparison, combined `all` mode also uses `firebaseauth.users.create`,
`firebaseauth.users.update`, `firebaseauth.users.delete` (provisioning rollback),
`firebaseauth.users.sendEmail` (setup links), and `datastore.entities.delete`
(failed provisioning cleanup). Do not add these to the booking identity to enable
unmounted admin routes. SMTP permissions/credentials are separate from IAM.

## SMTP and startup settings

| Setting | Booking-only launcher | Default combined `all` |
| --- | --- | --- |
| `DISPATCHER_MODE` | `production` | Explicit real-data mode |
| `GOOGLE_CLOUD_PROJECT` | `servicepilot-756d9` | Explicit target |
| `GOOGLE_APPLICATION_CREDENTIALS` | Set from validated dedicated path | Operator ADC |
| `DISPATCHER_SERVICES` | `booking` | Omitted or `all` |
| `DISPATCHER_ADMIN_ORIGIN` | Omitted; no browser allowed | Required exact HTTPS Admin origin |
| `BOOKING_WEB_ORIGIN` | Omitted for native testing | Optional exact HTTPS browser origin |
| `DISPATCHER_SMTP_HOST` | Unused | Required SMTP host |
| `DISPATCHER_SMTP_PORT` | Unused | Required integer 1–65535 |
| `DISPATCHER_SMTP_USER` | Unused | Required SMTP login |
| `DISPATCHER_SMTP_PASSWORD` | Unused | Required server-only password |
| `DISPATCHER_SMTP_FROM` | Unused | Required sender without CR/LF |
| `DISPATCHER_BIND_ADDRESS` / `PORT` | `127.0.0.1` / `8790` | Existing loopback / 8789 defaults |

Booking acceptance writes Firestore notifications and sends no invitation email.
Booking-only mode does not mount the email/admin service, so SMTP is unnecessary.
Combined mode still requires all five SMTP values; 465 uses implicit TLS, other
ports require STARTTLS. No email delivery is faked in real mode.

Other prerequisites: Node 22, installed root/functions dependencies, network to
Google OAuth/certificate/Auth/Firestore APIs, an existing default Firestore
database and ready scheduling indexes. The manifest already has technicianId/status
and assignedTechnicianId/status reservation indexes; live readiness is unknown.
No API, Rules, index, IAM or billing configuration was changed.

## Exact remaining PowerShell commands

Use `C:\Users\WW\Desktop\servicepilot-mobile`. Values requested below must be
supplied by the operator, not invented. Keep approved credentials outside source
control (`secrets/` is ignored). Do not paste private keys/passwords/tokens in chat.

Terminal 1 — select approved server credentials, check, then start:

```powershell
cd C:\Users\WW\Desktop\servicepilot-mobile
$env:SERVICEPILOT_BOOKING_CREDENTIALS = Read-Host 'Absolute path to approved separate booking service-account JSON'
$env:SERVICEPILOT_BOOKING_SERVICE_ACCOUNT = Read-Host 'Approved booking service-account email'
$env:SERVICEPILOT_PHOTO_WORKER_SERVICE_ACCOUNT = Read-Host 'Actual photo Worker service-account email (no key)'
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/start-booking-real.ps1 -Mode Check
if ($LASTEXITCODE -eq 0) {
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/start-booking-real.ps1 -Mode Backend
}
```

Use a fresh terminal without Firebase emulator host variables; Backend rejects
inherited emulator hosts. The project is never connected to emulators. Missing
functions dependencies can be installed with `npm.cmd --prefix functions ci`.
No credential file is automatically copied or selected from the photo setup.

Terminal 2 — use an approved HTTPS reverse proxy, or an operator-approved temporary
development tunnel. Since `cloudflared` is absent here, these prepared commands
download the standalone Windows x64 binary from Cloudflare's official release
link into the ignored local tools directory, then run it. They were not executed.
See [Cloudflare's downloads](https://developers.cloudflare.com/tunnel/downloads/).

```powershell
cd C:\Users\WW\Desktop\servicepilot-mobile
$bookingTools = Join-Path $PWD '.firebase/review-config/booking-tools'
New-Item -ItemType Directory -Force -Path $bookingTools > $null
Invoke-WebRequest -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile "$bookingTools/cloudflared.exe"
& "$bookingTools/cloudflared.exe" tunnel --url http://127.0.0.1:8790
```

This command is prepared, **not executed here**. A Quick Tunnel supplies a trusted
public HTTPS origin forwarding to the local server. Traffic passes through
Cloudflare; use a proxy/provider approved for real-account testing. There is no
Worker deployment, DNS edit or Firebase/billing change in this command. Anyone
with the URL can reach the HTTP boundary; actions still require verified Firebase
tokens and participant eligibility. Do not disable TLS verification or add an
interactive browser-only login in front of a native API. The random URL changes
when restarted; Quick Tunnels are development-only, with no uptime guarantee.
See [Cloudflare's instructions](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/).

Terminal 3 — verify transport without real tokens/bookings, then start mobile:

```powershell
cd C:\Users\WW\Desktop\servicepilot-mobile
$bookingHttpsOrigin = Read-Host 'Paste the actual approved HTTPS origin printed by the proxy/tunnel'
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/start-booking-real.ps1 -Mode Probe -BookingApiUrl $bookingHttpsOrigin
# Open both Android emulators. Continue only if Probe succeeds:
if ($LASTEXITCODE -eq 0) {
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/start-booking-real.ps1 -Mode Mobile -BookingApiUrl $bookingHttpsOrigin
}
```

Probe sends only `{}` with no token and expects schedule -> 401, all admin routes
-> 404. It cannot create/accept a booking or establish IAM. Without a supplied or
inherited booking URL, Probe checks the loopback hop on 8790 instead:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/start-booking-real.ps1 -Mode Probe
```

Mobile mode requires the actual HTTPS origin; HTTP, URL credentials, paths, queries
and fragments are rejected. It passes the origin process-locally to
`EXPO_PUBLIC_BOOKING_API_URL`, disables Firebase emulators, clears server credential
paths from Metro's environment, restarts only this project's Metro and cold-starts
both apps. `.env.local` and `EXPO_PUBLIC_PHOTO_API_URL` remain intact. No login or
booking action is automated. The app appends `/v1/bookings/schedule`.

For persistence, later add only `EXPO_PUBLIC_BOOKING_API_URL=<actual HTTPS origin>`
to the existing `.env.local` without replacing the photo line, then restart Metro.
No fake URL is written by this task. A trusted public HTTPS certificate avoids
Android self-signed CA trust problems; TLS validation is not weakened.

## Verification limits

Setup tests generate synthetic credentials and use a nonexistent project to
exercise the actual production-mode entry without Firebase calls. They verify
missing-token rejection, disabled admin routes, disallowed browser origins,
credential isolation/safe errors, HTTPS validation and combined SMTP requirements.
Existing dispatcher regression tests use only disposable emulator records.

No real token was obtained or real Firebase record accessed with the existing key;
no real booking was created or accepted. Real-project IAM, index readiness,
HTTPS tunnel connectivity and two-device acceptance remain unverified until the
missing inputs are supplied. Build/probe success alone is not acceptance success.
No commit, push, deployment, remote IAM or billing change was performed.

Checks actually run in this follow-up:

- `npm.cmd --prefix functions run build`: passed.
- `node scripts/check-booking-types.mjs`: passed.
- `node --test --test-concurrency=1 --test-timeout=30000 scripts/tests/booking-real-setup.test.mjs scripts/tests/booking-transport.test.mjs scripts/tests/booking-policy.test.mjs scripts/tests/scheduling.test.mjs`: 14 passed.
- `dispatcher-provisioning.test.mjs` on an isolated `demo-servicepilot-dispatcher`
  Auth/Firestore emulator using `firebase.workflow-test.json`: 16 passed, script exit 0.
  The first attempt against the already-running other demo project failed its
  Auth setup (`auth/user-not-found`); rerunning with the correct isolated project
  resolved it. No production credential was used. The orphaned test Firestore
  runtime was identified and terminated after the CLI shutdown stalled.
- Focused functions ESLint on dispatcher-main/server, focused root ESLint on the
  new JS helpers/tests, both PowerShell parsers, and `git diff --check`: passed.
- `start-booking-real.ps1 -Mode Check`: correctly exited 1 for missing approved
  booking credential path/email and actual photo identity comparison. No server
  was started against real data.

Repository-wide baseline checks from the older rollout guide were not repeated;
no unrelated source fixes were made. The photo env file and existing ignored key
were read for metadata only and left unchanged.
