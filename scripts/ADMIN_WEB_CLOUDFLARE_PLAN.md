# Admin Web hosting assessment and deployment plan

Follow-up local implementation: [`admin-worker/README.md`](../admin-worker/README.md)
documents the separate REST Admin Worker adapter, Pages configuration, tests,
setup commands and remaining Free-plan blockers. The findings below describe the
original Node runtime and the repository before that adapter was added.

Inspected 2026-11-02. This is a review-only plan: no deployment, production data
write, commit, push, or billing change. Existing staged and unstaged work is
preserved. Booking and photo Workers were not changed by this assessment.

## Current architecture and hosting

- `admin-web/`: React 19, TypeScript 6, Vite 8, React Router 7 `BrowserRouter`.
  `build` runs `tsc -b && vite build`, producing static `admin-web/dist/`
  (`index.html` and `assets/`). No SSR or frontend Node process is required.
- `functions/src/dispatcher-main.ts`: separate Node 22 HTTP service, built to
  `functions/lib/dispatcher-main.js`. Uses Firebase Admin, Firestore transactions,
  Auth account management, and Nodemailer SMTP. It is deliberately not exported
  from the Cloud Functions index. `functions` contains Firebase Functions as well;
  `functions:serve` is not a package script, and the package's `serve`/`start`
  scripts do not start this standalone Admin API.
- `.firebaserc` selects `servicepilot-756d9`. Root `firebase.json` serves `public/`,
  with clean URLs and protective `/auth/*` headers. It has no Admin SPA or API
  rewrite. It separately configures Functions, Firestore rules/indexes, and Storage
  rules; that does not deploy the standalone service.
- `firebase.dispatcher-hosting.json` is an optional review configuration serving
  `.expo/dispatcher-hosting-review/`, with SPA fallback and `/auth/*` headers.
  Existing instructions merge `public/` and Admin dist into that staging folder.
  Do not replace existing public auth/legal pages when selecting a hosting target.
- No Admin-specific Wrangler entry, Pages configuration, or backend hosting
  manifest was found. Booking, photo and legacy OTP Wrangler configs belong to
  separate services. Repository configuration does not prove what is live remotely;
  remote deployments, DNS, authorized domains and secret stores were not inspected.

## Exact local commands (PowerShell, repository root)

Use Node 22.12+ within Node 22 (checks here used 22.17). Initial dependency/build
commands, when dependencies need installing:

```powershell
npm.cmd --prefix admin-web ci
npm.cmd --prefix functions ci
npm.cmd --prefix functions run build
```

For isolated local UI and backend development, use three terminals. Java 21+
and the Firebase CLI are needed for the emulators. Use the same demo project as
the existing Admin Web emulator configuration; this differs from the integration
tests' demo project. No demo users or Super Admin are created by these commands.

Terminal 1:

```powershell
$env:DEBUG = ''
firebase.cmd emulators:start --project demo-servicepilot-review-author --config firebase.dispatcher-test.json --only auth,firestore
```

Terminal 2 (standalone API; emulator mode sends no external email):

```powershell
$env:DISPATCHER_MODE = 'emulator'
$env:DISPATCHER_SERVICES = 'all'
$env:GOOGLE_CLOUD_PROJECT = 'demo-servicepilot-review-author'
$env:FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9197'
$env:FIRESTORE_EMULATOR_HOST = '127.0.0.1:8187'
$env:DISPATCHER_ADMIN_ORIGIN = 'http://127.0.0.1:5173'
$env:PORT = '8789'
npm.cmd --prefix functions run dispatcher:serve
```

Terminal 3:

```powershell
$env:VITE_USE_FIREBASE_EMULATORS = '1'
$env:VITE_DISPATCHER_API_URL = 'http://127.0.0.1:8789'
npm.cmd --prefix admin-web run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Open `http://127.0.0.1:5173/login`. A disposable demo Super Admin requires a
demo Auth user and authoritative matching `users/{uid}` profile. Use only reviewed
demo fixtures; do not run a production bootstrap just to test the portal. A normal
dev session without the explicit emulator flag uses the real Firebase project.

Production artifact check and local static preview:

```powershell
npm.cmd --prefix admin-web run build
npm.cmd --prefix admin-web run preview -- --host 127.0.0.1 --port 4173 --strictPort
```

Vite preview serves static production output. Its emulator mode is disabled because
the app gates emulator connections on `DEV`. The browser rejects HTTP API URLs in
production output, including loopback URLs. Supply the real HTTPS public API URL
at build time to exercise production API calls; a successful build alone does not
validate that configuration. Neither Vite nor `dispatcher-main.ts` loads root
`.env.local` into this server automatically; supply backend settings through the
server environment/host secret manager. Vite reads its own `admin-web/.env*` files
and process environment. No existing env file was edited.

