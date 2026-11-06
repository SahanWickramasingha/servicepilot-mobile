# ServicePilot local implementation — 5 November 2026

## Current verification/resend repair — 6 November 2026

See [current focused evidence](ONBOARDING_VERIFICATION_RESEND_2026-11-06.md) and
the updated full audit. Already-verified resend no longer sends or restarts a
countdown. Verified profile failures retain a safe continuation. An unexpected
post-commit missing snapshot now gets one read-only transaction confirmation.
Final results: 24 integration and 65 regression passes, TypeScript pass, lint zero
errors/one existing warning. Native Customer resend/denial/recovery and fresh
Technician first-completion to pending/offline were exercised. The inspected
deployed Rules match local source; the specific reported production denial and
real inbox delivery remain NOT VERIFIED. Earlier findings below retain their
historical scope; no deployment or APK rebuild was performed.

## Focused verified-create follow-up — 6 November 2026

[Exact denied-write reproduction and regression results](VERIFIED_PROFILE_CREATE_2026-11-06.md):
the old false-only profile verification predicate denies both verified roles.
The narrow local verified-claim fix was already present and is retained; new
before/after and security regressions pass. Results: 18 integration tests,
26 registration/policy unit tests, TypeScript and targeted lint pass. No deployment
or rebuild. The separate native post-commit confirmation blocker below remains open.

## Current authentication acceptance follow-up

See [the actual Android authentication acceptance record](AUTH_UI_ACCEPTANCE_2026-11-05.md)
for the continuation using isolated Auth/Firestore emulators. It supersedes the
earlier native-auth NOT VERIFIED rows below only for the journeys it exercised.
Fresh Customer verification/access and both roles' partial/restarted onboarding
were exercised on the real UI. Customer partial setup exposed an original
`profile-server-confirmation / firestore/profile-confirmation-missing` after
the profile was saved; Continue Setup and sign-in subsequently reached Customer
access with the original account. That first-attempt interruption remains a
release blocker even though reconciliation succeeded. A separate fresh
Technician run reproduced the same post-commit confirmation code; retry reached
pending approval with its saved pending/offline profile. Exact sanitized errors,
navigation-mode evidence and remaining unverified checks are in the new record.
No deployment or release APK build was performed.

This record covers the map/service-area instructions in root AGENTS.md and the
attached authentication/system-bar handoff. No deployment, production data write,
account migration, billing/IAM/secret change, commit, push or remote APK build was
performed. Existing uncommitted registration, Rules and audit work was retained.

## Demonstrated causes and limits

The old registration coordinator wrote and confirmed a full profile before
requesting verification. Its global live gate and protected-route hook each
made their own account decisions. Missing profiles were classified as denial,
and cached missing snapshots were not distinguished from server absence by the
live observer. That cannot support verification-first onboarding or a restart
before profile creation. The earlier local confirmation-code/recovery repairs
were preserved: a failed confirmation after transaction acknowledgement does
not mean the write failed, and recovery must inspect existing records rather
than overwrite them.

The floating tab bars used `bottom: 12` within an edge-to-edge window, and most
screens substituted fixed top/bottom spacers for measured safe areas. Expo
Router 6.0.24 already supplies SafeAreaProvider (inspected in its installed
ExpoRoot implementation). Adding duplicate providers would not resolve those
layout assumptions.

For the map, the existing source takes an Expo Location sample, validates its
coordinates and age, throttles publication, writes precise coordinates to the
private location document, and writes grid cells to the public document. Public
markers decode those cells; selecting a service district/area does not supply
GPS. A California sample therefore remains in California. The original Gihan
device sample and installed APK's first failing registration event were NOT
inspected against production. Neither their exact trigger nor installed build
identity is established by local tests.

## Implementation

- `registerAccount` now starts coordination before Auth creation, retains only
  an allowlisted, password-free memory draft, reconciles any existing own server
  profile and requests verification. There is **no pre-verification Firestore
  record** in the new flow. Auth must already exist to request that email.
- The verification/setup transition reloads the user and forces fresh token
  claims. Only then does it create a missing profile, using the existing
  create-only transaction and server confirmation. A late/uncertain write is
  reconciled on Retry. Valid existing verified profiles are read-only; legacy
  unverified profiles update only their verified-email state. Policy acceptance,
  approval, rating and private profile data are not fabricated or repaired.
