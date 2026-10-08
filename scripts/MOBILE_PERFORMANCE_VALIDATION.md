# Mobile performance validation — 2026-10-05

Inspected startup/Auth restoration, both dashboards, navigation, lists/reviews, maps, images, Firestore subscriptions and foreground GPS. Read root `AGENTS.md`; no nested instruction file was found. The initial tree contained the availability implementation, which was preserved. Before-performance source copies, including that work, are in ignored `.expo/performance-before`.

## Actual before/after evidence

Both probes execute actual service/component TypeScript through the same Node 22.17.0 / TypeScript 5.9.2 adapters and identical fixtures. No production calls occur. These are **JavaScript work counts and application subscription registrations**, not native startup/FPS or billed reads.

| Workload | Before | After |
| --- | ---: | ---: |
| Four profile + four jobs + three reviews + two notification-centre consumers: onSnapshot registrations | 19 | 7 |
| Listeners after final unsubscribe | 0 | 0 |
| 1,000 jobs, initial snapshot plus one changed job: document data() calls across four consumers | 8,000 | 1,001 |
| 1,000 reviews, initial snapshot plus one changed review: data() calls across three consumers | 12,000 | 1,001 |
| Ten dashboard profile/availability changes: notification-centre starts | 11 | 1 |
| Corresponding notification query registrations (four sources each) | 44 | 4 |
| Twenty native-map component renders with unchanged GPS/viewport and changing text: group calculations | 20 | 1 |
| Distinct polygon coordinate arrays for those renders | 20 | 1 |
| 1,000 customer requests: row elements created eagerly by the screen parent | 1,000 | 0 (delegated to FlatList) |
| First request/history page | All records | 20, with Load more |
| Two immediate Submit taps: request-service calls | 2 | 1 |
| JSON evaluated through Auth/profile imports | 200,980-byte geometry | 3,670-byte metadata |

Geometry remains bundled and evaluates on first polygon use. A host probe incurred roughly 3–4 ms on that access, including host file parsing; this is not a mobile navigation-time claim. Boundaries, canonical district IDs and GPS semantics are unchanged.

Firestore can already multiplex identical watches. The listener counts quantify duplicate application setup/mapping/callback work, not a guaranteed network/billing reduction. Public projection approval checks remain bounded server reads, and booking eligibility remains atomic. The component harness uses raw TS hook adapters; it does not apply Expo's React Compiler or emulate native layout/bitmap work. No performance percentage is claimed.

## Implemented changes and files

| Area | Files and behavior |
| --- | --- |
| Live subscriptions | `src/utils/sharedSubscription.ts`, `src/services/session-subscriptions.ts`; user, request, technician and notification services share active streams by resource and signed-in viewer. Live snapshots are reused only while a consumer exists. Logout/account changes stop old work, discard cached snapshots/errors and reject delayed callbacks. Final unsubscribe clears data and session observers. Failed streams deliver errors to later consumers instead of leaving them loading. No disk cache or TTL was added. |
| Incremental documents | `src/utils/liveDocuments.ts`; request/review services map added/modified records, remove deleted ones and preserve unchanged row identities and query order. Metadata-only review confirmation still reaches hooks. All eligible reviews still contribute to ratings, with real names preserved. |
| Technician dashboard | `app/technician/(tabs)/index.tsx`; notification subscriptions depend on UID/role rather than the whole profile. The fixed-size avatar uses installed `expo-image`, a viewer-specific memory key, recycling key and cover sizing. Disk caching is disabled; the session observer clears image memory on account changes/logout. Native image savings were not measured. |
| Growing lists | `app/(tabs)/bookings.tsx`, `technicians.tsx`, `app/technician/(tabs)/history.tsx`; FlatList, stable IDs/render callbacks, memoized rows, measured variable heights and 20-record request/history pages. Full counts/filters remain available. The directory retains existing 8/16/24 Firestore bounds. Customer request listeners now reset on Auth changes and ignore obsolete callbacks. |
| Map work | `src/components/maps/TechnicianMap.native.tsx`, `app/(tabs)/map.tsx`; reuse grouping/polygon inputs and compare complete marker render inputs. Availability, distance/loading text and timer ticks don't rebuild unchanged points. Outside-district calculations reuse inputs. The freshness timer runs only while focused/foregrounded and pending scroll frames are cancelled. GPS movement, stale transitions, overlap selection, IDs/actions, service overlays and attribution remain intact. |
| Duplicate actions | `app/(tabs)/create-request.tsx`, `app/technician/(tabs)/jobs.tsx`; synchronous per-session submission and per-request action guards. Error retries remain possible; no simultaneous-job cap was introduced. |
| Startup data | `functions/src/domain/map.ts`, `district-catalogue.json`, `DISTRICT_DATA_LICENSE.md`, `scripts/generate-district-catalogue.mjs`; generated metadata separates district validation from lazy geometry evaluation. It derives from the same pinned ODbL dataset. Tests compare all 25 districts, bounds and complete geometries. Area catalogue and source geometry are unchanged. |
| Evidence/regressions | Two performance probes, `scripts/tests/performance.test.mjs`, two host-test helpers and dependency-loader updates in existing map/admin/reviewer/rating/availability suites. |

Startup Auth restoration and role entry checks were retained. Foreground GPS already uses a 30-second/100-metre watcher, 60-second minimum write interval, 90-second heartbeat and 120-second freshness threshold. Existing GPS acquisition, throttling, OFF/background and account-cleanup tests pass. No weaker freshness policy, extra polling or required backend was introduced.

