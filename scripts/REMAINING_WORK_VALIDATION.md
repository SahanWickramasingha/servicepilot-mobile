# ServicePilot remaining tasks 1–6 — local implementation and validation

2026-10-23. Root AGENTS.md read; no nested instructions found. The initial working
tree had 12 modified tracked files and 4 untracked files. Those edits were preserved
and extended only where these tasks require. No reset/stash, commit, push, deployment,
billing change, production data access/write, migration or real push was performed.

## Status

| Task | Status | Scope and limits |
| --- | --- | --- |
| 1 Signature | Complete locally; native verification pending | Capture and preview share a canonical 320×180 SVG, explicit centered meet scaling, inverse touch transform and stroke inset. Layout changes begin a new stroke instead of connecting unrelated positions. |
| 2 Auth/location cleanup | Complete locally; native verification pending | Firebase before-identity middleware drains/revokes with OLD credentials and rejects an unconfirmed switch. Local lifecycle guards/caches still invalidate on identity change. Already-replaced external Auth events cancel locally without forbidden old-UID writes and disclose unconfirmed remote removal. |
| 3 Booking overlap | Policy explicitly approved; implemented locally | Approval arrived during this task. Trusted acceptance/reschedule approval serializes on a per-technician lock, checks active intervals and legacy unknowns, and commits booking/notification together. Final validation results below determine local completion. |
| 4 Android push | Blocked for actual implementation/delivery | No approval or host/build credentials were supplied for push. Concrete proposal and prerequisites: ANDROID_PUSH_DESIGN.md. No SDK, sender or real pushes added. In-app notifications remain operational. |
| 5 Notification history | Complete locally, with explicit scale limits | Recent/history queries and receipt joins use 20-item bounds and stable timestamp/document-ID cursors. Totals are checked across all eligible history on demand, not inferred from loaded pages. Mark all scans unloaded history in bounded pages. |
| 6 Final validation | Pending recorded run | Use the source-hash manifest described below. Historical 133/61 results are not reused. |

## Root causes and implementation

### Signature

Touch coordinates previously scaled X/Y independently while SVG used centered
aspect-preserving rendering. Capture now keeps the canonical aspect ratio and uses
the inverse SVG transform based on measured bounds. Local responder coordinates
need no safe-area or screen offset. Edge points are inset by half the stroke width.
Preview/reload uses the same canonical viewBox; there is no separate image-export
pipeline in this project. Existing saved strokes remain readable without rewriting.
Drawing locks only page scrolling until release/termination. Navigation, clear,
validation, private persistence, keyboard avoidance and safe-area behavior remain.
Tests cover multiple dimensions, letterboxing, edges and layout changes. They are
coordinate/component tests, not Android touch evidence.

### Auth and GPS

The previous post-Auth listener stopped local tracking after credentials had already
changed, when old-user cleanup could no longer be authorized. The singleton SDK
middleware now intercepts direct replacement and sign-out while old credentials
still exist. GPS acquisition/watch/heartbeat/pending writes stop immediately once
cleanup starts. Serialized OFF follows any in-flight location publication; a failed
confirmation blocks the switch with recoverable feedback. Ordinary logout and
confirmed administrative revocation retain their existing behavior.

An external Auth synchronization that has ALREADY replaced the user cannot be
rolled back or remotely cleaned using the new credentials. That fallback cancels
locally and displays an explicit residual-sharing warning; it never attempts an
old-account write as the new user. Existing participant proof documents are not
deleted or widened: every precise read still checks the authoritative request,
current account, sharing and freshness. Account-specific caches/UI/subscriptions
clear through the existing session infrastructure and lifecycle guards.

The freshness threshold remains 120 seconds. It restricts stale precise access and
distance, not document lifetime. A grey approximate historical marker can remain
until an authorized OFF write is confirmed. Offline messages now state that limit.
Reactivation/new login never opts into sharing automatically.

### Approved scheduling policy and authoritative boundary

- Duration is explicitly selected in positive whole minutes, without a default.
- Capacity is one reservation per technician for each overlapping [start,end)
  interval. Adjacent intervals are allowed; no travel buffer is invented.
- `accepted`, legacy `assigned`, and `in_progress` reserve time. `requested` and
  `pending` do not. Terminal cancellation/rejection/completion release reservations
  through the request status. No automatic expiry is introduced.
