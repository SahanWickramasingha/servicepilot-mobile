# Real booking backend: verified local setup, 2026-10-31

For the subsequent dead-tunnel investigation, correlation tracing, ambiguous
acceptance reconciliation and improved startup commands, see
[BOOKING_ACCEPTANCE_DIAGNOSTICS.md](BOOKING_ACCEPTANCE_DIAGNOSTICS.md).

## Diagnosis and changes

`EXPO_PUBLIC_BOOKING_API_URL` was absent from both `.env.local` and the shell.
The mobile scheduler refused acceptance before making a network request. The
photo Worker is a separate API. Its URL/credentials do not configure booking.

The existing ignored `secrets/serviceAccountKey.json` is a valid project credential
for `firebase-adminsdk-fbsvc@servicepilot-756d9.iam.gserviceaccount.com`. It was
explicitly selected; its OAuth token and all six booking permissions were checked
independently. No new credential or IAM binding was needed. A separate least
privilege identity is preferable for permanent hosting; the existing Admin SDK
identity may have broader permissions.

Preflight no longer requires a new service account and an unknown photo identity
before using an existing project credential. Explicit path/email selection,
project/RSA validation, and rejection of known photo identities/files remain.
`Access` mode now performs real, read-only provider checks.

## Prerequisites

| Requirement | Current configuration / result |
| --- | --- |
| Node/dependencies | Node 22; root and functions dependencies installed. Restore with `npm.cmd ci` and `npm.cmd --prefix functions ci` if absent. |
| Credential | Existing ignored JSON above; set the two server variables in Terminal 1. Never place private keys/tokens in `EXPO_PUBLIC_*`. |
| Runtime IAM | All six permissions below granted; no remote policy change needed. |
| Google APIs | OAuth, Firebase Auth lookup, and Firestore read passed. |
| Scheduling indexes | Both technicianId/status and assignedTechnicianId/status queries passed with random nonexistent IDs and limit 1. No deployment needed. |
| Backend | Existing standalone entry, booking-only profile on loopback port 8790. SMTP and Admin Web origins unnecessary in this profile. |
| HTTPS | Official cloudflared installed in ignored `.firebase/review-config/booking-tools/`; temporary Quick Tunnel started. |
| Mobile | Verified HTTPS booking origin saved in `.env.local`; photo setting preserved exactly. Real Firebase enabled. |
| Devices | emulator-5554 and emulator-5556 running; both Expo Go launch intents succeeded using one Metro. |

No credential/IAM/index prerequisites remain missing for this local setup.
Internet access, backend and tunnel processes must stay available. A permanent
production HTTPS host remains a separate operator task. Quick Tunnels are a
development connection and change their URL on restart.

Runtime permissions: `datastore.databases.get`, `datastore.entities.get`,
`datastore.entities.list`, `datastore.entities.create`, `datastore.entities.update`,
`firebaseauth.users.get`. The review-only `booking-runtime.role.yaml` was not
applied. The permission check uses Google's read-only
[testIamPermissions API](https://docs.cloud.google.com/resource-manager/reference/rest/v1/projects/testIamPermissions).
No photo identity or permissions were changed.

## Exact PowerShell commands

Do not start a duplicate listener if the current server/tunnel is still running.
Use three terminals; Ctrl+C stops each foreground process. These commands never
create or accept a booking.

Terminal 1, in a fresh shell without inherited Firebase emulator host variables:

```powershell
cd C:\Users\WW\Desktop\servicepilot-mobile
$env:SERVICEPILOT_BOOKING_CREDENTIALS = (Resolve-Path .\secrets\serviceAccountKey.json).Path
$env:SERVICEPILOT_BOOKING_SERVICE_ACCOUNT = 'firebase-adminsdk-fbsvc@servicepilot-756d9.iam.gserviceaccount.com'
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-booking-real.ps1 -Mode Access
if ($LASTEXITCODE -ne 0) { throw 'Resolve the access check before starting.' }
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-booking-real.ps1 -Mode Backend
```

Access requests an OAuth token (never prints it), checks the six permissions,
looks up a random nonexistent Auth UID, reads a random nonexistent request and
runs both bounded scheduling queries. It makes no writes and never calls schedule
change. Offline metadata inspection remains available as `-Mode Check`.

Terminal 2:

```powershell
cd C:\Users\WW\Desktop\servicepilot-mobile
& .\.firebase\review-config\booking-tools\cloudflared.exe tunnel --url http://127.0.0.1:8790 --no-autoupdate --protocol http2
```

If restoring tools on a different checkout, download first:

```powershell
$bookingTools = Join-Path $PWD '.firebase/review-config/booking-tools'
New-Item -ItemType Directory -Force -Path $bookingTools > $null
Invoke-WebRequest -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile "$bookingTools/cloudflared.exe"
```

Keep the tunnel running. It prints a new random HTTPS origin each start. This
creates no Worker deployment, DNS change or remote IAM/billing configuration.
Traffic crosses Cloudflare. Firebase tokens and authoritative participant checks
still protect scheduling. TLS validation remains enabled; no browser login
challenge is added. See [Cloudflare Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/).

Terminal 3, after opening both Android emulators:

```powershell
cd C:\Users\WW\Desktop\servicepilot-mobile
$bookingHttpsOrigin = Read-Host 'Paste the actual HTTPS origin printed by cloudflared'
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-booking-real.ps1 -Mode Probe -BookingApiUrl $bookingHttpsOrigin
if ($LASTEXITCODE -ne 0) { throw 'Resolve HTTPS connectivity before starting mobile.' }
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-booking-real.ps1 -Mode Mobile -BookingApiUrl $bookingHttpsOrigin
```

Mobile restarts only this project's Metro, disables Firebase emulators, clears
credential path variables from Metro's environment and cold-starts both apps
without clearing account storage. The photo URL stays intact. For normal launches
afterward, update only `EXPO_PUBLIC_BOOKING_API_URL` in `.env.local` to the new
origin and restart Metro. Do not append `/v1/bookings/schedule`.

Optional non-mutating device verification after both apps load:

```powershell
$env:EXPO_PUBLIC_BOOKING_API_URL = $bookingHttpsOrigin
node .\scripts\probe-booking-android.mjs
```

This connects to the two local Expo runtimes through Metro's debugger and submits
only `{}` without Authorization. It never reads Firebase tokens or account state.
Both device network stacks must return schedule 401 with `unauthenticated`.

## Verification

Real OAuth, all six permissions, Auth lookup and Firestore/index queries passed.
The booking-only server started on 8790. The public HTTPS probe returned schedule
401 and all admin/account routes 404. Both apps loaded through one Metro server;
the device probe returned HTTPS 401/unauthenticated from each Android runtime.
Functions build, focused booking TypeScript and 14 setup/transport/policy/scheduling
tests passed. The scheduling service was not changed: authorization, overlap
queries, transactional locks and deterministic notification IDs remain intact.

No real acceptance was submitted. This does not establish successful acceptance
taps. No booking, user or notification was modified; no commit, push, deployment,
remote IAM or billing change was made.
