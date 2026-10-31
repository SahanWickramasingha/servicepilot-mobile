# Runnable local Android booking backend

## One-command startup

Open both Android emulators, then paste this in VS Code's PowerShell terminal:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\Users\WW\Desktop\servicepilot-mobile\scripts\run-booking-demo.ps1
```

This runs the steps below automatically, checks acceptance, restarts only a Metro
whose manifest identifies this workspace, and opens both apps. Services run in
the background with logs under `.firebase/review-config/booking-demo/launcher`.
It uses disposable demo data and preserves the photo endpoint. Wait for `READY`.

## Diagnosis (2026-10-30)

`EXPO_PUBLIC_BOOKING_API_URL` was absent from `.env.local` and the shell. It was
not an invalid URL or a failed backend call: the client stopped before HTTP.
The photo URL was present and is preserved. No standalone backend was listening
on port 8789 initially. A Metro server for this repository was already running
on 8081 and needed a restart with the demo configuration.

`functions/src/dispatcher-main.ts` mounts the existing scheduler through
`dispatcher-server.ts` at `POST /v1/bookings/schedule`. It is not exported from
the Cloud Functions index. No deployed scheduler URL is identifiable in the local
configuration or rollout guides. This does **not** establish that no remote host
exists; remote hosting/configuration was not inspected or modified.

## Data boundary

These commands explicitly select **disposable Firebase emulator data**, project
`demo-servicepilot-review-author`. They do not use `servicepilot-756d9` records,
production accounts, service-account keys, SMTP or the photo Worker's identity.
Existing real requests cannot be accepted in this demo. Restart both apps when
switching environments; production credentials are not demo credentials.

All mobile settings are scoped to the launcher process. `.env.local` and
`EXPO_PUBLIC_PHOTO_API_URL` are not rewritten. Expo still loads the existing photo
configuration; this does not mean the external photo service accepts demo tokens.
No photo permissions were changed. Emulator data disappears when its services
stop unless separately exported. No export/import or migration is performed.

## Exact PowerShell startup

Use repository root `C:\Users\WW\Desktop\servicepilot-mobile` in each terminal.
Node 22, Java 21+, Firebase CLI and installed root/functions dependencies are
required. This checkout already had them and cached emulator runtimes. If dependencies
are missing, run `npm.cmd ci` and `npm.cmd --prefix functions ci` first.

`-ExecutionPolicy Bypass` applies only to each launched PowerShell process; this
machine's default policy blocked local `.ps1` files. It does not change machine
policy. Keep terminals 1, 2 and 4 running. Do not start duplicate instances if
these services are already running from the current verification session.

Terminal 1 — Firebase Auth 9197, Firestore 8187 and Storage 9297:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/start-booking-demo.ps1 -Mode Emulators
```

Wait for “All emulators ready”. Terminal 2 — existing standalone Node server:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/start-booking-demo.ps1 -Mode Backend
```

Wait for server ready, mode emulator, port 8789. Terminal 3 — seed, then verify:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/start-booking-demo.ps1 -Mode Seed
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/start-booking-demo.ps1 -Mode Verify
```

Seed preserves existing accounts, requests and manual availability. Fresh seeds
no longer automatically add a legacy job with unknown duration, which would
deliberately block acceptance. If `booking-legacy-assigned` already exists, the
seed warns: review its explicit schedule in the technician UI before accepting.
To deliberately add that compatibility fixture, set the loopback Auth/Firestore
variables as in the launcher and run `node scripts/seed-booking-emulator.mjs --include-legacy`.
The existing schedule guard is preserved; no job is automatically rewritten.