## Required API surface

| Method/path | Purpose / JSON input |
| --- | --- |
| `POST /v1/dispatchers` | Create invitation: `{ fullName, email, requestId }`. |
| `POST /v1/dispatchers/resend-invitation` | Resend pending invitation: `{ uid }`. |
| `POST /v1/accounts/lifecycle` | `{ targetUid, action, requestId }`; action `disable`, `enable`, or `delete` (soft deletion). |
| `OPTIONS` | CORS preflight; exact configured Admin origin, POST/OPTIONS and Authorization/Content-Type allowed. |
| `GET /healthz` | Process liveness; no authentication. |
| `GET /readyz` | Auth/Firestore dependency readiness; 200 or 503, no authentication. Does not test SMTP delivery. |

POST requests require a Firebase ID token in `Authorization: Bearer ...` and
`Content-Type: application/json`; bodies are bounded to 4096 bytes. The frontend
appends these paths to `VITE_DISPATCHER_API_URL`; preserve paths and OPTIONS through
any reverse proxy. CORS is not authorization: non-browser calls still require tokens.

The combined runtime also exposes `POST /v1/bookings/schedule`. This is not an Admin
Web requirement, and has separate scheduling authorization. Leave the existing
booking Worker URL and photo Worker URL untouched. `DISPATCHER_SERVICES=booking`
removes the privileged Admin endpoints; use `all` for this existing Admin runtime.
There is currently no admin-only services mode.

Most portal data is read/written directly through the browser Firebase SDK, not
through these HTTP routes. Firestore security rules remain essential, including
for technician application review, moderation, messages, audits and role boundaries.

## Authentication and authorization

- Browser login uses Firebase email/password and subscribes to `users/{uid}`.
  Only `super_admin` and `dispatcher` reach their corresponding portal routes.
  Disabled/deleted/pending-lifecycle/revoked sessions close access and sign out.
  Legacy absent account status can pass the browser gate; this does not grant API
  authority. Do not infer an email-verification requirement that the login code
  does not impose.
- All three privileged POST endpoints use `createSuperAdminAuthorizer`: Admin SDK
  `verifyIdToken(token, true)` checks expiry, revocation and disabled accounts;
  Firestore must contain exact `role=super_admin`, `accountStatus=active`, no
  `lifecyclePending=true`, and an auth time later than any `sessionRevokedAt`.
  Caller-supplied UIDs, role flags and token role claims do not grant this authority.
- Provisioning/lifecycle use server-side validation, transaction coordination,
  audit records and retry receipts. Browser route guards are not a substitute.
  Dispatcher accounts cannot provision other dispatchers or manage account lifecycle.
  Dispatchers review technician applications; customers select technicians directly.
- Production needs server ADC/workload identity with reviewed Firebase Auth
  management and Firestore permissions (existing guidance lists
  `roles/firebaseauth.admin` and `roles/datastore.user`). Prefer managed identity;
  `GOOGLE_APPLICATION_CREDENTIALS` is optional when another valid ADC mechanism is
  available. No credential contents or ADC availability were read/tested here.
- Invitation setup links use `${DISPATCHER_ADMIN_ORIGIN}/login` as the continue
  URL. Confirm the chosen portal domain in Firebase Auth authorized domains and
  preserve the existing email action handler configuration.

## Cloudflare compatibility and proposed deployment sequence