List and image props use the installed dependencies' supported [FlatList](https://reactnative.dev/docs/flatlist) and [Expo SDK 54 Image](https://docs.expo.dev/versions/v54.0.0/sdk/image/) APIs.

## Validation results

- **70 unit/component/lifecycle tests pass**, including ten new regressions for sharing/replay/errors, account isolation, changed rows, geometry, map updates, pagination/navigation and immediate duplicate Submit taps.
- **40 loopback Firebase Auth/Firestore tests pass** on `demo-servicepilot-review-author`: availability authorization/races, simultaneous bookings, existing jobs while Offline, reviews/names, notifications, projection/admin boundaries, map GPS and precise-location access. Updated loaders exercise real pooling/reducer logic with each fixture's Auth context.
- Scoped mobile/app/domain TypeScript and changed-file ESLint pass. Functions and Admin Web builds pass, including a clean Functions output directory with successful lazy geometry loading. Admin Web retains its existing large-chunk warning.
- Production minified Android **JavaScript export** created under ignored `.expo/performance-export` (about 5.17 MB). This validates bundling; it is not a native release build or a before/after size comparison. Hermes bytecode generation failed because installed `hermesc.exe` returned `permission denied`; `--no-bytecode` provides the available JS fallback.
- **No connected device or native release build was available**: `adb devices -l` returned no devices, and there is no checked-in native build/APK. Native cold-start, first usable screen, navigation latency, scroll FPS, map frame time, image decode and production runtime measurements were not performed. No Expo Go result is presented as release evidence.
- Full root TypeScript retains **24 existing errors** in unchanged Admin Web Vite/assets, OTP/Cloudflare tests and Expo template aliases. Full lint retains **8 existing errors** in `select-service.tsx`, `parallax-scroll-view.tsx`, `themed-text.tsx`, `themed-view.tsx` and `use-theme-color.ts`. Relevant availability/performance files have no remaining check errors.

## Reproduce

```powershell
npm.cmd --prefix functions run build
node scripts/generate-district-catalogue.mjs --check
node scripts/performance-probe.mjs .expo/performance-before
node scripts/performance-probe.mjs .
node scripts/performance-render-probe.mjs .expo/performance-before
node scripts/performance-render-probe.mjs .
node --test scripts/tests/performance.test.mjs scripts/tests/availability.test.mjs scripts/tests/service-areas-distance.test.mjs scripts/tests/technician-rating.test.mjs scripts/tests/map-loading.test.mjs scripts/tests/map-view-actions.test.mjs scripts/tests/foreground-sharing.test.mjs scripts/tests/device-location.test.mjs scripts/tests/customer-map-location.test.mjs
$env:XDG_CONFIG_HOME = Join-Path (Get-Location) '.expo\firebase-cli-config'
firebase.cmd emulators:exec --only firestore,auth --project demo-servicepilot-review-author --config firebase.map-test.json "node --test scripts/tests/availability-booking.test.mjs scripts/tests/map-location.test.mjs scripts/tests/map-backfill.test.mjs scripts/tests/map-admin.test.mjs scripts/tests/reviewer-names.test.mjs"
$env:EXPO_OFFLINE='1'
$env:EXPO_NO_TELEMETRY='1'
npx.cmd expo export --platform android --no-bytecode --max-workers 2 --output-dir .expo/performance-export
```

The ignored before directory is local, not a tracked release. On another checkout, pass a preserved before-performance source tree containing availability to the probes. Use fresh local emulators for combined suites. Logs, exports and baseline copies are ignored `.expo` artifacts, not application dependencies.

## Remaining device assessment and limits

Use the same device/OS, app build mode, fixture IDs/data, permissions, network and routes for both versions. Keep release and Expo Go results separate. Demo Expo Go uses the existing [one-Metro/two-emulator setup](TECHNICIAN_AVAILABILITY_VALIDATION.md#two-emulator-procedure) with explicit Firebase emulator opt-in. Release testing needs a reviewed configuration targeting a disposable backend: the current emulator flag intentionally requires `__DEV__`; the normal release configuration is not a fixture backend.

1. Record ten force-stopped launches per version: launch to login/restored dashboard and usable content. Report median/range separately for signed-out, restored Customer and restored Technician sessions; keep bundle-cache conditions consistent.
2. Time Home → Technicians → Profile → Request, Map → marker details, and Technician Dashboard → Jobs → Profile → History. Separate navigation from Firestore loading.
3. Profile scrolling with 20/1,000 requests and history records, and map pan/zoom/selection with 24 matching technicians. Confirm all pages/counts, live availability, ratings/names and correct action IDs using native frame/React profiling tools.
4. Count actual RPC/listen traffic and GPS writes in emulator logs, rather than equating registrations with reads. Use identical stationary/moving foreground intervals; test background, sharing OFF, logout and account switching.
5. Repeat denied permission, stale availability attempts, failed requests/retry and rapid taps. Confirm existing jobs, reviews and notifications. These native scenarios remain unperformed here.

Private job/review queries still read the full dataset to preserve exact counts, filters and review-derived ratings. Notification queries preserve complete unread/read behavior. These changes bound rendering and remove repeated mapping; they do not bound first-query documents. Server pagination/counters require a separate schema/security design. Public approval, availability and GPS freshness were not replaced with TTL caches. The production bundle still includes map modules for their routes; geometry evaluation timing was improved, without claiming bundle reduction.

Performance changes add **no rule/index changes, migration, deployed Functions, dependencies, paid services, deployment or production writes**. Previously prepared availability rules remain in the tree with separate instructions in the availability report.
