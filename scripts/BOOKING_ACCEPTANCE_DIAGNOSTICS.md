# Acceptance runtime investigation — 2026-10-31

## Proven failure before changes

The current `.env.local` origin and served Android bundle both contained
`https://kate-brooklyn-ecology-yacht.trycloudflare.com`; there was no shell override
in the diagnostic shell. Node's real HTTPS request failed after 188 ms with
`TypeError: fetch failed`, underlying `ENOTFOUND`. Both Cloudflare DNS and Google
DNS independently returned status 3 (NXDOMAIN). The existing cloudflared process
had no active remote connection. The local booking server still returned JSON
401. This was a dead tunnel/DNS failure before backend Auth or transactions, not
evidence of a Firebase permission failure.

The earlier client collapsed fetch, JSON parsing and wrong-acknowledgement errors
into the same message. Token retrieval happened outside its timeout/diagnostics.
It did not reconcile a potentially committed acceptance after losing a response.

## Implemented safeguards

- Client correlation ID in `X-Booking-Correlation-ID`, safe bounded diagnostic
  ring and stage/duration/status/content-type/exception/abort logging. No token,
  UID, request payload, address or credential is logged.
- Server echoes the validated correlation ID and traces auth, transaction, commit,
  response and disconnect, including sanitized provider codes. Request correlation
  uses a SHA-256 request tag instead of a raw request ID. Trace-only changes leave
  authoritative account/participant/approval/availability checks, overlap queries,
  technician transaction locks and deterministic notification IDs intact.
- Token retrieval is bounded to 10 seconds; network/response remains 20 seconds.
  On an ambiguous acceptance result, read the server's booking once (8-second
  bound). Report success only for this unchanged technician's authoritative
  version-1 accepted booking. No fallback write or automatic repeat POST occurs.
  A still-pending booking remains unknown: a late transaction may yet commit, and
  the same user retry remains protected by existing server idempotency.
- Definitive 4xx responses remain failures and cannot be reconciled into success.
  HTML proxy responses, malformed JSON, lost acknowledgements and 5xx outcomes
  are treated as potentially ambiguous.
- The real mobile launcher prefers `.env.local` over stale shell values unless an
  explicit parameter is supplied. Both local and HTTPS readiness checks must pass
  before it replaces Metro or opens apps. Metro remains on 8081. ADB stderr is
  displayed without treating a successful native warning as failure; exit codes
  and actual device state determine success.
- Managed tunnel startup logs its lifecycle and verifies DNS/TLS/booking-only
  responses before updating only the booking env line. Other settings, including
  `EXPO_PUBLIC_PHOTO_API_URL`, are preserved. The tunnel is temporary and must stay
  running; readiness does not guarantee permanent availability.

## Current verification / manual gate

The backend was rebuilt and its identified process alone restarted. The dead
identified tunnel alone was stopped; a new verified tunnel was started. Both
actual Android diagnostic rings reported the new origin, project
`servicepilot-756d9`, and `emulator:false`. The served bundle was HTTP 200 and
contained the same origin/diagnostic code. Both actual Android network stacks
reached HTTPS and returned the expected unauthenticated JSON 401.

A bounded read-only baseline found one pending request with zero acceptance
notifications. `observe-booking-runtime.mjs` was started before asking the user
to manually tap Accept. No authenticated scheduling action was automated.
End-to-end acceptance is pending that tap and the resulting correlated trace.
The 401 probes are transport checks, not acceptance verification.

Backend logs: `.firebase/review-config/real-booking/backend.out.log` and
`backend.err.log`. Tunnel process/origin/log path:
`.firebase/review-config/real-booking/tunnel-state.json`. Client safe trace:
`.firebase/review-config/real-booking/client-trace.jsonl`. Baseline IDs/counts stay
only in ignored local `acceptance-baseline.json`; no personal payloads are saved.

## Repeatable startup (three PowerShell terminals)

Each terminal starts at `C:\Users\WW\Desktop\servicepilot-mobile`.
Do not start a duplicate backend/tunnel while the current instances are running.

Terminal 1, backend with explicitly selected existing project credential:

```powershell
$env:SERVICEPILOT_BOOKING_CREDENTIALS = (Resolve-Path .\secrets\serviceAccountKey.json).Path
$env:SERVICEPILOT_BOOKING_SERVICE_ACCOUNT = 'firebase-adminsdk-fbsvc@servicepilot-756d9.iam.gserviceaccount.com'
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-booking-real.ps1 -Mode Backend
```

Terminal 2, new tunnel with readiness and env persistence:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-booking-tunnel.ps1
```

Terminal 3, after both emulators are open:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\run-servicepilot-real.ps1
# After apps load, observe only sanitized runtime diagnostics:
node .\scripts\observe-booking-runtime.mjs 300
```

Before a manual test, in Terminal 1 or another explicitly configured server shell:

```powershell
node .\scripts\check-booking-acceptance.mjs baseline
# User taps Accept; then inspect without sending another scheduling request:
node .\scripts\check-booking-acceptance.mjs verify
```

`verify` compares existing booking status and acceptance notification counts;
optional third argument selects the request tag from the server trace. It does
not mutate data. No commit, push, deployment, IAM or billing change was made.

## Changed files and checks

Client: `src/services/bookingSchedule.service.ts`. Backend tracing:
`functions/src/dispatcher-server.ts` and `functions/src/services/booking-schedule.service.ts`.
Launch/readiness: `scripts/run-servicepilot-real.ps1`, `scripts/start-booking-real.ps1`,
`scripts/start-booking-tunnel.ps1`, `scripts/save-booking-origin.mjs`.
Read-only diagnostics: `scripts/observe-booking-runtime.mjs`,
`scripts/check-booking-acceptance.mjs`. Regressions/adapters:
`scripts/tests/booking-transport.test.mjs`, `scripts/tests/booking-launcher.test.mjs`,
`scripts/tests/booking-real-setup.test.mjs`, `scripts/tests/booking-runtime.test.mjs`.
Documentation: this file and a link from `BOOKING_REAL_READY.md`.
Ignored configuration: only the booking URL line in `.env.local`.

Functions build, focused booking TypeScript, client/backend lint, PowerShell
parsing and diff whitespace checks passed. Six isolated demo-emulator scheduling
tests passed, including concurrent overlap, idempotency, reschedule races, legacy
schedule review, direct-client denial and session cleanup. An initial run exposed
missing optional metadata in an older adapter; this was fixed and the full
emulator suite rerun successfully. The launcher regression initially had a nested
shell quoting error; encoded test input fixed it, and stderr/nonzero-exit checks
passed. No unrelated baseline fixes were made.

Last read-only real-project check while awaiting the manual tap: the existing
request remained `requested`, version 1, with 0 acceptance notifications before
and after, and no deterministic acceptance notification. Acceptance has not yet
been verified.

The Firebase CLI inherited verbose DEBUG logging on the first emulator run and
unexpectedly printed environment values. Verbose logging was disabled for reruns,
environment-dump lines were removed from the local debug log, and absence of
remaining dump lines was checked. An exposed environment credential should be
rotated by its owner; no remote credential changes were made here.
