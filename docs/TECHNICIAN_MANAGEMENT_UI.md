# Technician management and application review UI

Scope: `/admin/applications`, `/admin/technicians`,
`/dispatcher/applications`, `/dispatcher/technicians`. Existing unrelated local
changes were retained. No deployment, production record change, commit, push or
APK build was performed.

## Result

All four routes use the shared `TechnicianManagement` page, application dialog
and presentation helpers. Pending review is the default Applications filter;
explicit All/Pending/Approved/Rejected filters also allow inspecting review
history. Each eligible row exposes **View application**, a blue **Approve**
button with a check icon, and a restrained red outline **Reject** button.
Incomplete, unverified, inactive, already reviewed or identity-mismatched records
never gain review actions. The existing shared eligibility predicate and
transactional approval service remain the authority.

The application dialog separates identity/contact, service/background and review
history. Approval requires a separate confirmation. Rejection requires a trimmed,
nonempty reason of at most 2,000 characters. Saving disables actions, provides
progress and prevents duplicate submissions. Success is announced and the live
lists refresh. A competing decision refreshes the actual authorized technician
record from the server, explains the conflict, and removes stale approval actions.

Approval and account statuses have separate columns and badges. Super Admin
retains rating and authorized account lifecycle actions; Dispatcher gets no
account management controls. Existing approval, lifecycle, projection and rating
services are reused. Availability and GPS sharing are untouched by reviews.
Account actions retain their existing lifecycle service semantics, including
typed DELETE confirmation and recovery actions.

Reviewer names use the already-authorized session profile when the audit UID
matches. Other reviewers display **Reviewer unavailable**, without attempting
unauthorized Dispatcher reads of reviewer profiles. The original reviewer UID,
time and rejection reason remain in the dialog; UIDs are under optional Audit
details rather than used as the main label. No names are guessed or written.

## Field mapping investigation

`src/services/user.service.ts` persists `data.experience` to `experience` and
`data.qualifications` to `qualifications`; registration also submits these
separately. Existing web views mapped these fields correctly. The new dialog
continues to show `technician.experience` under Experience and
`technician.qualifications` under Qualifications, with a separate Certifications
field. If a record stores “BSE degree” in Experience, it remains there as submitted;
this UI does not relabel, repair or invent record content. Browser regressions
cover both distinct correct fields and that mis-entered stored-value case.

Declared service areas use the existing canonical district/area display helper,
with legacy serviceDivision/serviceAreas fallback. A private street address is
shown only in the authorized identity section and is not used to infer a service
area or current location.

## Queries, pagination and accessibility

The four pages use bounded 50-record cursor queries on technician `users` records.
This replaces Super Admin's previous whole-users collection read on Technicians.
Pending filters retain verified/complete eligibility filtering. Existing unrelated
Dashboard hook callers retain their previous query mode. New Previous/Next
controls retain a history of raw query cursors; they do not use filtered/search
results as cursors. Filter changes reset paging. The footer reports Page N and
the displayed count for that page, never a global total. Search explicitly says
it applies to the current page. A full raw page may offer Next even when the next
page is empty; Previous remains available. No total-count query is introduced.

Server confirmation, initial timeout, error/Retry and confirmed empty states are
distinct. Listeners and timers are released on scope changes/unmount; closed
callbacks cannot republish old data. Success/retry reconnect only the active
bounded scope. No polling or broad reviewer-profile fetch is added.

Styles are scoped to these pages and dialogs: navy surfaces, blue accents,
readable 14px body text, stronger secondary text, consistent buttons and spacing.
At narrow widths rows become cards, with review actions immediately after identity.
Native modal dialogs make background content inert; explicit Tab/Shift-Tab wrapping,
Escape handling, focus restoration, labels, status announcements and visible focus
outlines support keyboard use. Escape/closing is blocked during a save.

## Changed files for this increment

- `admin-web/src/components/technicians/TechnicianManagement.tsx`
- `admin-web/src/components/technicians/TechnicianApplicationDialog.tsx`
- `admin-web/src/components/technicians/TechnicianDialog.tsx`
- `admin-web/src/components/technicians/technicianPresentation.ts`
- `admin-web/src/components/technicians/technicians.css`
- `admin-web/src/pages/Technicians.tsx`
- `admin-web/src/pages/dispatcher/DispatcherApplications.tsx`
- `admin-web/src/pages/dispatcher/DispatcherTechnicians.tsx`
- `admin-web/src/hooks/useTechnicianUsers.ts`
- `admin-web/src/components/AccountLifecycleActions.tsx` (optional `showView`, existing callers unchanged)
- `admin-web/src/types.ts` (existing saved district/area fields)
- `scripts/tests/technician-management.test.mjs`
- `scripts/tests/technician-management-browser.mjs`
- `scripts/lib/technician-management-preview.mjs`
- This document.