- Technicians remain pending and offline at creation. Customers and approved
  technicians continue through the normal access gate; pending/rejected and
  privileged roles retain their distinct boundaries. Existing profile-first
  accounts remain supported without migration.
- Startup/protected routes use the root account context. Its single enforcement
  listener requires server metadata, retains disabled/deleted/revoked enforcement,
  scopes asynchronous callbacks to the exact user object, and bounds checks with
  Retry. Missing profiles lead to verification or authenticated field re-entry;
  existing malformed profiles remain blocked for support. A timeout does not
  authorize a cached record or late token result.
- Registration/completion and verification resend cannot run concurrently. Drafts
  clear on account change/logout; navigation ignores unmounted/replaced sessions.
  Lost memory drafts can be re-entered through `/profile-setup` after signing in
  to the original Auth account. No plaintext password is persisted or put in URLs.
- Email-request failure retains Auth/draft and opens verification with Resend.
  Resend uses the same identity, a shared cooldown and bounded waits. Request
  acceptance is described as a request, not proof of inbox delivery. Login,
  password reset/change and verification waits are also bounded. Google, Apple
  and Microsoft buttons explicitly explain that email sign-in is required.
- AppViewport consumes Router's measured safe areas once around the navigator.
  The floating bars remain within that usable viewport; automatic tab insets are
  explicitly zero to avoid counting them twice. AppModal insets native modal
  content separately. Fixed status-bar spacers were replaced with normal design
  spacing, and the evidence/signature screen no longer adds another safe area.
  Edge-to-edge remains enabled. No native dependency/configuration changed.

The existing service-area selector, wrench/count pins, 120-second freshness
threshold, accessible map cards, outside-district note/Show location action,
permission-based straight-line distance and separate public/private projections
were retained and revalidated. The only map UI changes here are safe-area/modal
handling; coordinates are not relocated to district or town centres.

## Area provenance and compatibility

See [the catalogue provenance](../functions/src/domain/SERVICE_AREA_DATA.md).
The existing four Kandy entries — Peradeniya, Katugastota, Kundasale and Gampola —
are a curated GeoNames Sri Lanka postal-data subset under CC BY 4.0, with stable
application IDs derived from country/postal code/locality. This session did not
add or invent catalogue entries. The list is not exhaustive. All 25 canonical
districts retain district-only coverage and validated, explicitly
technician-provided Other areas. Areas are keyed by district; private street
addresses do not become public locality/GPS data.

## Changed paths and preserved work

Core/auth: `app/_layout.tsx`; `app/(auth)/login.tsx`, `register.tsx`,
`verify-email.tsx`, new `profile-setup.tsx`; `src/components/auth/AccountSessionContext.tsx`,
`AuthSessionGate.tsx`, `LiveAccountGate.tsx`; `src/hooks/useMobileSessionAccess.ts`;
`src/services/auth.service.ts`, `account-session.service.ts`,
`registration.service.ts`, `profile-initialization.service.ts`,
`onboarding-draft.service.ts`, `user.service.ts`; `src/utils/mobileOnboarding.ts`,
`registrationDebug.ts`; and `firestore.rules` (verified-claim creation condition).

Layout: new `src/components/layout/AppViewport.tsx`, `AppModal.tsx`, existing
`Screen.tsx`; both Customer/Technician tab `_layout.tsx` files; normal top-spacing
changes in auth change-password/edit-profile/role-selection/settings, Customer
tab screens, Technician tab/job/navigation/performance/notification screens,
Dispatcher index and legal page. Native modal consumers now use AppModal:
Customer map, Technician jobs/job-details, district/area pickers, evidence/review
photo viewers and legal policy/terms/safety components. The evidence/signature
screen consumes the already-inset navigator without a second safe view.

Validation/docs: `scripts/tests/registration.test.mjs`,
`registration-emulator.test.mjs`, new `onboarding-state.test.mjs`,
`account-session.test.mjs`, `auth-persistence.test.mjs`,
`change-password.test.mjs`, `functional-audit.test.mjs`;
`scripts/lib/performance-render-harness.mjs`, `performance-test-deps.mjs`,
`RegistrationDiagnostics.ps1`; `scripts/seed-map-emulator.mjs`;
`scripts/FULL_FUNCTIONAL_AUDIT.md`, `APK_REGISTRATION_CAPTURE.md` and this record.