1. **Frontend: compatible with Cloudflare Pages static hosting.** Keep repository
   root as the build root because the frontend imports shared modules from
   `functions/src/domain/`. Build command:
   `npm ci --prefix admin-web && npm run build --prefix admin-web`.
   Output directory: `admin-web/dist`. Pin a compatible Node 22 version.
   Pages serves React/Vite static output and defaults to SPA fallback when there
   is no top-level `404.html`; verify deep refreshes at `/login`, `/admin/dashboard`
   and `/dispatcher/dashboard`. See [React builds](https://developers.cloudflare.com/pages/framework-guides/deploy-a-react-site/)
   and [SPA behavior](https://developers.cloudflare.com/pages/configuration/serving-pages/).
2. **Existing backend: not deployable unchanged as a Pages asset or Worker.** It
   starts a persistent Node process, uses ADC, Firebase Admin's default Firestore
   gRPC transport and SMTP. Workers now supports Node HTTP via `httpServerHandler`,
   but this entry has no Worker handler and uses a host-binding listen signature.
   Cloudflare lists `node:http2` as a nonfunctional stub; installed gRPC uses
   `http2.connect`. HTTP support alone does not make this dependency graph usable.
   See [Node compatibility](https://developers.cloudflare.com/workers/runtime-apis/nodejs/)
   and [HTTP integration](https://developers.cloudflare.com/workers/runtime-apis/nodejs/http/).
   This is a source/dependency assessment, not an executed Worker deployment test.
3. **Recommended path preserving the backend:** choose an approved Node 22 host
   with an acceptable existing/free allocation, HTTPS ingress, Firebase connectivity,
   runtime identity and SMTP egress. Build with `npm ci --prefix functions` and
   `npm run build --prefix functions`; start with
   `npm run dispatcher:serve --prefix functions`. Set production mode, project,
   exact trusted portal origin, SMTP settings and host port. Containers generally
   need `DISPATCHER_BIND_ADDRESS=0.0.0.0`; default is loopback. Do not assume a host
   has free SMTP or a suitable free tier without checking its current terms.
4. **If Cloudflare-only is required:** scope a separate Admin Worker, without
   changing booking/photo Workers. Evaluate a REST Firestore transport or REST
   adapter, Firebase Auth management/revocation verification, server credential
   handling, transaction/retry semantics and mail delivery compatibility. An HTTP
   mail provider is another option requiring an owner decision. Do not assume
   setting `preferRest` alone ports the runtime. Preserve all authorization,
   idempotency, audit and failure tests before selecting that architecture.
5. Once the backend origin is chosen, set public frontend build variable
   `VITE_DISPATCHER_API_URL` to that HTTPS origin, and backend
   `DISPATCHER_ADMIN_ORIGIN` to the exact final frontend origin. Use a stable portal
   domain; arbitrary Pages preview domains are not automatically CORS-authorized.
   Rebuild the frontend when its API URL changes. This value is public.
6. Review Firebase authorized domains and current deployed rules/indexes separately;
   do not deploy dirty unrelated rule changes as part of hosting setup. Check hosted
   HTTPS/CORS, revoked/unauthorized sessions, role routes, invitation delivery and
   safe retries using approved non-production fixtures before publication approval.
   Preserve existing Firebase public auth/legal hosting and mobile API URLs.

Never set Admin SDK private keys, service-account JSON, SMTP passwords or privileged
tokens in `VITE_*`, `EXPO_PUBLIC_*`, frontend source, Pages static files, or build
artifacts. Pages frontend builds need only public Firebase client settings (already
in source) and the public API URL. Put runtime secrets only in the backend's secret
manager, outside Git and static uploads.

## Missing values and decisions

Local presence-only audit checked the current process and root/Admin/functions
common `.env*` files without printing values. These were absent:

- Frontend: `VITE_DISPATCHER_API_URL`.
- Required production server: `DISPATCHER_MODE`, `GOOGLE_CLOUD_PROJECT`,
  `DISPATCHER_ADMIN_ORIGIN`, `DISPATCHER_SMTP_HOST`, `DISPATCHER_SMTP_PORT`,
  `DISPATCHER_SMTP_USER`, `DISPATCHER_SMTP_PASSWORD`, `DISPATCHER_SMTP_FROM`.
  Known intended values are `production` and `servicepilot-756d9` for the first two.
- Optional/unset: `DISPATCHER_SERVICES` (defaults `all`), `PORT` (defaults `8789`),
  `DISPATCHER_BIND_ADDRESS` (defaults loopback), `VITE_USE_FIREBASE_EMULATORS`
  (leave disabled in production), and `GOOGLE_APPLICATION_CREDENTIALS` (not needed
  with working managed ADC).
- Decisions/remote facts not verified: Cloudflare account/project name and access,
  release branch/workflow, portal domain, backend provider/HTTPS origin and acceptable
  cost limits, runtime identity/IAM, SMTP provider and sender authorization, Firebase
  authorized domains, and availability of an existing active Super Admin. No remote
  account/secret store was queried, so local absence does not prove remote absence.

## Checks performed

- Admin Web TypeScript/Vite production build: PASS; existing large-chunk warning.
- Admin Web lint: PASS, zero errors and 10 existing warnings.
- Backend TypeScript build: PASS.
- Dispatcher provisioning and account lifecycle emulator integration: 31 PASS.
  The first direct test attempt correctly refused missing emulator configuration;
  rerun with local demo Auth/Firestore emulators completed successfully.
- No hosted browser flow, real email delivery, Cloudflare deployment, live IAM,
  DNS, or production authorization was tested. No frontend/server source or Worker
  change is needed merely to record this plan. No migration was prepared or run.

Repeat integration checks (repository root):

```powershell
$env:DEBUG = ''
$env:JAVA_TOOL_OPTIONS = '-Xmx512m -Djava.net.preferIPv4Stack=true'
$env:CI = '1'
npm.cmd --prefix functions run build
firebase.cmd emulators:exec --project demo-servicepilot-dispatcher --config firebase.dispatcher-test.json --only 'auth,firestore' 'node --test scripts/tests/dispatcher-provisioning.test.mjs scripts/tests/account-lifecycle.test.mjs'
```
