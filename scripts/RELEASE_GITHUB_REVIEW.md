# Release review — permanent booking Worker

The exact proposed release allowlist is `scripts/release-review-files.json`.
It retains the previously prepared EAS/mobile/runtime prerequisites and adds the
separate `booking-worker/` package, lockfile, Wrangler configuration, secret-free
local example, Web Crypto Auth/OAuth adapter, Firestore REST transaction adapter,
HTTP host and focused unit/workerd/emulator tests. The Node server now delegates
to the same SDK-independent scheduling engine and shared HTTP error class.
The prepared Render manifest/server environment example have been removed.

`scripts/BOOKING_WORKER_DEPLOYMENT.md` documents compatibility, exact commands,
dedicated credentials/IAM, Free-plan limits and remaining rollout gates.
`scripts/GOOGLE_PLAY_RELEASE.md` uses the permanent booking Worker origin for
EAS preview/production while retaining the existing photo origin. Production
guards reject backend secrets, local/demo/tunnel origins and emulator settings.

No staging, commit, push, deployment, remote setting, billing change or real
booking mutation was performed. Pre-existing notes/Rules/review/notification
changes remain outside this hosting change; do not accidentally stage them.
The Node local backend and photo Worker remain available and independent.

Run from the repository root:

```powershell
git status --short
git diff --stat
node .\scripts\check-release-review.mjs
npm.cmd run release:check:static
npm.cmd --prefix functions run build
Push-Location .\booking-worker
npm.cmd ci
npm.cmd run check
npm.cmd test
npm.cmd run build
Pop-Location
```

Run the demo-only Firestore integration and unchanged Node scheduling regressions
as described in the deployment guide before approving a commit. Readiness and
unauthenticated 401 checks alone do not establish acceptance.

The source audit scans tracked/nonignored files without printing matched secrets;
it verifies private-file ignore probes, explicit allowlist, dedicated Worker
runtime settings and the EAS boundary. Workerd tests inspect the actual esbuild
input graph for forbidden Admin SDK/gRPC/photo imports. Wrangler dry-run bundles
only imports reachable from booking-worker/src/index.ts. Secrets are env bindings,
not source assets. Git ignores local `.dev.vars`, `.env.local`, credentials and
service-account files; EAS excludes the entire Worker and server service code
while retaining pure shared domain modules. Do not add secrets with `git add -f`.
These checks are not a full Git-history secret scan or a remote archive audit.

Remaining gates: Cloudflare Free reliability/quota headroom, dedicated booking
identity/key and existing six permissions/indexes, actual permanent origin,
authenticated device/load verification, EAS owner/project/package/signing/Maps
configuration and Play privacy/deletion/Data safety requirements. See the two
runbooks for details. No placeholder is treated as a configured production value.
