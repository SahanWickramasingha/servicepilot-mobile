# Production release — 7 November 2026 (Asia/Colombo)

Released the existing Admin Worker, then rebuilt and released Admin Web. The user
explicitly authorized this release, superseding the earlier no-deployment handoff.
Root `AGENTS.md`, the current diff and applicable deployment guides were reviewed.
No nested `AGENTS.md` was present.

| Component | Result | Production reference |
| --- | --- | --- |
| Firebase project | Verified ACTIVE; project number `869400470316` | `servicepilot-756d9` |
| Firestore Rules | Already identical; no deployment | Ruleset `7092f9c8-9fb4-44f1-8945-0d6645bc52e7` |
| Firestore indexes | All 14 local definitions present and READY; no deployment | No missing or building required indexes |
| Admin Worker | Deployed successfully, 100% traffic | `servicepilot-admin`, version `f0725935-e8ef-4277-bdc4-41375e8de86f` |
| Admin Web Pages | Successful canonical **production** deployment, branch `main` | `5a722c7d-8590-4363-9a0c-01a59b5fc568` |

Production login: https://servicepilot-admin-web.pages.dev/login

Deployment URL: https://5a722c7d.servicepilot-admin-web.pages.dev

Admin API: https://servicepilot-admin.sahanwikrama29.workers.dev

Worker deployment completed at `2026-11-06T19:16:46Z`; Pages completed at
`2026-11-06T19:17:51Z` (both 7 November in Colombo).

## Release configuration

The authoritative existing Workers subdomain, Pages project metadata and previous
published bundle all identified the same Admin API origin. Both production builds
explicitly used:

```text
VITE_DISPATCHER_API_URL=https://servicepilot-admin.sahanwikrama29.workers.dev
VITE_USE_FIREBASE_EMULATORS=0
```

The published JavaScript is byte-for-byte equal to the validated local build:
`/assets/index-bDDK8cf-.js`, SHA-256
`baab0abb8a302614f0600afdf11f8153a193b71798194036d478222e3972979e`.
Its environment contains `DEV=false`, production mode and emulator flag `0`.
The retained demo branch cannot activate under these settings. The fresh browser
made no emulator requests.

Live Worker variables and secret names were compared before and after release.
`FIREBASE_PROJECT_ID=servicepilot-756d9`,
`ADMIN_WEB_ORIGIN=https://servicepilot-admin-web.pages.dev`, existing Firebase
invitation mode and the empty decision sender were preserved. `--keep-vars`
preserved dashboard variables; existing secret bindings were retained.

## Decision emails: configuration blocked

The production Worker has `ADMIN_SERVICE_ACCOUNT_EMAIL`,
`ADMIN_SERVICE_ACCOUNT_PRIVATE_KEY` and `FIREBASE_WEB_API_KEY` secret bindings.
It has **no `RESEND_API_KEY`**, and `ADMIN_EMAIL_FROM` is empty. No secret values
were displayed or copied into release artifacts. Sender/domain verification could
not be established; no test email was sent. Decision email delivery is **not
configured or verified**. Existing Firebase invitation mode was preserved.

To enable custom decision emails later, configure the intended Resend credential
as a Worker secret and a provider-verified sender as `ADMIN_EMAIL_FROM`. Keep the
current invitation provider unless a separate provider change is intended. The
new handler reports missing decision-email configuration separately from the
saved approval/rejection. No Queue binding, cron, Cloud Function or billing change
is required by this implementation. No new provider credentials were invented.

## Checks

- Functions TypeScript build and Worker TypeScript check: passed. The Functions
  build validates the shared domain code; **no Functions were deployed**.
- Host regressions: **25/25** passed (sessions/portal roles, technician management,
  categories and customer loading/error/Retry behavior).
- Worker unit/runtime regressions: **21/21** passed, including the real local
  workerd bundle with mocked external services.
- Auth/Firestore emulator integrations: final clean run **19/19** passed, including
  real web approval/rejection transactions for both roles and decision-email
  authorization, concurrency, replay, privacy and failure handling.
