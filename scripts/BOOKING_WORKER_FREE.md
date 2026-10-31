# Booking Worker: zero-budget Free assessment

Only Cloudflare Workers Free is authorized. No deployment, billing change or
paid-plan activation was performed. `wrangler.jsonc` has no custom CPU/usage-model
configuration. The release audit and focused test reject its reintroduction.
The photo Worker, photo URL, real Firebase accounts and booking domain logic
remain unchanged.

## Limits and decision

Official [Free limits](https://developers.cloudflare.com/workers/platform/limits/)
checked October 31, 2026: 10 ms CPU per HTTP request, 50 subrequests, 128 MB memory
and 100,000 requests/day shared across the account. Network waiting does not
consume CPU. Free execution can fail when limits are exceeded. Existing photo
and OTP traffic consume the same account request allowance. There is no
authorization to upgrade or enable paid usage.

**Reliable production fit is not established. Keep deployment on hold.** Local
whole-process CPU is not Cloudflare per-Worker billed CPU; inspector timeline
duration is not CPU accounting either. Neither a successful local request nor
a 200 readiness/401 probe proves that production requests stay within 10 ms.
This assessment does not authorize a deployment merely to obtain remote metrics.

## Repeatable measurement

```powershell
Set-Location C:\Users\WW\Desktop\servicepilot-mobile\booking-worker
npm.cmd run profile:free
npx.cmd wrangler check startup --outfile .worker-profile/startup.cpuprofile
npm.cmd run check
npm.cmd test
npm.cmd run build # deploy --dry-run only
```

The Windows harness creates a fresh **workerd process/isolate** for each cold
trial and identifies its new PID against the baseline. It reads that process's
accumulated user+kernel CPU counters through `Get-Process`, not the Node test
runner's CPU. It stops only the Miniflare instances it created. No unrelated
process is terminated or database cleared.

Default: three cold trials and three batches of ten warm requests per scenario.
For a quick smoke trial, set `BOOKING_PROFILE_TRIALS=1` and `BOOKING_PROFILE_WARM=2`
in the local shell. Remove those variables to restore the default measurement.
Profiles use real RSA verification/signing/import in workerd with synthetic keys.
Every Google request is intercepted by the Node fixture; no production Firebase,
Cloudflare deployment, account or billing API is called. Auth revocation lookup
still happens per request. Cold requests assert one JWK fetch and one OAuth
exchange; warm requests assert those caches are reused.

Cases: liveness control, accepting with no existing reservations, accepting
against 500 current plus 500 disjoint legacy reservations, four definitive
ABORTED commits followed by success (five full transaction attempts), rejecting
the 501-record safety boundary, and a 900 KB unrelated technician profile field.
The synthetic adapter checks transaction tokens, query bounds/projection and
three atomic writes. Existing emulator regression tests validate actual database
transaction/lock/idempotency behavior separately; the profiler is not a database
concurrency proof. Synthetic commits deliberately leave the pending fixture in
place so each warm iteration measures full acceptance rather than its cheap
already-accepted return path.

## Interpretation and artifacts

Raw native counters and summary are saved to ignored
`booking-worker/.worker-profile/free-report.json`. The reviewable snapshot is
`booking-worker/FREE_PLAN_MEASUREMENTS.json`. CPU counters include native crypto,
background compilation and local Miniflare routing/runtime overhead. They exclude
the Node fixture's work and network waiting. Windows counter granularity limits
individual cold-request precision. Warm numbers are averages over ten requests,
not per-request maxima or a production p95. Real provider payloads, TLS overhead,
network faults, machine contention and Cloudflare hardware differ. No exact
production CPU claim can be made from these measurements.

`BOOKING_PROFILE_MODE=cdp` optionally records V8 sampled diagnostic timelines.
Do not compare their active/program totals with the 10 ms CPU limit: waiting can
be attributed to program frames. The initial such pass was excluded from the
CPU decision for this reason. Raw profiles stay ignored and contain only
synthetic sessions. Module startup is measured separately by Wrangler; the Free
startup allowance is one second, not the per-request 10 ms cap. The initial local
startup sample reported 28.7 ms active sampled time (63.5 ms profile window).

See [Cloudflare CPU profiling guidance](https://developers.cloudflare.com/workers/observability/dev-tools/cpu-usage/)
and [local versus production startup profiling](https://developers.cloudflare.com/workers/wrangler/commands/workers/#check-startup).

All authentication, authoritative participant/eligibility checks, bounded overlap
queries, server-side Firestore transactions and lock revisions, full-transaction
conflict retries, deterministic notifications and ambiguous-outcome handling are
preserved. No in-memory booking locks, unsigned-token shortcuts, truncated
overlap sets or cached account eligibility were introduced.

## Checks for this budget change

Passed: six Worker regression tests, Worker TypeScript, focused lint, static EAS
release configuration, 18/18 private-file exclusion probes and the local Wrangler
dry-run bundle. The initial sandbox test/build attempts were blocked by filesystem
permissions; the same checks passed when rerun with the required local access.
The scheduling engine and production Auth/REST implementations were not changed.
No deployed Free-quota enforcement or live Firebase booking was tested.

## Measured snapshot

Generated: 2026-10-31T12:10:13.592Z. Local machine: AMD Ryzen 7 7435HS                             .

198 requests: three fresh-isolate cold requests and three batches of ten warm requests for each case. Values below are whole **local workerd-process CPU**, not Cloudflare billed per-Worker CPU. Cold values are individual-request counter deltas; warm values are per-request **batch averages**.

| Case | Cold median / max CPU ms | Warm batch-average median / max CPU ms | Max subrequests |
| --- | ---: | ---: | ---: |
| health | 0.000 / 15.625 | 1.563 / 10.938 | 0 |
| accept-empty | 46.875 / 62.500 | 15.625 / 20.313 | 9 |
| accept-1000 | 78.125 / 78.125 | 25.000 / 26.563 | 9 |
| retry-1000 | 171.875 / 234.375 | 112.500 / 120.313 | 37 |
| reject-501 | 78.125 / 109.375 | 21.875 / 23.438 | 9 |
| large-profile | 31.250 / 46.875 | 14.063 / 20.313 | 9 |

The native measurements provide no reliable 10 ms margin for all supported workloads. Keep the Free production gate unresolved; do not substitute a paid plan. Subrequests stayed within 50 in these cases, with all safety checks enabled. Normal successes do not establish worst-case CPU reliability.

The first larger execution was delayed by automatic approval review, and a repeated-reader run later hit the synthetic token expiry. Both incomplete executions are excluded. The final run used a persistent CPU reader and newly issued synthetic tokens per trial. Production authentication checks were never relaxed.