No Rules, indexes, authentication, approval service, Worker/backend or mobile
source was changed for this UI increment. Their earlier working-tree changes
belong to prior tasks.

## Checks

- Admin Web TypeScript (`tsc -b`) and production Vite build: PASS.
- Targeted Oxlint: PASS, with three pre-existing warnings in the existing hook
  and AccountLifecycleActions exports. Full Admin Web lint: PASS with the same
  ten existing warnings; production build retains its large-chunk warning.
- Four new host tests: PASS (eligibility/identity, safe labels, bounded cursor
  history, server confirmation/Retry/cleanup).
- Nine existing host UI/category/approval regressions: PASS.
- Eleven full Auth/Firestore access/approval emulator groups: PASS, including
  both reviewer roles, atomic projection updates, invalid actors/applications,
  required reasons, racing decisions and the actual bounded application hook.
- Real headless Chrome DOM checks: PASS for all four routes at **1440×1000** and
  **390×844**. Checks cover layout overflow, eligible actions, role-specific
  account controls, field mapping, modal Tab focus/Escape/restoration, separate
  approval confirmation, duplicate guard, rejection reason, conflict refresh,
  loading/error/Retry and Previous/Next listener cleanup. Screenshots are in the
  ignored `.expo/technician-management-ui/` directory; both roles' desktop and
  narrow screenshots were visually inspected.
- Focused diff whitespace check: PASS.

The browser harness uses the actual pages/layout, shared UI and query hook, with
in-memory synthetic records and substituted Auth/Firestore/write transports.
It never initializes production Firebase. Browser interaction is evidence of UI
behavior; the separate emulator regressions validate authorization/transactions.
Chrome needed host execution because sandboxed renderer startup failed. Early
browser fixture/transport/wait issues were corrected before the passing run. A
Tab-wrapping issue found by the browser checks was fixed in the actual dialog.

Not performed: manual human interaction against live authenticated Firebase,
production account operations or deployed Pages; Firefox/Safari/Edge validation,
physical mobile browsers, screen-reader/large-text testing, actual rating backend
and lifecycle backend browser interaction, or inbox/notification verification.
These are not inferred from the fixture browser tests or compilation.

Commands from the repository root (PowerShell):

```powershell
npm.cmd --prefix admin-web run build
npm.cmd --prefix admin-web run lint
.\admin-web\node_modules\.bin\oxlint.cmd admin-web/src/components/technicians admin-web/src/hooks/useTechnicianUsers.ts admin-web/src/pages/Technicians.tsx admin-web/src/pages/dispatcher/DispatcherApplications.tsx admin-web/src/pages/dispatcher/DispatcherTechnicians.tsx admin-web/src/components/AccountLifecycleActions.tsx
node --test --test-reporter spec scripts/tests/technician-management.test.mjs scripts/tests/technician-access-ui.test.mjs scripts/tests/service-categories.test.mjs
node scripts/tests/technician-management-browser.mjs
$env:DEBUG = ''
$env:XDG_CONFIG_HOME = Join-Path $env:TEMP 'servicepilot-access-config'
firebase.cmd emulators:exec --project demo-servicepilot-access --config firebase.technician-access-test.json --only auth,firestore 'node --test --test-reporter spec scripts/tests/technician-access-emulator.test.mjs'
```

The browser runner defaults to installed Chrome; optionally set
`SERVICEPILOT_TEST_BROWSER` to an installed Chromium browser executable. It uses
an isolated ignored profile and closes its own browser/server. Fixture module
substitutions exist only in that programmatic Vite server, never the release build.

## Deployment requirements — review only

**Admin Web Pages only** for this UI increment. No new Rules/index, Worker,
Functions, migration or Mobile APK deployment is required by this change.
The separate directory fix's earlier Rules-release requirement is unchanged.

Build Pages with the existing approved Admin Worker HTTPS origin through
`build:pages`; the plain validation build above does not establish the release API
origin. Do not publish the fixture server or reuse its synthetic transports.
Review-only commands, not executed:

```powershell
$env:VITE_DISPATCHER_API_URL = (Read-Host 'Existing Admin Worker HTTPS origin').Trim()
$env:VITE_USE_FIREBASE_EMULATORS = '0'
npm.cmd --prefix admin-web run build:pages
if ($LASTEXITCODE -ne 0) { throw 'Admin Web release build failed.' }
Push-Location admin-web
try {
    ..\admin-worker\node_modules\.bin\wrangler.cmd pages deploy dist --project-name servicepilot-admin-web
    if ($LASTEXITCODE -ne 0) { throw 'Pages deployment failed.' }
}
finally { Pop-Location }
```