Terminal 4 — stop the old Metro using Ctrl+C in its terminal, then start one Metro:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/start-booking-demo.ps1 -Mode Mobile
```

This checks the backend's unauthenticated route, sets explicit demo mode and
`EXPO_PUBLIC_BOOKING_API_URL=http://127.0.0.1:8789`, then starts Metro on 8081 with
a clean cache and `EXPO_OFFLINE=1` (avoids an Expo dependency-metadata network failure
observed here). Offline Metro does not disable the app's local HTTP requests.
If 8081 is occupied, stop that Metro first; do not accept an alternative port.

Terminal 5 — both Android emulators, one Metro:

```powershell
$bookingAdb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
& $bookingAdb devices -l
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/start-booking-demo.ps1 -Mode Connect
```

Default serials are `emulator-5554` and `emulator-5556`. The launcher reverses
8081, 8187, 9197, 9297 and 8789 on each, cold-starts Expo Go and opens
`exp://127.0.0.1:8081`. For different serials, invoke from a process permitting
scripts: `& ./scripts/start-booking-demo.ps1 -Mode Connect -Devices @('serial-a','serial-b')`.
Use SDK-54-compatible Expo Go. No Functions emulator is needed for acceptance.

## Device acceptance scenario

1. Technician device: `booking-tech@example.test`. Customer device:
   `booking-customer-a@example.test`. Both disposable accounts use
   `Only-for-booking-emulator-42`. Set technician availability **Available**;
   the seed preserves existing manual settings and new technicians start offline.
2. Customer selects Booking Technician and creates a request with a future
   Colombo date/time and explicit duration. Technician opens it and accepts.
3. Confirm accepted status and one customer acceptance notification. Retry must
   not duplicate the notification. A second overlapping request must fail, and
   a request starting exactly at the previous end may succeed.
4. Stop/restart backend to verify failure/retry behaviour. Never bypass scheduler
   verification with a direct Firestore acceptance write. Review any legacy jobs
   explicitly rather than guessing their duration.

## Verification and remaining limits

The new `booking-runtime.test.mjs` executes the **running standalone process**,
real emulator Auth and Firestore, and the actual mobile transport. It creates
unique disposable fixtures and cleans only those fixtures. It verifies missing/
invalid token rejection, foreign ownership denial, acceptance and reserved
interval, correct notification recipient, idempotent retry, overlap rejection,
revoked approval, disabled customer denial and adjacent acceptance.

Separate scheduling-emulator coverage verifies concurrent lock serialization,
reschedule races, explicit legacy review, cancellation/release, direct-client
acceptance denial and account-change cleanup. No backend domain checks were
weakened. Compilation and these tests do not establish successful taps in the UI.

For **existing project requests**, the remaining blocker is an operator-supplied
approved HTTPS standalone host and matching production mobile URL. Starting the
demo cannot fix a real account's pending request. A local server against real
Firebase would require separate authorized server credentials and production
SMTP configuration; none were sourced, reused or changed here. No remote
configuration, billing, deployment, commit or push was performed.

Checks performed in this follow-up:

- Functions TypeScript build: passed.
- `node scripts/check-booking-types.mjs`: passed.
- Booking transport, policy and scheduling unit tests: 9 passed.
- `scheduling-emulator.test.mjs`: 6 passed, including concurrent reservations and Rules denial.
- Launcher `-Mode Verify`: 1 real HTTP integration test passed with all assertions above.
- Focused ESLint on the seed and new runtime test, PowerShell parser and
  `git diff --check`: passed.
- Auth/Firestore/Storage emulators, backend 8789 and one Metro 8081 started.
  Both Android serials received all five adb reversals and Expo Go launch intents.
- Metro served the Android bundle with HTTP 200; its compiled code contains
  `http://127.0.0.1:8789`. The photo configuration loaded from the original env file.

Full technician/customer UI login, tapping Accept, photo upload, reviews and
notifications UI were not manually verified. Existing repository-wide TypeScript/
lint baseline failures recorded in the older rollout guide were not re-run for
these launcher/test-only changes. Firebase CLI MOTD network and Java deprecation/
metadata lookup warnings did not prevent the local emulator tests from passing.
