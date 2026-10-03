# ServicePilot — Review Loading and Permission Fix

## Task

Fix the current Customer Review Technician loading failure in the latest local project:

`C:\Users\WW\Desktop\servicepilot-mobile`

Observed runtime error:

```text
Review load error: FirebaseError: Missing or insufficient permissions.
```

Earlier, this same flow displayed:

```text
This request has no assigned technician to review.
```

Investigate whether these failures share a request-schema mismatch, but do not assume they have the same cause.

Implement a verified fix, not just advice or error suppression.

## Preserve Existing Work

- Read existing repository instructions before editing. This file supplements existing project instructions; do not replace the root AGENTS.md blindly.
- Inspect git status and preserve all unrelated uncommitted work.
- Use the latest local files, not an older GitHub snapshot.
- Preserve React Native / Expo Router / TypeScript, Firebase Authentication, Firestore, and the existing Admin Web.
- Customers select approved Technicians directly. Dispatcher reviews Technician applications; do not restore Dispatcher job assignment.
- Preserve existing Customer, Technician, Dispatcher, and Super Admin access boundaries.
- Preserve the recent Notifications and broadcast permission fixes.
- Keep Firebase email verification working. Do not restore OTP or resume SMTP work.
- Do not redesign screens or rewrite authentication for this task.

## Deployment Evidence

The user already ran:

```powershell
firebase deploy --only firestore:rules
```

The CLI targeted `servicepilot-756d9`, compiled the rules successfully, reported the local rules were already up to date, released the rules, and finished with `Deploy complete!`.

The user then restarted Expo with `npx expo start -c`; the review loading permission error remained.

Successful deployment confirms deployment, not authorization correctness. Do not repeat cache-clearing or unchanged-rules deployment as the proposed fix.

Other observed warnings concern AsyncStorage auth persistence and Expo package compatibility. Treat them separately unless evidence directly links them to the failing read. Do not expand this task into dependency upgrades.

## Inspect and Trace

Locate the actual current files. Likely areas:

- `app/(tabs)/review-technician.tsx`
- Customer request details and review navigation
- `src/services/review.service.ts`
- `src/services/request.service.ts`
- `src/services/technician.service.ts`
- Request/review types and mapping helpers
- `firestore.rules` and its role/ownership helpers
- `firebase.json` and Firebase client configuration

Trace every read separately:

1. Resolve the route request ID.
2. Load the persisted service request.
3. Resolve its Technician identity.
4. Load any required Technician profile.
5. Check whether a review already exists.
6. Display either the eligible form or existing review.

Identify the exact failing getDoc or query and rule condition. If necessary, add temporary development-only diagnostics containing operation names, collection paths, document IDs, and safe error codes. Never log tokens, passwords, secrets, full personal documents, or credentials.

Verify authenticated-user/profile readiness and the existing account-status, email-verification, and role conditions. Verify that the app targets the intended Firebase project and database.

## Priority Hypothesis: First-Time Review Read

The earlier review service used a deterministic review ID such as:

```text
<requestId>_<customerId>
```

Confirm the current convention before using it.

A first-time review check may read a document that does not exist yet. If authorization relies only on `resource.data.customerId`, that absent-document read can be denied instead of returning `exists() == false`.

This is a hypothesis, not a confirmed diagnosis. Reproduce it with the actual rules and a focused emulator test.

If confirmed, securely support the absence check using authoritative ownership information or another deliberately scoped lookup compatible with the rules. Do not authorize arbitrary review IDs globally. Distinguish single-document get permissions from query/list permissions.

Never catch permission-denied and return null as though the review does not exist.

## Technician Identity Consistency

Compare request creation, request mapping, review loading, review submission, and rules:

- Current direct-selection requests may use `technicianId`.
- Legacy requests may use `assignedTechnicianId`.

Confirm actual field names and support legitimate legacy data deliberately. Use the persisted request as the authoritative source, not an arbitrary route parameter or Customer-provided Technician UID.

If both fields exist and conflict, do not silently choose one. If neither provides a valid identity, show a clear unavailable state. Do not fabricate IDs or automatically repair production records.

## Security Requirements

- Only the owning Customer may submit a review for an eligible completed request.
- The review Technician must match the persisted request's canonical Technician.
- Rating must be an integer from 1 through 5.
- One review per request; concurrent duplicate attempts must not overwrite the first review or double-count ratings.
- Preserve existing intended public Technician-review access. Do not accidentally expose private requests or fields through new read permissions.
- Technicians retain authorized access to reviews associated with their account.
- Active Super Admin retains authorized monitoring access.
- Do not add Dispatcher privileges beyond existing requirements.
- Preserve protections on Technician average-rating/review-count aggregates.
- Preserve unauthenticated access restrictions.
- Do not use permissive rules or client-side filtering to bypass denied queries. Firestore rules are not filters.

## UI and Error Handling

- Eligible completed request with no review: show the review form.
- Existing review: show the existing review and prevent duplicate submission.
- Unauthorized or incomplete request: show a clear appropriate unavailable state.
- Actual read failure: show a friendly error and retry option; do not claim there is no review.
- Preserve loading state until required auth/profile and request data resolve.
- Do not weaken checks just to make the form appear.

## Required Verification

Use emulator fixtures/test accounts and focused tests where possible:

1. Owning Customer opens a completed request with no review.
2. Owning Customer opens a completed request with an existing review.
3. Another Customer attempts private request/review access.
4. Incomplete request cannot be reviewed.
5. Current Technician ID schema resolves correctly.
6. Supported legacy schema resolves correctly.
7. Missing or conflicting Technician IDs are handled safely.
8. Valid submission succeeds and duplicates/concurrent duplicates are blocked.
9. Forged Technician UID and invalid ratings are rejected.
10. Intended Technician, Customer browsing, and Super Admin review reads still work.
11. Existing rating aggregation remains correct and Notifications still work.

Do not create test records in production automatically. State which checks ran and which still require manual verification. If live access is unavailable, do not claim end-to-end success.

## Completion and Handoff

Report:

- Confirmed root cause, exact failing read, and denying rule/helper.
- Files changed and why.
- Request/review schema compatibility decisions.
- Tests run and results.
- Any data repair needed, without performing automatic production migration.
- Remaining manual verification and deployment steps.

If rules changed, provide this command after local verification:

```powershell
firebase deploy --only firestore:rules --project servicepilot-756d9
```

Report any required indexes separately; do not claim a missing index explains permission-denied without evidence.

Completion means authorized first-time and existing-review loading both work while unauthorized operations remain denied. Error suppression alone is not completion.
