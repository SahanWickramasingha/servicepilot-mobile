The user applied the targeted production name-only repair on October 2, 2026. A subsequent read-only Admin SDK check confirmed that the existing Amila review now stores `customerName: "Bandara"`, matching its authoritative Customer profile. The assistant did not perform production writes or deployments. No further backfill is needed for this review.

Read-only Admin SDK inspection confirmed project `servicepilot-756d9`, database `(default)`, and these linked documents:

| Reference | Confirmed ID |
| --- | --- |
| Review | `Fs0yP9Qyn8OWwgJoMNNc_m1KOzzAznhODroM4C9sAX72NSKj1` |
| Technician (Amila) | `PfeMbXYqeXb4NKg2cNk86P6Bnmt1` |
| Customer (Bandara) | `m1KOzzAznhODroM4C9sAX72NSKj1` |
| Completed request | `Fs0yP9Qyn8OWwgJoMNNc` |

The review has rating `4`, timestamp `2026-10-01T18:05:32.909Z` (October 1 in Asia/Colombo), and stored comment `Verry good service`. The stored spelling differs from the supplied `Very good service`. Identity was confirmed through Amila's Technician profile, the Technician-scoped review query, all three persisted reference IDs, and the linked completed request; the comment was not used as the sole identifier.

Originally no name field was present in this review. `users/{customerId}.fullName` is `Bandara`, and its role is `customer`. The completed request has exactly the same Customer and Technician IDs. Both service mappings already include `customerName`, and the Customer-facing `app/(tabs)/technician-profile.tsx` review card reads that same field through `src/utils/reviewAuthor.ts`. There is no author lookup to fail silently. The original helper turned the absent snapshot into the literal `Customer` label. Creating the backfill initially left production unchanged; the user's explicit apply command has now repaired the existing record. Adding snapshots to future submissions alone could not change this existing document.

The display helper now preserves unresolved identity as absent. The existing review-card design shows `Reviewer name unavailable` with `?` until a real snapshot is available, never a role label or another person's name. The repaired review's saved snapshot now resolves to `Bandara / B`; its display on a live device still requires visual confirmation.

The repair reads the authoritative Customer profile by the persisted review's `customerId`. It only replaces absent, blank, non-string, or literal `Customer` snapshots (case insensitive), and preserves real historical snapshots. The request must belong to that Customer, be completed, and have a matching canonical Technician: `technicianId`, or supported legacy `assignedTechnicianId`. Conflicting identities are rejected. Neither viewer nor Technician names supply the author.

Run from `C:\Users\WW\Desktop\servicepilot-mobile`. Existing ignored local credentials are loaded privately from the configured environment or `secrets/service-account.json` / `secrets/serviceAccountKey.json`; do not copy them into source code. The project must match `servicepilot-756d9`.

Dry-run (already run successfully against this production review):

```powershell
node scripts/backfill-reviewer-names.mjs --review-id Fs0yP9Qyn8OWwgJoMNNc_m1KOzzAznhODroM4C9sAX72NSKj1 --expected-name "Bandara"
```

The original dry-run proposed only `customerName: null -> "Bandara"`. No rating, comment, ID, timestamp, profile, request, or aggregate changes were proposed.

Apply command already run successfully by the user (kept for reference; it is not needed again for this review):

```powershell
node scripts/backfill-reviewer-names.mjs --review-id Fs0yP9Qyn8OWwgJoMNNc_m1KOzzAznhODroM4C9sAX72NSKj1 --expected-name "Bandara" --apply
```

The apply operation re-reads the review, Customer profile, and request in a transaction. It rejects a changed authoritative name and writes only `customerName`. A concurrent repair cannot be overwritten. Re-running after a successful repair produces no proposed changes. This is an update, so the existing `onDocumentCreated` rating aggregator is not triggered. No production migration runs automatically.

Future submissions now require the authenticated Customer's real authoritative `fullName`, kept exactly as stored for Firestore-rule equality. Missing names and `Customer` placeholders cause a clear profile-update error. The rules require this snapshot and reject missing, forged, whitespace-only, and placeholder names. Legacy reviews remain readable; Customer-profile permissions, review-read permissions, duplicate protection, Notifications, and aggregate-write protection remain unchanged. The existing screen uses a shared display-name/initials helper and retains its UI.

After local verification, deploy the changed review-create rules:

```powershell
firebase deploy --only firestore:rules --project servicepilot-756d9
```

No new indexes or Functions deployments are required for the name repair. The name-only Admin update does not depend on deploying these rules.

Verification completed:

- Read-only production inspection and targeted dry-run: passed, with one proposed name change.
- Post-apply production read: confirmed `customerName: "Bandara"`, equality with the linked Customer's authoritative `fullName`, rating `4`, the original reference IDs, and timestamp `2026-10-01T18:05:32.909Z`.
- Twelve focused tests against the real local rules in loopback Firestore and Auth emulators: passed. Tests use a guarded demo project and run the actual review, user-profile, Technician-review mapping, and notification services.
- Two separate Firebase Auth emulator accounts were created and signed in. Customer A (`auth-customer-a`, name `Bandara`) submitted through the actual review service; Customer B (`auth-customer-b`, name `Different Customer`) received A's `Bandara / B` display through the actual Technician-review mapper and card display helpers. B also saw `Bandara / B` on a repaired existing review fixture, while being denied reads of A's private Customer profile. These are emulator checks, not live production account or device UI verification.
- Tests cover first-time review lookup, existing-name repair and initials, literal placeholders, preservation of historical snapshots and all non-name fields/aggregates, current and legacy Technician IDs, invalid/conflicting identities, required/forged names, exact profile whitespace, valid submission, concurrent duplicates, invalid ratings, private profiles/requests, Customer/Technician/Super Admin reads, denied Dispatcher/other-Technician/unauthenticated access, aggregate tampering, personal Notifications, and broadcast read markers.
- Focused TypeScript and ESLint checks for the changed mobile files, plus script syntax checks: passed.
- Full repository `tsc --noEmit`: remains blocked by errors outside the changed files, including Admin Web Vite types/assets, OTP test types, and existing template component aliases.

Reproduce the emulator checks with debug output disabled (the CLI can otherwise log inherited environment values):

```powershell
Remove-Item Env:DEBUG -ErrorAction SilentlyContinue
firebase.cmd emulators:exec --only firestore,auth --project demo-servicepilot-review-author --config firebase.review-author-test.json "node --test scripts/tests/reviewer-names.test.mjs"
```

Remaining manual verification: open Amila's profile with the latest mobile code and confirm this existing 4/5 review displays `Bandara` with initial `B` and the same comment/date. Deploy the rules for future reviews if they have not yet been deployed, and verify a new Customer review in the app. No live UI end-to-end success or Functions aggregation execution was claimed; the emulator verifies that this repair preserves stored aggregate values and duplicate prevention remains enforced.