- Civil date/time is interpreted as Asia/Colombo, independently of device timezone.
- Customer proposes a new interval; technician approves before the original
  accepted reservation is swapped. Proposals are revisioned and exact retries are
  idempotent. New acceptance and approval both contend on the same transaction lock.
- Legacy missing intervals block new acceptance until explicitly reviewed by the
  owning technician. No times are inferred and no live records are migrated.

The existing standalone Node server exposes POST /v1/bookings/schedule. It verifies
Firebase tokens, revocation, authoritative active roles, approval, ownership and
availability. It does not give dispatchers assignment powers. Reads AND writes of
`booking_schedule_locks/{technicianId}` serialize competing reservations across
server instances. Request status/interval is the reservation itself; no independent
ledger can drift out of sync. Client-side query-then-write is not the authority.
Firestore Rules deny direct client acceptance and schedule edits. Other established
client transitions retain their atomic evidence/timer/notification safeguards.

Active scheduling scans are bounded to 501 per current/legacy identity query. Above
500, the server fails closed and requests review, rather than ignoring records.
This is a documented verification safety limit, not a one-active-job rule. Manual
Available/Busy/Offline is unchanged, and many adjacent commitments are supported.

### Notification history and unread contract

Three recent streams (personal, active system, sent system) use `(createdAt DESC,
document ID DESC)` with 20-item limits. History pages use stable snapshot cursors
and remain live. Merging deduplicates source/ID; read receipts subscribe only to
loaded system IDs, in bounded authorized groups. Boundary evictions are verified
before retention. Large bursts that move an entire loaded window explicitly ask
for Refresh recent notifications instead of presenting an unexplained complete
history; retention/read listeners remain bounded by requested page depth.

No loaded-page number is labelled a total. Dashboard badges indicate recent unread
activity with a dot. Check unread total explicitly scans eligible personal/system
history and joins owned receipts in bounded pages. Results say "at last check"
and live changes invalidate them. Mark all read scans ALL eligible history, not
just visible items; new concurrent arrivals may remain unread. Partial network
failures remain errors and retries are safe. System receipts commit in groups of
five, with one referenced-message lookup in Rules, to stay within access budgets. Missing receipts are
queried using owned IDs instead of forbidden reads of nonexistent documents.

Exact scalable, continuously updated totals would need an approved trusted counter
or inbox projection, including system audience/status transitions and read events.
That architecture is not silently introduced. The explicit scan is correct for
the existing model but costs reads proportional to eligible history. Historical
records without createdAt (not allowed by current writers) require reviewed data
repair before they can participate in timestamp-ordered history; no backfill ran.

## Changed files by task

- 1: `src/utils/signatureCoordinates.ts`, both JobEvidence components,
  `scripts/tests/signature-coordinates.test.mjs`, additional evidence form coverage.
- 2: `src/firebase/locationAuthGuard.ts`, Firebase config, ForegroundSharing,
  `scripts/tests/auth-switch-location.test.mjs`; real SDK middleware coverage in
  scheduling emulator tests. Existing account-session/GPS/cache regressions retained.
- 3: scheduling domain/trusted service, dispatcher server/main integration,
  `src/services/bookingSchedule.service.ts`, request service and create-request,
  BookingSchedulePanel on both participants' detail screens, Rules/indexes,
  scheduling unit/emulator tests and updated availability/map fixtures.
- 4: `scripts/ANDROID_PUSH_DESIGN.md` only.
- 5: notificationHistory service, notification service/hook, history controls,
  notification screens and dashboard badges; history/recovery unit tests and real
  query/receipt authorization emulator tests; prepared indexes.
- 6: expanded workflow TypeScript roots, shared test adapters,
  `scripts/validate-workflow-snapshot.mjs`, this report and baseline report link.

## Recorded final validation

Pending. The validation runner records HEAD, Git status, SHA-256 hashes of source,
Rules, configuration and tests; exact commands, UTC start/finish times, elapsed
milliseconds, exit codes and logs under ignored `.expo/workflow-final/`.
It rehashes the source after checks and fails if the recorded snapshot changed.
It excludes .env, credentials, device payloads and generated build artifacts.

Earlier development iterations exposed a mixed Admin/client Timestamp fixture
and missing-receipt read/batch-budget constraints. Those were corrected before the
recorded final run. Historical baseline counts are not current validation evidence.

## Manual Android checks — NOT RUN

