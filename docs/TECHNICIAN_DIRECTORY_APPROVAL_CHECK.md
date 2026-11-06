# Technician directory supplemental approval reads

This is a continuation of `TECHNICIAN_ACCESS_AND_APPROVAL.md`, limited to the
confirmed `Technician directory approval check failed` error. No production
reads/writes, deployments, migration, authentication/UI changes or APK build were
performed. Existing unrelated working-tree changes were preserved.

## Exact read path and denial

Both Dashboard and Technicians call the real `subscribeToApprovedTechnicians`.

| Operation | Customer authorization | Result with stale approved projection |
| --- | --- | --- |
| Refresh owning Auth ID token once per pooled connection | Auth operation; no Firestore profile query | Not the reported failure stage |
| Listen to `technician_map_profiles`, `approved == true`, optional service/district filters, document ID order, limit 8/16/24 | `technician_map_profiles` **list** Rule: active verified Customer/session, bounded query, projected approved flag | Succeeds |
| For **each returned document**, `getDocFromServer(item.ref)` inside `Promise.all` | `technician_map_profiles/{technicianId}` **get** Rule additionally requires `isApprovedTechnicianId(technicianId)` | Denied if the authoritative private account is rejected, pending, disabled/deleted, missing, wrong-role or lacks approval status |
| Rule-internal `get`/`exists` of `users/{customerUid}` | Own role/account/session/verification gates | Required for both operations |
| Rule-internal `get`/`exists` of `users/{technicianId}` | Evaluated by `isApprovedTechnicianId`; does not authorize a client read of `users` | Current role, approval and active-account checks |

There are **no supplemental client reads of private technician users, addresses,
locations or requests** in this subscription. An owning private customer profile
read elsewhere on Dashboard is not inside this Promise. The exact offending
production UID was not present in the supplied error and was not inspected.
New failures include the public document path and, where applicable, the negative
proof path so a remaining unexpected denial can be identified without logging
tokens or private records.

Reproduction uses the complete real TypeScript subscription, real Firebase Auth
and Firestore SDKs, real pooling implementation, and the full repository Rules
loaded directly from `firestore.rules`. The original code passes the initial
8-record query, then fails both Dashboard's default subscription and Technicians'
district/service-filtered subscription at the exact approval-check stage. The
mixed page contains a current approved technician, a compatible legacy approved
technician, and stale projections for rejected, disabled, missing, wrong-role,
pending and missing-status authoritative accounts. Individual denied operations
include `get technician_map_profiles/directory-disabled` and
`get technician_map_profiles/directory-missing`; all ineligible cases are checked.

A single denied get rejects the original whole `Promise.all`. This demonstrates
a data-shape-dependent failure matching the reported error, independently of the
already deployed indexes, Metro cache and token refresh. It does not establish
which production record has that shape.

## Minimal fix and security contract

Keep the original public query and authoritative public gets. On a denied get,
request one server-only **negative proof** at
`technician_directory_exclusions/{technicianId}`. This is a reserved, read-only,
**nonexistent** document path, not a persisted status collection:

- Only an active, verified Customer with an eligible session may get the path.
- Rules allow that get only when the SAME authoritative approval predicate is
  false AND the proof document does not exist.
- A successful server get returning `exists() == false` therefore proves current
  ineligibility. Only then may this particular projection be excluded.
- Any existing proof document is unreadable, even if a trusted import placed
  private fields there. All client list/write/delete operations are denied.
- A denied or unavailable proof, an unexplained denial for a valid technician,
  or any other failed read still fails the directory and preserves Retry. No
  `allSettled` error swallowing, cached eligibility or trusted stale flag is used.
- The authoritative predicate uses safe defaults for missing role/status fields;
  missing approval is false, while the established legacy missing-accountStatus
  active default remains unchanged. Missing private records are also false.