The initially modified legal-policy/map-location/performance/service-category
tests were not reverted or rewritten by this work. Existing audit/config/docs
files and all other unrelated local work remain present. Root/nested project
guidance was inspected; AGENTS.md was not replaced. No index/catalogue change,
dependency upgrade or generated native project was introduced.

## Validation and acceptance

Current command results and outstanding device checks are also recorded in
`scripts/FULL_FUNCTIONAL_AUDIT.md`. Generated logs/summaries and local captures
are under ignored `.firebase/review-config/`; they are not release artifacts.

| Current check | Result |
| --- | --- |
| Initial baseline `tsc`, lint, unit suite | TypeScript pass; lint 0 errors/1 existing warning; 338/338 units pass |
| Updated `node scripts/run-functional-audit.mjs units` | 347/347 pass, 0 fail/skip (final run) |
| `node scripts/run-audit-fixes.mjs project registration` | 16/16 real Auth/Firestore integration tests pass |
| `node scripts/run-audit-fixes.mjs map` | 15/15 map/privacy/area/notification integration tests pass |
| `node scripts/run-audit-fixes.mjs rules` | 11/11 request/evidence/access tests pass |
| `node scripts/run-audit-fixes.mjs checks` | TypeScript, lint and category/Rules synchronization pass; existing `job-action.tsx:50` warning |
| Focused password/deadline checks | 31/31 pass; final onboarding render/session checks 8/8 pass |
| Local Android export with Hermes | Pass after retrying with compiler execution permission; initial sandbox execution denial was tooling, not a TypeScript/bundle error |
| Category/profile/area/policy Rules integration | 14 pass, 1 intentional historical-deployed-snapshot skip, 0 fail |
| Functions build / Admin Web build | Pass; Admin Web retains its existing bundle-size warning |
| Functions lint (unchanged files) | 17 existing errors in availability, bookingSchedule, booking-schedule.service and trusted-auth; these paths were not edited |
| Registration diagnostic PowerShell checks | Pass with process-local `-ExecutionPolicy Bypass`; initial default-policy execution was blocked without changing machine policy |
| Device and final additional checks | See the dated record below; do not infer live/release success from these automated checks |

Real integration coverage includes no profile before verification, refreshed
verified claims, restart/re-entry, original UID recovery, incorrect credentials,
legacy read-only recovery, pending/rejected/approved roles, old policies,
disabled/deleted/revoked/malformed profiles, Rules rejection, lost acknowledgement,
post-commit provider errors, cached/pending confirmation, real timestamps,
concurrent creates and same-UID Auth-object replacement. Unit tests cover bounded
checks, late responses, listener failure, duplicate actions, resend cooldown,
account switching, native/web persistence, password flows and profile validation.
Map suites cover area/district association, Other/reset/legacy behavior,
Haversine edge cases, stale distance suppression, overlap identity, sharing
cleanup/throttling and precise-location ownership. Review/name/notification
regressions were preserved.

Intermediate test issues were corrected rather than treated as application
success: old harnesses expected profile-first ordering/independent guards; the
password harness shadowed newly used timers with undefined; SDK watch fixtures
needed a bounded test-only barrier after independent Admin writes. A launcher
adapter test failed once under concurrent emulator/bundler load and passed in
the final full suite (347/347). None of those failures is reported as pre-existing
application defects.

## Two-emulator procedure and remaining checks

### Current Android checks (5 November, local demo backend)

Two existing Android emulators (`emulator-5554` Technician and `emulator-5556`
Customer) used one Metro server on 8084 and explicitly configured demo
Auth/Firestore emulators. These were Expo Go runs with disposable fixture
accounts, not a release APK or production Gihan record. Final account-deadline
and restarted Technician field-entry fixes were checked after the map run;
they do not change map coordinates or rendering.

| Scenario | Current native result |
| --- | --- |
| Separate Technician and Customer login | PASS; each reached its own dashboard |
| Technician Personal Information Kandy / Peradeniya save | PASS; save feedback and subsequent server/profile reads retain the district-keyed area; no GPS was created by this save |
| Sharing ON with Kandy OS mock GPS | PASS; public cells `[729,8063]` match the device-derived precise document; blue wrench pin visible in the Kandy boundary |
| Move device GPS to Walapane | PASS; public cells `[709,8086]`; Kandy/Peradeniya remain the service result; outside-district note displayed; Show location focuses near Walapane |
| Tap marker / View Profile / Request Service | PASS; sheet shows name, Electrical, no-ratings/0-reviews state, area and freshness; actions open the matching fixture profile and preselected request form (no request submitted) |
| Customer permission denied | PASS; explicit denial feedback and browsing retained |
| Customer permission granted | PASS; fresh Kandy customer GPS against Walapane public approximation displays Approximately 33.5 km away |
| Sharing OFF / absent GPS | PASS; both stored coordinate documents become OFF with no coordinates; customer retains the technician and shows Location unavailable / Distance unavailable and zero shared markers |
| Older profile without town / Other / overlapping markers / stale marker | Automated coverage PASS; dedicated current native checks NOT VERIFIED |
| Real reviewer names and notification delivery | Regression/integration coverage PASS; current native end-to-end review/notification delivery NOT VERIFIED |

