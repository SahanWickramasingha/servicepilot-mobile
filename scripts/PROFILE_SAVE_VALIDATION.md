# Technician profile category save — November 1, 2026

The production failure is a client/deployed-Rules version mismatch. No production
records or deployments were changed. The existing local category contract already
allows the new field; this task preserves that work, strengthens its atomic check,
and adds real-service emulator regression coverage.

## Exact rejection

Read-only Firebase Rules API inspection of `servicepilot-756d9` returned release
`projects/servicepilot-756d9/releases/cloud.firestore`, ruleset
`99e85715-c674-4b87-9f56-a85bb940f98b`, updated `2026-10-29T17:14:43.485667Z`.
The downloaded source is an ignored local review artifact at
`.firebase/review-config/profile-save/deployed.rules`.

- `users/{uid}`: deployed `ownerMutableFieldsOnly()` (starting at line 164) omits
  `serviceCategoryId`. Adding/changing it makes `affectedKeys().hasOnly(...)`
  false, rejecting `validOwnerUpdate()` and the update at line 1281.
- `technician_map_profiles/{uid}`: deployed `validMapProfile()` at line 1159
  omits `serviceCategoryId` from `data.keys().hasOnly(...)`. The new projection
  therefore fails independently, even with a valid canonical category and correct
  approval/rating fields.
- Emulator tests using that exact downloaded snapshot isolate each failure. An
  otherwise identical legacy projection without the ID succeeds as a control.
  The real client's combined save rejects and leaves both documents unchanged.

`approved=true` and zero totals are not themselves evidence of tampering. They
must equal the authoritative post-write user profile: approved status plus an
active account, and existing totals (zero defaults only if absent).

## Client and local Rules contract

`app/(auth)/edit-profile.tsx` passes the selected ID and service area to
`updateUserProfileSafe()`. It already has validation, loading, success/error
feedback. No screen change is necessary.

`src/services/user.service.ts` reads the user inside a transaction, constructs
canonical category fields through `selectedTechnicianCategory()`, and builds
the public projection from the same snapshot plus editable changes. This task
adds an account-change check after the read and documents the authority source.
The form cannot supply approval, ratings or job totals. A transaction retry
rebuilds the projection from the latest authoritative data.

`syncOwnMapProfile()` in `src/services/location.service.ts` likewise builds its
allowlisted projection from the private user snapshot; neither service uses
public projection totals as an authority. `buildMapProfile()` keeps street address,
phone and precise GPS out of the public document. `completedJobs` belongs under
`publicDetails`, not at the projection root.

The existing local Rules allowlist the stable category ID, enforce canonical
ID/specialization pairs, and require a category edit's projection via `getAfter()`.
This task additionally checks user save time, projection identity and matching
specialization there. In the reverse direction, `validMapProfile()` compares all
public fields, approval and totals against `getAfter(users/{uid})`. Protected user
fields remain outside the owner allowlist. No ownership, eligibility, verification,
approval or private-document read boundary was relaxed. Pending/rejected owners
may correct their category but their public `approved` remains false. Disabled
and unverified profile/projection batches fail.

Legacy users may lack the category ID, rating totals, job total, service area or
public projection. Normal saving canonicalizes the selected category and creates
or replaces the projection atomically. No migration or profile recreation is
required. The tests cover both missing projections and October-era projections
with no stable ID and an empty public category.

## Changes and validation

Files changed by this task:

- `firestore.rules`: strengthen the existing category `getAfter()` condition.
- `src/services/user.service.ts`: recheck the current account inside profile save.
- `scripts/tests/profile-save-emulator.test.mjs`: execute the actual client service
  against Auth/Firestore demo emulators; isolate deployed snapshot failures;
  exercise legacy/current records, atomic consistency, category validation,
  foreign/disabled/unverified/customer writes, approval/rating/job-total tampering
  and nonzero value preservation.
- This report. All pre-existing working tree edits were retained.

Checks:

- Mobile TypeScript: `npx.cmd tsc --noEmit` — passed.
- Functions TypeScript: `npm.cmd run build --prefix functions` — passed.
- Mobile lint: `npm.cmd run lint` — zero errors; existing cleanup-ref warning at
  `app/technician/job-action.tsx:50` remains.
- Local Rules: 5 profile-save tests and 4 existing category/security tests passed.
  The deployed-only test is intentionally skipped in local mode.
- Downloaded deployed Rules: 1 reproduction test passed (all three rejection
  assertions and rollback verified); 5 local-only tests intentionally skipped.
- Category, map loading/actions, review-list and notification-history regression
  tests: 39 passed. These are automated regression checks, not live UI validation.
- `git diff --check` — passed.

Standard local reproduction (build shared modules first):

```powershell
npm.cmd run build --prefix functions
$env:DEBUG = ''
firebase.cmd emulators:exec --only auth,firestore --project demo-servicepilot-categories --config firebase.categories-test.json "node --test scripts/tests/profile-save-emulator.test.mjs scripts/tests/service-categories-emulator.test.mjs"
node --test scripts/tests/service-categories.test.mjs scripts/tests/technician-reviews-list.test.mjs scripts/tests/notification-history.test.mjs scripts/tests/map-loading.test.mjs scripts/tests/map-view-actions.test.mjs
```

For deployed-snapshot reproduction, use an emulator config pointing at the saved
snapshot instead of `firestore.rules`, set `$env:PROFILE_SAVE_RULES = 'deployed'`,
and run only `scripts/tests/profile-save-emulator.test.mjs`. Remove that variable
afterward. Never point these tests at a real project: the test hardcodes a demo
project and requires loopback Auth and Firestore emulator hosts.

The standard ports were occupied during this session. Successful runs used ignored
configs under `.firebase/review-config/profile-save/` with separate loopback ports.
Expected denied adversarial writes can log Rules evaluation errors; allowed saves
are tested separately and must succeed.

## Deployment required, not performed

Yes: production will continue rejecting the new field until the compatible Rules
are deployed. Review the complete local-versus-deployed diff first: the existing
local file also includes earlier registration/dispatcher category changes and an
unrelated evidence-note minimum-length change (10 characters). Those differences
were present before this task and were not reverted or silently deployed.

Prepared command only:

```powershell
firebase.cmd deploy --only firestore:rules --project servicepilot-756d9
```

No index changes or index deployment are needed for this save fix. No migration,
billing change, deployed Functions, commit or push was performed.

## Remaining device verification

No Android/device UI run or production save was performed. With disposable local
demo accounts and one Metro server, open technician Personal Information, change
category and save; reopen to verify persistence, service district/area retention
and save feedback. On the second emulator as customer, verify the technician's
category, profile/request actions, approval visibility and existing reviews and
notifications. Repeat with a legacy profile, and confirm existing rating/job
totals survive. GPS/map behavior was outside this narrowly scoped fix.