This avoids a new backend, stored status duplication, production repair or
migration. It changes no visibility criteria and grants no private-profile or
precise-location access. Normal pages perform at most 24 supplemental public
gets; ineligible results add at most one proof get each. There is no polling,
unbounded query, write or added listener. Identical consumers still pool the
work. Retry, generation checks and account-change/logout cleanup remain active;
an account switch during a pending proof cannot publish an old result.

The 24-technician emulator regression succeeds, including legacy accounts. Thus
concurrent independent gets do not reproduce a shared Rules access-call-limit
failure. Each get checks the requester and selected technician; these are
Rule-internal document accesses, not a 24-technician private query. Proof reads
add only an existence check of their own path. Limits are not raised or bypassed.

## Projection writers

Existing web and mobile application reviews transact the authoritative approval
and safe public projection together. `mapApprovalFollowsUser` rejects client
approval-only writes. Existing Admin Worker lifecycle code imports
`functions/src/domain/adminLifecycle.ts`: its claim transaction disables/deletes
the account and revokes the projection and both location projections before Auth
mutation. Enable rebuilds the projection with existing approval and sharing off.
No writer/backend changes were necessary. Integration tests exercise both review
roles, rejection, competing reviews, and lifecycle revocation/failure/recovery.
Trusted manual imports still bypass Rules; the directory now handles their stale
projections through current Rules authority rather than requiring a data cleanup.

## Validation and release

Before the fix: 6 existing emulator groups pass; the new Dashboard and Technicians
mixed-page regressions both fail at `approval check` with `permission-denied`.
After the fix: all 11 access/approval emulator groups pass, including the complete
mixed subscriptions, 24-record limit, negative-proof boundaries, ambiguity/network
failures, private-document denials and transactional review regressions.

Host checks: 30 UI/service/subscription/category/map tests pass, including pending
proof cancellation on account change, pooled Retry and unchanged empty/error
states. Mobile TypeScript and targeted service lint pass. All 15 focused lifecycle
emulator groups pass, including atomic projection/location revocation before Auth,
provider-failure gating, recovery, enable semantics and stale-session denial.

No failing check remains in these focused runs. The first host rerun exposed a
test SDK missing the newly used proof `doc` operation; its adapter was corrected
to preserve the ambiguous-denial assertion. Emulator CLI remote-MOTD/metadata
warnings did not affect test results. A lingering test emulator required local
process cleanup before the next run; no existing project service was stopped.

Reproduce from the repository root in PowerShell (demo projects only):

```powershell
$env:DEBUG = ''
$env:XDG_CONFIG_HOME = Join-Path $env:TEMP 'servicepilot-access-config'
firebase.cmd emulators:exec --project demo-servicepilot-access --config firebase.technician-access-test.json --only auth,firestore 'node --test --test-reporter spec scripts/tests/technician-access-emulator.test.mjs'
firebase.cmd emulators:exec --project demo-servicepilot-dispatcher --config firebase.dispatcher-test.json --only auth,firestore 'node --test --test-reporter spec scripts/tests/account-lifecycle.test.mjs'
node --test --test-reporter spec scripts/tests/technician-access-ui.test.mjs scripts/tests/subscription-reliability.test.mjs scripts/tests/service-categories.test.mjs scripts/tests/map-loading.test.mjs
npx.cmd tsc --noEmit
npx.cmd eslint src/services/technician.service.ts
```

**Another Rules deployment IS required** for the negative-proof path. Metro reload
alone cannot authorize it. No additional index, Worker, Functions or Admin Web
deployment, migration or production record rewrite is required for this fix.
Review-only commands; not executed:

```powershell
firebase.cmd deploy --project servicepilot-756d9 --only firestore:rules
# After deploying the reviewed Rules, reload the Metro client.
```

Installed standalone APKs eventually need updated mobile source in their normal
release process; none was built here. Native/live device success and the exact
offending production UID remain unverified. On the affected Customer session,
reload after the Rules release, open both Dashboard and Technicians with the same
filters, verify eligible results and incompatible records excluded, and test
failure/Retry offline. Remaining errors now identify the exact public read path.
