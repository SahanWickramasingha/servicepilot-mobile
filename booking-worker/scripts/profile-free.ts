// Local synthetic workerd profiling only. No Firebase/Cloudflare credentials,
// production traffic, remote bindings, deployment or billing API calls.
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { cpus, platform } from 'node:os';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions, Log, LogLevel } from 'miniflare';
import { exportJWK, exportPKCS8, generateKeyPair, SignJWT } from 'jose';

type Profile = { nodes: { id: number; callFrame: { functionName: string } }[]; samples?: number[]; timeDeltas?: number[]; startTime: number; endTime: number };
type Scenario = 'health' | 'accept-empty' | 'accept-1000' | 'retry-1000' | 'reject-501' | 'large-profile';
const scenarios: Scenario[] = ['health', 'accept-empty', 'accept-1000', 'retry-1000', 'reject-501', 'large-profile'];
const trials = Number(process.env.BOOKING_PROFILE_TRIALS ?? 3), warmRequests = Number(process.env.BOOKING_PROFILE_WARM ?? 10);
assert.ok(Number.isInteger(trials) && trials >= 1 && trials <= 20 && Number.isInteger(warmRequests) && warmRequests >= 1 && warmRequests <= 50);
const config = JSON.parse(await readFile('wrangler.jsonc', 'utf8'));
assert.equal(config.limits, undefined, 'Do not profile an accidentally paid-only config');
const bundle = process.env.BOOKING_PROFILE_PREBUILT === '1' ? { outputFiles: [{ text: await readFile('.worker-build/index.js', 'utf8') }] } :
  await build({ entryPoints: ['./src/index.ts'], bundle: true, format: 'esm', platform: 'browser', target: 'es2022', write: false });
const pair = await generateKeyPair('RS256', { extractable: true });
const jwk = { ...await exportJWK(pair.publicKey), kid: 'local-profile-key', alg: 'RS256', use: 'sig' };
const privateKey = await exportPKCS8(pair.privateKey);
const mintToken = () => new SignJWT({ auth_time: Math.floor(Date.now() / 1000) - 60, email_verified: true })
  .setProtectedHeader({ alg: 'RS256', kid: jwk.kid }).setIssuer('https://securetoken.google.com/servicepilot-756d9')
  .setAudience('servicepilot-756d9').setSubject('synthetic-tech').setIssuedAt().setExpirationTime('1h').sign(pair.privateKey);
const root = 'projects/servicepilot-756d9/databases/(default)/documents/';
const str = (stringValue: string) => ({ stringValue });
const fields: Record<string, unknown> = {
  'service_requests/fixture': { customerId: str('synthetic-customer'), technicianId: str('synthetic-tech'), status: str('requested'), preferredDate: str('2099-10-10'), preferredTime: str('10:00 AM'), durationMinutes: { integerValue: '60' } },
  'users/synthetic-tech': { role: str('technician'), emailVerified: { booleanValue: true }, technicianApprovalStatus: str('approved'), availability: str('available') },
  'users/synthetic-customer': { role: str('customer'), emailVerified: { booleanValue: true } },
  'technician_map_profiles/synthetic-tech': { approved: { booleanValue: true }, availability: str('available') },
};
const history = Array.from({ length: 501 }, (_, i) => ({ document: { name: root + 'service_requests/history-' + i, fields: {
  technicianId: str('synthetic-tech'), assignedTechnicianId: str('synthetic-tech'),
  scheduledAt: { timestampValue: new Date(Date.UTC(2099, 0, 1, 0, i * 2)).toISOString() },
  scheduledEndAt: { timestampValue: new Date(Date.UTC(2099, 0, 1, 0, i * 2 + 1)).toISOString() },
} } }));