- Two earlier emulator runs each passed 18/19: different concurrency tests reached
  the existing REST transaction adapter's bounded `ABORTED` retry limit. A
  status-only diagnostic confirmed local HTTP 409/`ABORTED`; the final clean run
  passed without product-code or assertion changes. This intermittent contention
  remains a validation limitation, not evidence of delivered production email.
- Shared decision-email domain targeted ESLint: passed without warnings.
- Admin Web lint: **0 errors, 10 warnings**. Production builds before Worker release
  and after Worker release passed, with the existing large-chunk warning.
- Worker release dry-run: passed (333.00 KiB uncompressed).
- Local browser regression: both roles' Applications and Technicians screens at
  desktop/narrow widths; eligibility, field mapping, approval/rejection,
  confirmation, reason, duplicate guard, conflict refresh, Retry, paging,
  independent navigation and decision-email feedback passed. Uses synthetic data.
- Final `git diff --check`: passed.

## Published verification

A fresh Chromium profile checked the production site without signing in or
submitting any login/application form:

- `/login` returned 200 and loaded the released bundle.
- At 1440 and 390 pixels, selected Super Admin border/icon/radio use `#A78BFA`
  over `#211A38`; Dispatcher uses `#2DD4BF` over `#102D30`. Neutral cards, readable
  text, one 1px selected border, no shadow/double outline, blue submit button and
  no horizontal page overflow were confirmed. Screenshots were inspected.
- Pointer selection has no painted outline (`outline-style: none`); keyboard
  selection has a separate solid 3px ring. Native radio arrow keys and reduced
  motion passed. Chrome can report a 3px computed outline width even with style
  `none`; verification checks the painted style as well as width.
- Guest visits to `/admin/applications`, `/admin/technicians`,
  `/dispatcher/applications` and `/dispatcher/technicians` redirected to `/login`
  with the matching portal selected. No browser exceptions were observed.
- Worker `/healthz` and `/readyz`: 200. Readiness checks configuration only;
  it does **not** verify real Firestore/Auth/provider operations.
- Both new decision-email routes: production-origin preflight 204, unauthenticated
  POST 401 before service construction/database access/provider sends. Foreign
  origin preflight: 403.
- Postflight confirms Pages canonical deployment environment `production`, stage
  `deploy/success`, unchanged Worker settings/secrets and unchanged Rules/indexes.

Evidence and public screenshots are local ignored artifacts under
`.expo/servicepilot-release/`: `preflight.json`, `postflight.json`,
`live-verification.json` and `published-login-*.png`.

Authenticated production approval/rejection, real delivery, mobile GPS flows and
two-emulator mobile checks were **not performed**. Production records were not
read for UI verification or changed. No test emails, migrations, unrelated Worker
or Cloud Function deployments, commits, pushes or APK builds were performed.
Existing unrelated work, including the unrelated untracked file, was preserved.

## Deployment commands used (PowerShell, dependency order)

Preflight established that Firestore Rules/indexes needed no release. From the
repository root, after checks and the initial production build:

```powershell
$env:CI = '1'
$env:WRANGLER_SEND_METRICS = 'false'
$env:CLOUDFLARE_ACCOUNT_ID = 'c6d68a3e74b9240921fff94f04f6f181'
Push-Location admin-worker
try {
    .\node_modules\.bin\wrangler.cmd deploy --name servicepilot-admin --keep-vars
    if ($LASTEXITCODE -ne 0) { throw 'Admin Worker deployment failed' }
}
finally { Pop-Location }

$env:VITE_DISPATCHER_API_URL = 'https://servicepilot-admin.sahanwikrama29.workers.dev'
$env:VITE_USE_FIREBASE_EMULATORS = '0'
npm.cmd --prefix admin-web run build:pages
if ($LASTEXITCODE -ne 0) { throw 'Production Admin Web build failed' }
Push-Location admin-web
try {
    ..\admin-worker\node_modules\.bin\wrangler.cmd pages deploy dist --project-name servicepilot-admin-web --branch main --commit-dirty=true
    if ($LASTEXITCODE -ne 0) { throw 'Admin Web deployment failed' }
}
finally { Pop-Location }
```

The dirty flag describes deployment metadata; it does not create a Git commit.
Worker variables were first verified equal to live values so the checked-in empty
sender/provider defaults could not overwrite different production settings.