ADB's `emu geo fix` command returned unsupported on these running AVDs, so the
current run used Android's shell GPS test-provider API with the same documented
test coordinates. Continuous mock samples were needed for foreground heartbeat
checks; short sample loops expired during inspection, so intermediate OFF states
were not attributed to marker rendering. The final successful ON/OFF writes and
native results above were observed directly. Expo Go also showed its own
per-experience coarse/fine permission prompts, separate from Firebase Auth.
Use the requested Extended Controls > Location workflow for repeat acceptance.

| Authentication scenario | Real SDK/Rules integration | Current Android UI |
| --- | --- | --- |
| Fresh Customer / Technician verification-first completion | PASS for both roles, including no Firestore profile before verification and Technician pending/offline | Fresh native registration journey NOT VERIFIED; current automated touch driver did not complete the form reliably |
| Existing verified Customer / approved Technician login | PASS | PASS, separate fixture accounts |
| Missing profile, restart/re-entry, legacy existing record | PASS, including district-only legacy Technician fields | NOT VERIFIED |
| Pending/rejected/privileged/inactive/revoked boundaries | PASS | NOT VERIFIED as dedicated current native journeys |
| Resend/request failure/cooldown, stale claims, duplicate actions, account change | SDK + unit coverage PASS | NOT VERIFIED as dedicated current native journeys |
| Remember Me, reset/change password and logout cleanup | Persistence/password/cleanup regression coverage PASS | Remember Me ON restoration observed on both; remaining matrix NOT VERIFIED |

| Safe-area/navigation surface | Current result |
| --- | --- |
| Both dashboards and tabs, gesture navigation | PASS visual inspection on both 1080×2400 emulators |
| Both dashboards and tabs, three-button navigation | PASS visual inspection after Android recreated the activities; tabs remain above system buttons |
| Technician edit/save, customer map/card/profile/request form | PASS inspected in gesture mode; save feedback appears next to Save |
| Auth/setup/recovery/legal, every modal, request details, signature, keyboard open/closed | Source and regression checks performed; complete native matrix NOT VERIFIED |
| Small screen / iOS / physical device / release APK | NOT VERIFIED; portrait app configuration retained |

Ignored local screenshots and accessibility traces support the exercised rows;
they contain only disposable fixture data and are not release artifacts.

Use the complete nine-step checklist and verified test-only coordinates in
[SERVICE_AREA_MAP_VALIDATION.md](../scripts/SERVICE_AREA_MAP_VALIDATION.md).
Do not put those coordinates in production source. Run automated suites before
seeding the interactive fixtures; some suites deliberately leave inconsistent
approval projections and changed Auth fixture credentials.

```powershell
# Terminal 1: fresh local emulators, no production credentials needed.
$env:DEBUG=''
$env:XDG_CONFIG_HOME=Join-Path (Get-Location) '.firebase/review-config/task-cli'
firebase.cmd emulators:start --only firestore,auth --project demo-servicepilot-review-author --config firebase.audit-test.json

# Terminal 2: explicit disposable reset; never use a production project/host.
$env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8187'
$env:FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9197'
node scripts/seed-map-emulator.mjs --reset --sharing-off --kandy-only
$env:EXPO_PUBLIC_USE_FIREBASE_EMULATORS='1'
$env:EXPO_PUBLIC_FIREBASE_EMULATOR_HOST='10.0.2.2'
$env:EXPO_PUBLIC_BOOKING_API_URL='http://10.0.2.2:8787'
$env:EXPO_PUBLIC_PHOTO_API_URL='http://10.0.2.2:8788'
$env:EXPO_OFFLINE='1'
npx.cmd expo start --port 8084 --offline
```