async function inspector(runtime: Miniflare) {
  const endpoint = await runtime.getInspectorURL();
  endpoint.protocol = endpoint.protocol === 'wss:' ? 'https:' : 'http:';
  const targets = await (await fetch(new URL('/json/list', endpoint), { signal: AbortSignal.timeout(5000) })).json() as { webSocketDebuggerUrl: string; title: string }[];
  const address = (targets.find(item => item.title.includes('user')) ?? targets[0])?.webSocketDebuggerUrl;
  assert.ok(address, 'Local workerd inspector target required');
  const socket = new WebSocket(address);
  await new Promise<void>((resolve, reject) => { socket.addEventListener('open', () => resolve(), { once: true }); socket.addEventListener('error', () => reject(new Error('Local inspector WebSocket connection failed')), { once: true }); });
  let sequence = 0;
  const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>();
  socket.addEventListener('message', event => {
    const message = JSON.parse(String(event.data));
    if (!message.id) return;
    const waiter = pending.get(message.id); if (!waiter) return; pending.delete(message.id);
    if (message.error) waiter.reject(new Error('CDP ' + message.error.message)); else waiter.resolve(message.result);
  });
  const send = (method: string, params = {}) => new Promise<any>((resolve, reject) => {
    const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout: ' + method)); }, 10_000);
    pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
    socket.send(JSON.stringify({ id, method, params }));
  });
  await send('Profiler.enable'); await send('Profiler.setSamplingInterval', { interval: 100 });
  return { send, close: () => socket.close() };
}
function summarize(profile: Profile) {
  const names = new Map(profile.nodes.map(node => [node.id, node.callFrame.functionName]));
  let activeUs = 0, idleUs = 0;
  for (const [i, sample] of (profile.samples ?? []).entries()) {
    const delta = profile.timeDeltas?.[i] ?? 0;
    if (names.get(sample) === '(idle)' || names.get(sample) === '(root)') idleUs += delta; else activeUs += delta;
  }
  return { sampledActiveMs: activeUs / 1000, sampledIdleMs: idleUs / 1000, samples: profile.samples?.length ?? 0 };
}
// One persistent reader avoids repeated PowerShell startup, reads only public
// process counters and never prints/inspects process command lines or secrets.
const meter = process.env.BOOKING_PROFILE_MODE === 'cdp' ? undefined : spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
  'while ($null -ne [Console]::ReadLine()) { $rows = @([System.Diagnostics.Process]::GetProcessesByName("workerd") | ForEach-Object { @{ Id = $_.Id; Milliseconds = $_.TotalProcessorTime.TotalMilliseconds } }); [Console]::WriteLine((ConvertTo-Json -InputObject $rows -Compress)) }'],
  { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
const pendingReadings: { resolve: (value: Map<number, number>) => void; reject: (error: Error) => void }[] = [];
if (meter) {
  assert.equal(platform(), 'win32', 'Native process meter requires Windows; never substitute Node orchestrator CPU');
  createInterface({ input: meter.stdout! }).on('line', line => {
    const waiter = pendingReadings.shift(); if (!waiter) return;
    try { const parsed = JSON.parse(line); waiter.resolve(new Map((Array.isArray(parsed) ? parsed : [parsed]).map(row => [row.Id, Number(row.Milliseconds)]))); }
    catch { waiter.reject(new Error('Invalid local process CPU reading')); }
  });
  meter.on('error', () => { for (const waiter of pendingReadings.splice(0)) waiter.reject(new Error('Cannot start CPU meter')); });
  meter.on('exit', () => { for (const waiter of pendingReadings.splice(0)) waiter.reject(new Error('CPU meter exited')); });
}
async function processTimes(): Promise<Map<number, number>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Local CPU counter read timed out')), 15_000);
    pendingReadings.push({ resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
    meter!.stdin!.write('sample\n');
  });
}
await mkdir('.worker-profile', { recursive: true });
const rows: { scenario: Scenario; temperature: string; sampledActiveMs: number; sampledIdleMs: number; samples: number; wallMs: number; subrequests: number }[] = [];
const nativeRows: { scenario: Scenario; temperature: string; requests: number; processCpuMs: number; meanProcessCpuMs: number; wallMs: number; maxSubrequests: number }[] = [];
const useInspector = process.env.BOOKING_PROFILE_MODE === 'cdp';
for (const scenario of scenarios) {
  for (let trial = 0; trial < trials; trial++) {
    const token = await mintToken();
    const beforeProcesses = useInspector ? new Map<number, number>() : await processTimes();
    let calls = 0, commits = 0, jwks = 0, oauth = 0;
    const runtime = new Miniflare(convertV4MiniflareOptions({ modules: true, script: bundle.outputFiles[0].text, compatibilityDate: config.compatibility_date,
      ...(useInspector ? { inspectorPort: 0 } : {}), log: new Log(LogLevel.NONE), bindings: { FIREBASE_PROJECT_ID: 'servicepilot-756d9', BOOKING_SERVICE_ACCOUNT_EMAIL: 'servicepilot-booking-worker@servicepilot-756d9.iam.gserviceaccount.com', BOOKING_SERVICE_ACCOUNT_PRIVATE_KEY: privateKey },
      outboundService: async (request: Request) => {
        calls++;
        const url = new URL(request.url);
        if (url.hostname === 'www.googleapis.com') { jwks++; return Response.json({ keys: [jwk] }); }
        if (url.hostname === 'oauth2.googleapis.com') { oauth++; return Response.json({ access_token: 'synthetic', expires_in: 3600 }); }
        if (url.hostname === 'identitytoolkit.googleapis.com') return Response.json({ users: [{ localId: 'synthetic-tech', validSince: '0' }] });
        assert.equal(url.hostname, 'firestore.googleapis.com', 'Unexpected outbound connection forbidden');
        const body = await request.json() as any;
        if (url.pathname.endsWith(':beginTransaction')) return Response.json({ transaction: 'synthetic-transaction' });
        assert.equal(body.transaction, 'synthetic-transaction');
        if (url.pathname.endsWith(':batchGet')) return Response.json(body.documents.map((name: string) => {
          const path = name.slice(root.length), data = fields[path];
          return data ? { found: { name, fields: { ...data as object, ...(scenario === 'large-profile' && path === 'users/synthetic-tech' ? { unrelatedPrivateField: str('x'.repeat(900_000)) } : {}) } } } : { missing: name };
        }));
        if (url.pathname.endsWith(':runQuery')) {
          assert.equal(body.structuredQuery.limit, 501); assert.equal(body.structuredQuery.select.fields.length, 4);
          // Current and legacy query sets may each contain 500 distinct rows.
          const legacy = body.structuredQuery.where.compositeFilter.filters[0].fieldFilter.field.fieldPath === 'assignedTechnicianId';
          const count = scenario === 'reject-501' ? 501 : scenario.includes('1000') ? 500 : 0;
          return Response.json(history.slice(0, count).map(row => {
            const { scheduledAt, scheduledEndAt } = row.document.fields;
            return { document: { name: row.document.name + (legacy ? '-legacy' : ''), fields: {
              [legacy ? 'assignedTechnicianId' : 'technicianId']: str('synthetic-tech'), scheduledAt, scheduledEndAt,
            } } };
          }));
        }
        if (url.pathname.endsWith(':commit')) {
          commits++;
          if (scenario === 'retry-1000' && commits % 5 !== 0) return Response.json({ error: { status: 'ABORTED' } }, { status: 409 });
          assert.equal(body.writes.length, 3); return Response.json({});
        }
        if (url.pathname.endsWith(':rollback')) return Response.json({});
        throw Error('Unexpected synthetic request');
      } }));
    let cdp: Awaited<ReturnType<typeof inspector>> | undefined;
    try {
      if (useInspector) cdp = await inspector(runtime);
      else await runtime.ready;
      const startedProcesses = useInspector ? new Map<number, number>() : await processTimes();
      const ownPids = [...startedProcesses.keys()].filter(id => !beforeProcesses.has(id));
      if (!useInspector) assert.equal(ownPids.length, 1, 'Expected exactly one new workerd process, never measure unrelated processes');
      const ownCpu = async () => { const value = (await processTimes()).get(ownPids[0]); assert.ok(value !== undefined && Number.isFinite(value)); return value; };
      let beforeCpu = useInspector ? 0 : await ownCpu(), groupWall = 0, groupSubrequests = 0;
      for (let requestIndex = 0; requestIndex <= warmRequests; requestIndex++) {
        const startCalls = calls;
        if (cdp) await cdp.send('Profiler.start'); const started = performance.now();
        const response = await runtime.dispatchFetch(`https://local.test/${scenario === 'health' ? 'healthz' : 'v1/bookings/schedule'}`, scenario === 'health' ? undefined : {
          method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'accept', requestId: 'fixture' }) });
        await response.text(); const wallMs = performance.now() - started;
        const profile = cdp ? (await cdp.send('Profiler.stop')).profile as Profile : undefined;
        assert.equal(response.status, scenario === 'reject-501' ? 409 : 200);
        const temperature = requestIndex === 0 ? 'cold-first-request' : 'warm';
        if (scenario !== 'health') { assert.equal(jwks, 1); assert.equal(oauth, 1); }
        if (profile) {
          rows.push({ scenario, temperature, ...summarize(profile), wallMs, subrequests: calls - startCalls });
          await writeFile(`.worker-profile/${scenario}-${trial}-${requestIndex}.cpuprofile`, JSON.stringify(profile));
        } else {
          groupWall += wallMs; groupSubrequests = Math.max(groupSubrequests, calls - startCalls);
          if (requestIndex === 0 || requestIndex === warmRequests) {
            const afterCpu = await ownCpu(), processCpuMs = afterCpu - beforeCpu, requests = requestIndex === 0 ? 1 : warmRequests;
            nativeRows.push({ scenario, temperature, requests, processCpuMs, meanProcessCpuMs: processCpuMs / requests, wallMs: groupWall, maxSubrequests: groupSubrequests });
            beforeCpu = afterCpu; groupWall = 0; groupSubrequests = 0;
            await writeFile('.worker-profile/native-progress.json', JSON.stringify(nativeRows, null, 2));
          }
        }
      }
    } finally { cdp?.close(); await runtime.dispose(); }
  }
}
const stats = scenarios.flatMap(scenario => ['cold-first-request', 'warm'].map(temperature => {
  if (!useInspector) {
    const groups = nativeRows.filter(row => row.scenario === scenario && row.temperature === temperature);
    const ordered = groups.map(row => row.meanProcessCpuMs).sort((a, b) => a - b);
    return { scenario, temperature, batches: groups.length, requests: groups.reduce((sum, row) => sum + row.requests, 0),
      medianMeanProcessCpuMs: ordered[Math.floor(ordered.length / 2)], maxMeanProcessCpuMs: ordered.at(-1),
      maxSubrequests: Math.max(...groups.map(row => row.maxSubrequests)) };
  }
  const selected = rows.filter(row => row.scenario === scenario && row.temperature === temperature);
  const sorted = selected.map(row => row.sampledActiveMs).sort((a, b) => a - b);
  return { scenario, temperature, requests: selected.length, activeMedianMs: sorted[Math.floor(sorted.length / 2)], activeP95Ms: sorted[Math.ceil(sorted.length * .95) - 1],
    activeMaxMs: sorted.at(-1), samplesOver10ms: sorted.filter(value => value > 10).length, maxSubrequests: Math.max(...selected.map(row => row.subrequests)),
    maxWallMs: Math.max(...selected.map(row => row.wallMs)) };
}));
const report = { generatedAt: new Date().toISOString(), runtime: 'local workerd via Miniflare', platform: platform(), cpuModel: cpus()[0]?.model,
  method: useInspector ? 'CDP sampled timeline for diagnosis only: not CPU accounting; async waiting can be attributed to program frames. Do not compare with the 10ms CPU cap.' :
    'Windows workerd-process accumulated user+kernel CPU counters; new PID identified for each trial. Includes native/off-thread crypto and local Miniflare routing/runtime overhead, excludes Node fixture CPU and network waiting. Timer granularity and process-wide scope prevent exact per-Worker billing comparison. Warm values are batch averages, not individual-request maxima. Synthetic Google responses omit real TLS/provider data. Cold is first request in fresh isolate after runtime.ready, including empty JWK/OAuth caches; startup separate. No inspector attached.',
  bundleSha256: createHash('sha256').update(bundle.outputFiles[0].text).digest('hex'),
  buildMethod: process.env.BOOKING_PROFILE_PREBUILT === '1' ? 'last local Wrangler dry-run bundle' : 'source bundled directly with esbuild',
  certifiedForFree: false, rows: useInspector ? rows : nativeRows, stats };
await writeFile(`.worker-profile/${useInspector ? 'cdp-timeline' : 'free-report'}.json`, JSON.stringify(report, null, 2));
console.table(stats);
console.log('Saved local report in .worker-profile. These measurements cannot certify Free-plan production reliability.');
meter?.stdin!.end();