ADB reported no attached devices. No native capture, touch alignment, OS push,
physical GPS, background/force-stop or two-device success is claimed.

Use the existing demo-only emulator/seed instructions in JOB_WORKFLOW_VALIDATION.md
and one Metro server; include the new trusted backend on the SAME demo project:

```powershell
# Backend terminal, from repository root; demo Auth/Firestore already running:
$env:DISPATCHER_MODE = 'emulator'
$env:GOOGLE_CLOUD_PROJECT = 'demo-servicepilot-review-author'
$env:FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9197'
$env:FIRESTORE_EMULATOR_HOST = '127.0.0.1:8187'
$env:DISPATCHER_ADMIN_ORIGIN = 'http://localhost:5173'
$env:BOOKING_WEB_ORIGIN = 'http://localhost:8081'
npm.cmd --prefix functions run build
npm.cmd --prefix functions run dispatcher:serve
# Metro terminal:
$env:EXPO_PUBLIC_USE_FIREBASE_EMULATORS = '1'
$env:EXPO_PUBLIC_FIREBASE_EMULATOR_HOST = '127.0.0.1'
$env:EXPO_PUBLIC_BOOKING_API_URL = 'http://127.0.0.1:8789'
npx.cmd expo start --localhost --port 8081
```

Reverse 8081/8187/9197/9297 AND 8789 for both Android serials. Use separate
Customer/Technician fixtures; do not use production accounts.

1. Customer creates an explicitly timed/duration booking; technician accepts,
   starts, saves before/after photos, notes and real drawn signature, completes;
   customer submits a review. Verify reviewer names and intended notifications.
2. Test signature on narrow/wide pads, edges, keyboard, relayout, clear/reload and
   interrupted saves. Compare finger position with the rendered stroke.
3. Running/paused timer across navigation, background and force-stop; competing
   pause/completion; missing evidence must prevent completion.
4. Seed >40 disposable personal/system notifications; load earlier pages, insert
   arrivals, mark individual/all read, check total, retry offline, switch accounts.
5. Simultaneously accept overlapping jobs on two technician sessions: only one
   succeeds. Adjacent bookings succeed. Race reschedule approval against acceptance;
   original reservation persists after rejection. Review a legacy missing interval.
6. Mock Kandy then Walapane using the documented GPS fixtures (test documentation
   only). Service coverage remains Kandy while the shared marker stays at GPS.
   Verify outside-district note, Show location, permission-denied distance, OFF,
   stale markers, direct SDK replacement, logout, disable/reactivation and reconnect.
7. Push permission/delivery/cold-launch checks remain BLOCKED pending task 4.

## Deployment/configuration prerequisites — review only

- Configure the trusted Node scheduling host and protected Admin credentials on
  the EXISTING hosting arrangement; no Cloud Functions deployment is required.
  Production transport must be HTTPS. Native clients use EXPO_PUBLIC_BOOKING_API_URL;
  browser clients additionally need the exact BOOKING_WEB_ORIGIN allowlist entry.
- Deploy required indexes and verify readiness before enabling scheduling/history.
- Coordinate backend, client and Rules rollout. New Rules deny old direct-client
  acceptance and require explicit intervals on new requests. New notes/timer audit
  rules also require compatible clients. Missing backend configuration fails closed
  with feedback; it does not fall back to unprotected acceptance.
- Review legacy active jobs explicitly. No automatic migration or data rewrite
  is necessary or authorized. Existing reviews, evidence and completed history stay.
- Push hosting/build credentials and delivery approval remain separate prerequisites;
  see ANDROID_PUSH_DESIGN.md. Do not treat this work as production readiness.

Exact Firebase commands prepared for later explicit approval, NOT executed:

```powershell
firebase.cmd deploy --only firestore:indexes --project servicepilot-756d9 --config firebase.json
firebase.cmd deploy --only firestore:rules --project servicepilot-756d9 --config firebase.json
# Existing private evidence/review Storage rules, if their rollout remains pending:
firebase.cmd deploy --only storage --project servicepilot-756d9 --config firebase.json
```

No service-area catalogue or freshness threshold changed. Existing licensed
GeoNames provenance and limited coverage remain in functions/src/domain/SERVICE_AREA_DATA.md.

## Final Git status

Pending recorded run; all changes remain uncommitted. The final manifest includes
the complete modified/untracked list, including the preserved initial work.