Open `exp://10.0.2.2:8084` in Expo Go on both Android emulators. The host gateway
avoids requiring ADB reverse; the older reverse-based procedure is also valid.
There is one Metro server. Local Worker URLs are deliberate: start matching demo
Workers before testing submissions/uploads; do not send demo tokens to live
Workers. Browsing/maps/onboarding do not require deployed Cloud Functions.
After testing, turn sharing OFF, sign out, stop task services and remove the
EXPO_PUBLIC emulator/local-Worker variables before a normal session.

For authentication, test Customer and Technician separately: register a fresh
`example.test` identity; confirm that only Auth exists before verification; use
the **local Auth emulator** verification action; tap I've Verified; inspect
Customer access versus Technician pending approval. Restart before profile save
and re-enter fields through authenticated setup. Test resend/failure/cooldown,
Remember Me OFF/ON restart, logout/account switch, reset/change-password, rejected
and inactive accounts. Never send real verification/reset mail for this test.

For safe areas, inspect both roles' tabs; auth/setup/recovery and legal pages;
profile settings; request details; job evidence/signature and all modal/bottom
actions. Repeat with gesture and three-button navigation, keyboard open/closed,
and small/tall displays. The app is configured for portrait; landscape and iOS
remain separate acceptance work. Signature points must continue to match local
canvas/touch coordinates after viewport changes.

Physical devices, installed/release APK identity, real email delivery, production
Rules/index readiness and production journeys remain NOT VERIFIED. The original
APK diagnosis needs its hash/source/update identity, sanitized first failure
stage/code/runtime project, and matching deployed Rules; the prepared capture
guide remains applicable. No live success is inferred from local compilation.

## Reviewed release actions — not executed

1. Review the complete local Rules diff, including the earlier map/evidence
   changes, against the actual active release. New verified profile creation now
   permits `emailVerified: true` **only with** the owning verified Auth claim.
   Existing `false` creation remains compatible with older installed clients.
2. Deploy reviewed Rules before distributing the verification-first client:

   ```powershell
   firebase.cmd deploy --config .\firebase.json --only firestore:rules --project servicepilot-756d9
   ```

3. No new index was added in this session. If the existing map indexes in
   `firestore.indexes.json` are absent from the target, the exact separate command
   is below; wait until required indexes are READY before map acceptance:

   ```powershell
   firebase.cmd deploy --config .\firebase.json --only firestore:indexes --project servicepilot-756d9
   ```

4. No migration is necessary: service areas remain optional and existing
   profile-first accounts are reconciled in place. No new migration was run or
   prepared. Existing optional map backfill tooling retains its separate dry-run
   workflow; this task does not authorize executing it against production.
5. These changes require no Worker/Pages/Cloud Functions deployment or billing
   account. Prior audit release actions for unrelated fixes remain separate.
   Complete device/release acceptance, then build and distribute an authorized
   APK containing these JS changes. No new native module/config build step is
   introduced, but the currently installed APK cannot acquire these changes by
   compilation alone. Do not start a remote build without separate authorization.

   The existing `preview` EAS profile produces an internal APK. After review,
   Rules deployment and device acceptance, the prepared build command is:

   ```powershell
   npx.cmd eas-cli build --platform android --profile preview
   ```

   This remote build command was **not executed**. The production profile makes
   an app bundle, so it is not the command for this APK acceptance step.

Release assessment: local implementation/checks completed as recorded; production
release and original installed-APK diagnosis remain gated by the evidence and
manual acceptance above.

## Account setup loading presentation follow-up

The pending view in `LiveAccountGate` now renders a compact centered ServicePilot
logo, blue indicator, white “Getting things ready” heading and muted supporting
text. Authentication, authorization, routing and timeout/retry callbacks are
unchanged. Errors and access denial retain their existing separate actions.

TypeScript passes; lint has zero errors and the existing job-action ref-cleanup
warning; all 18 focused onboarding/session tests pass. Android captures cover
normal size, a small viewport, 200% text, reduced motion, gesture and three-button
navigation without system-bar overlap. Spoken screen-reader timing, iOS and
physical devices remain NOT VERIFIED. No release APK was built.

See [UI evidence and screenshots](ACCOUNT_SETUP_LOADING_UI.md). The existing
watchdog can restart on profile snapshots, so it is not an absolute 20-second
end-to-end deadline; continuous-snapshot behavior remains NOT VERIFIED manually.
The earlier profile-confirmation blocker remains open. No deployment, commit or
push was performed.
