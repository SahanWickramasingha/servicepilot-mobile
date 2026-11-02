Service category filtering — validated November 1, 2026 (Asia/Colombo)

The existing shared catalogue is `functions/src/domain/serviceCategories.ts`.
It defines seven stable specialty IDs and labels independently of account role.
Registration and Personal Information use the shared picker; registration saves
the ID and canonical specialization label. Profile edits atomically update the
private user and allowlisted public projection. Mobile and Admin Web approval
normalize recognized legacy specialties in their existing approval batch. Home
cards already link to `/technicians` with the stable category ID, cleared search
and All divisions. Customer cards, profiles and map cards resolve the same label.
These existing paths were inspected and tested rather than replaced.

This change fixes division chips failing to persist their value into route
parameters: switching category could previously restore an earlier division.
Search, division and category now survive chip changes together; a Home category
link resets the directory as intended, including a link to the same category.
It also prevents an unrecognized explicit legacy `serviceCategory` from being
hidden by a recognized `specialization`. The TypeScript resolver and generated
Firestore Rules agree. An explicit valid stable ID remains authoritative.
Unresolved specialties display `Category needs review`, remain eligible for All
services, and never silently become Other or Electrical.

Read-only production audit

The bounded Admin SDK audit read both technician users and their public map
projections from servicepilot-756d9. It found two technician records; the audit
was complete. No remote writes were performed. Current records:

| Technician | User and public specialization | Public category | Action |
| --- | --- | --- | --- |
| Amila (`PfeMbXYqeXb4NKg2cNk86P6Bnmt1`) | Electric Item | Empty; no stable ID | Manual correction required. Ask the technician to select their actual specialty in Personal Information. The evidence does not distinguish Electrical from Appliance Repair. |
| Gihan (`Z3o2tljh2XS1ubdmOR5lJdrvTfg1`) | AC technician | Empty; no stable ID | Confirmed exact alias for `air-conditioning` / Air Conditioning. Read compatibility includes this record; a normal profile save or approval writes canonical fields. |

Both users and projections are approved. Amila serves `kurunegala`; Gihan serves
`kandy`. The category query includes empty legacy projections as bounded
candidates, then resolves their category before display. Thus zero Electrical
results is correct for these current records. Gihan matches Air Conditioning.
Neither approval nor account visibility rules were relaxed. Server document
reads still recheck current eligibility; private profiles are not exposed.

All four read-only index probes passed: Electrical and Air Conditioning, each
with All divisions and Kandy. No additional indexes are required. Audit and
offline review-plan artifacts are ignored local files under `secrets/`; credentials
are never included in this document. To repeat the read-only audit and offline plan:

```powershell
node scripts/audit-technician-categories.mjs --credential secrets/serviceAccountKey.json --output secrets/category-audit.json --check-indexes
node scripts/plan-technician-categories.mjs --audit secrets/category-audit.json --output secrets/category-plan.json
```

There is no required bulk migration and no automatic apply mode. Normal profile
saves are the correction path. No production records, billing, hosting or deployed
configuration were changed. Nothing was committed or pushed.

Changed files

- `app/(tabs)/technicians.tsx`: persist the division route parameter.
- `functions/src/domain/serviceCategories.ts`: reject unresolved explicit legacy categories.
- `scripts/generate-service-category-rules.mjs` and `firestore.rules`: equivalent generated validation.
- `scripts/tests/service-categories.test.mjs`: mapping, combined navigation/filter state, registration and both approval services.
- `scripts/tests/service-categories-emulator.test.mjs`: ambiguous legacy approval denial and owner correction without granting approval.
- This validation report.

Validation results

- Mobile TypeScript (`npx.cmd tsc --noEmit`): passed.
- Functions TypeScript (`npm.cmd run build --prefix functions`): passed.
- Admin Web build: passed; existing large-bundle advisory remains.
- Mobile lint: zero errors; existing cleanup-ref warning at `app/technician/job-action.tsx:50`.
- Admin Web lint: zero errors; ten existing hook/fast-refresh warnings in unchanged files.
- Shared catalogue/generated Rules consistency: passed.
- Category mapping, directory filtering/navigation, profile save, registration and both approval services: 7/7 tests passed.
- Local Auth/Firestore demo emulator category/security tests: 4/4 passed, including owner-only atomic updates, role/approval/rating protection, dispatcher normalization, ambiguous-category rejection, and current disabled-account visibility checks.
- Existing map loading/actions, technician reviews and notification history regressions: 32/32 passed.

Reproduction commands (local demo data only):

```powershell
node scripts/generate-service-category-rules.mjs
node --test scripts/tests/service-categories.test.mjs
firebase.cmd emulators:exec --only auth,firestore --project demo-servicepilot-categories --config firebase.categories-test.json "node --test scripts/tests/service-categories-emulator.test.mjs"
node --test scripts/tests/technician-reviews-list.test.mjs scripts/tests/notification-history.test.mjs scripts/tests/map-loading.test.mjs scripts/tests/map-view-actions.test.mjs
```

The generated Rules change needs separate reviewed deployment before production
enforcement. The following commands are prepared only, **not executed**:

```powershell
firebase.cmd deploy --only firestore:rules --project servicepilot-756d9
# Existing indexes only; the audit found these available already:
firebase.cmd deploy --only firestore:indexes --project servicepilot-756d9
```

Remaining manual verification

No device UI or two-emulator Metro session was performed for this category task.
Use disposable local demo accounts and one Metro server; do not edit production
accounts for testing:

1. On a technician emulator, register with Electrical and verify pending approval. Approve through the existing dispatcher/Admin Web flow. Reopen Personal Information and confirm Electrical persists.
2. On a customer emulator, tap Home Electrical. Confirm only eligible Electrical technicians appear, with the same label on Home, directory and profile; verify the selected technician ID in profile/request actions.
3. Select a division, enter a name search, then change category. Confirm the division/search remain selected and results satisfy all filters. Return through a Home category card, including the same category, and confirm stale search/division clear.
4. Change the technician specialty to Plumbing and save. Confirm old-category results remove the technician and new-category results include them. Verify loading, save error and success feedback.
5. Seed a disposable legacy AC technician and an Electric Item technician. Confirm Air Conditioning includes only the recognized alias, while the ambiguous record appears under All as Category needs review. Explicitly select a specialty as that technician and verify persistence.
6. Confirm pending/rejected/disabled technicians stay hidden, and existing reviews, real reviewer names, notifications and map/service-area behaviour remain intact.
