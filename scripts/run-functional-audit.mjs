// Local audit runner. Never deploys, builds an APK or accepts production data.
// Raw artifacts are kept in ignored review-config; console output is summarized.
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
const root = resolve(import.meta.dirname, '..');
const artifacts = resolve(root, '.firebase/review-config/full-audit');
mkdirSync(artifacts, { recursive: true });
const environment = { ...process.env, DEBUG: '', CI: '1', WRANGLER_SEND_METRICS: 'false',
  XDG_CONFIG_HOME: resolve(artifacts, 'cli-config') };
for (const key of Object.keys(environment)) {
  if (/^(AWS_|CLOUDFLARE_API_|FIREBASE_TOKEN|GOOGLE_APPLICATION_CREDENTIALS$|GOOGLE_CLOUD_PROJECT$|GCLOUD_PROJECT$|FIREBASE_CONFIG$)/.test(key) ||
      /TOKEN|PASSWORD|SECRET|PRIVATE_KEY/i.test(key)) delete environment[key];
}
const redact = text => text.replace(/^.*with environment \{.*$/gm, '[child environment omitted]')
  .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g, '[private key omitted]')
  .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[JWT omitted]')
  .replace(/([?&]oobCode=)[^&\s"}]+/g, '$1[omitted]');
const tapCount = (text, name) => [...text.matchAll(new RegExp(`^# ${name} (\\d+)$`, 'gm'))].reduce((total, match) => total + Number(match[1]), 0);
export async function run(name, command, cwd = root, extraEnv = {}, timeout = 240000) {
  if (/\bdeploy\b/.test(command) && !command.includes('--dry-run')) throw Error('Audit refuses deployment.');
  const started = Date.now();
  const child = spawn(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', command], {
    cwd, env: { ...environment, ...extraEnv }, windowsHide: true, windowsVerbatimArguments: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', data => { output += data; }); child.stderr.on('data', data => { output += data; });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    // Only this runner's captured child tree, never an enumerated user process.
    if (process.platform === 'win32' && child.pid) spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    else child.kill();
  }, timeout);
  const exitCode = await new Promise(done => { child.on('error', error => { output += '\n' + error.message; done(-1); }); child.on('exit', code => done(code)); });
  clearTimeout(timer);
  output = redact(output);
  writeFileSync(resolve(artifacts, name + '.log'), output);
  const failures = output.split(/\r?\n/).filter(line => /^not ok |^FAIL|error TS\d|error:|Error:|^BLOCKED:|✖|×/.test(line.trim())).slice(0, 35);
  const summary = { name, command, cwd: cwd === root ? '.' : cwd.slice(root.length + 1), exitCode, timedOut,
    seconds: Number(((Date.now() - started) / 1000).toFixed(1)),
    tests: tapCount(output, 'tests'), pass: tapCount(output, 'pass'), fail: tapCount(output, 'fail'), skip: tapCount(output, 'skipped'), failures };
  writeFileSync(resolve(artifacts, name + '.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary));
  if (exitCode !== 0 || timedOut) process.exitCode = 1;
  return summary;
}
async function pool(jobs, concurrency = 3) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(jobs.length, concurrency) }, async () => {
    while (next < jobs.length) { const job = jobs[next++]; await run(...job); }
  }));
}
const mode = process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.dirname, 'run-functional-audit.mjs') ? process.argv[2] : undefined;
const namedEmulatorFiles = new Set(['account-lifecycle.test.mjs', 'availability-booking.test.mjs', 'dispatcher-provisioning.test.mjs',
  'map-admin.test.mjs', 'map-backfill.test.mjs', 'map-location.test.mjs', 'review-storage.test.mjs', 'reviewer-names.test.mjs']);
if (mode === 'checks') {
  await pool([
    ['mobile-types', 'npx.cmd tsc --noEmit'], ['mobile-lint', 'npm.cmd run lint'],
    ['functions-build', 'npm.cmd run build', resolve(root, 'functions')], ['functions-lint', 'npm.cmd run lint', resolve(root, 'functions')],
    ['admin-web-build', 'npm.cmd run build', resolve(root, 'admin-web')], ['admin-web-lint', 'npm.cmd run lint', resolve(root, 'admin-web')],
    ['pages-release-guard', 'node scripts/check-pages-env.mjs', resolve(root, 'admin-web')],
    ['release-static', 'node scripts/check-release.mjs --static'], ['release-current-env', 'node scripts/check-release.mjs'],
    ...['booking-worker', 'photo-worker', 'admin-worker'].flatMap(pkg => [
      [pkg + '-types', 'npm.cmd run check', resolve(root, pkg)],
      [pkg + '-dry-run', 'npm.cmd run build', resolve(root, pkg)],
    ]),
  ]);
} else if (mode === 'units') {
  const files = readdirSync(resolve(root, 'scripts/tests')).filter(file => file.endsWith('.test.mjs') && !file.includes('-emulator.') && file !== 'booking-runtime.test.mjs' && !namedEmulatorFiles.has(file)).sort();
  await run('mobile-domain-ui-units-classified', 'node --test --test-concurrency=2 ' + files.map(file => 'scripts/tests/' + file).join(' '));
} else if (mode === 'workers') {
  await pool(['booking-worker', 'photo-worker', 'admin-worker'].map(pkg => [pkg + '-tests', 'npm.cmd test', resolve(root, pkg)]));
  await run('legacy-otp-tests', 'npm.cmd test -- --run', resolve(root, 'servicepilot-otp'));
} else if (mode === 'worker-verify') {
  await pool(['booking-worker', 'photo-worker', 'admin-worker'].flatMap(pkg => [
    [pkg + '-tests-verified', 'npm.cmd test', resolve(root, pkg)],
    [pkg + '-dry-run-verified', 'npm.cmd run build', resolve(root, pkg)],
  ]), 2);
  await run('legacy-otp-tests-verified', 'npm.cmd test -- --run', resolve(root, 'servicepilot-otp'));
} else if (mode === 'audit-files') {
  await run('audit-added-tools-lint', 'npx.cmd eslint scripts/run-functional-audit.mjs scripts/summarize-functional-audit.mjs scripts/lib/audit-accepted-fixtures.mjs scripts/tests/functional-audit.test.mjs scripts/tests/functional-audit-core-emulator.test.mjs scripts/tests/functional-audit-evidence-emulator.test.mjs');
} else if (mode === 'audit-probes') {
  await run('audit-session-and-fixture-probes', 'node --test scripts/tests/functional-audit.test.mjs');
} else if (mode === 'evidence-probes') {
  await run('audit-current-policy-evidence', 'node --test scripts/tests/functional-audit-evidence-emulator.test.mjs', root,
    { FIRESTORE_EMULATOR_HOST: '127.0.0.1:8187', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9197', GCLOUD_PROJECT: 'demo-servicepilot-review-author' });
} else if (mode === 'core-probes') {
  await run('audit-fresh-core-flows', 'node --test scripts/tests/functional-audit-core-emulator.test.mjs', root,
    { FIRESTORE_EMULATOR_HOST: '127.0.0.1:8187', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9197', GCLOUD_PROJECT: 'demo-servicepilot-review-author' });
} else if (mode === 'hosted-auth') {
  await run('password-reset-hosted-confirmed', 'firebase.cmd emulators:exec --only hosting --project demo-servicepilot-review-author --config firebase.password-reset-test.json "node --test scripts/tests/password-reset-emulator.test.mjs"', root,
    { FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9197', GCLOUD_PROJECT: 'demo-servicepilot-review-author' });
} else if (mode === 'bundle') {
  await run('release-local-env-profile', 'node scripts/check-release.mjs --env-file .env.local', root, { EXPO_PUBLIC_USE_FIREBASE_EMULATORS: '0' });
  await run('android-local-bundle', 'npx.cmd expo export --platform android --output-dir .firebase/review-config/full-audit/android-export', root,
    { EXPO_PUBLIC_USE_FIREBASE_EMULATORS: '0', SERVICEPILOT_RELEASE: '1' });
} else if (mode === 'bundle-configured' || mode === 'bundle-configured-verified') {
  const local = parseEnv(readFileSync(resolve(root, '.env.local'), 'utf8'));
  const publicEnvironment = { EXPO_PUBLIC_USE_FIREBASE_EMULATORS: '0', SERVICEPILOT_RELEASE: '1' };
  for (const name of ['EXPO_PUBLIC_BOOKING_API_URL', 'EXPO_PUBLIC_PHOTO_API_URL', 'GOOGLE_MAPS_ANDROID_API_KEY']) {
    if (local[name]) publicEnvironment[name] = local[name];
  }
  await run(mode === 'bundle-configured-verified' ? 'android-local-bundle-verified' : 'android-local-bundle-configured', 'npx.cmd expo export --platform android --output-dir .firebase/review-config/full-audit/android-export', root, publicEnvironment);
} else if (mode === 'project-auth') {
  const group = process.argv[3], settings = {
    categories: ['demo-servicepilot-categories', 31497], registration: ['demo-servicepilot-registration', 32497],
    dispatcher: ['demo-servicepilot-dispatcher', 33497], admin: ['demo-servicepilot-admin-worker', 34497], author: ['demo-servicepilot-review-author', 36497],
  }[group];
  if (!settings) throw Error('Unknown isolated Auth project.');
  const [project, port] = settings, config = resolve(artifacts, group + '-auth.json');
  writeFileSync(config, JSON.stringify({ emulators: { auth: { host: '127.0.0.1', port },
    hub: { host: '127.0.0.1', port: port - 57 }, logging: { host: '127.0.0.1', port: port - 52 }, ui: { enabled: false }, singleProjectMode: true } }));
  await run(group + '-isolated-auth-harness', `firebase.cmd emulators:exec --only auth --project ${project} --config "${config}" "node scripts/run-functional-audit.mjs emulator-tests ${group}"`, root,
    { FIRESTORE_EMULATOR_HOST: '127.0.0.1:8187', FIREBASE_STORAGE_EMULATOR_HOST: '127.0.0.1:9297' });
} else if (mode === 'emulator-all') {
  const fsHost = process.env.FIRESTORE_EMULATOR_HOST, authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  if (![fsHost, authHost].every(host => /^(127\.0\.0\.1|localhost):\d+$/.test(host ?? ''))) throw Error('Loopback emulators required.');
  const baseEnv = { FIRESTORE_EMULATOR_HOST: fsHost, FIREBASE_AUTH_EMULATOR_HOST: authHost,
    FIREBASE_STORAGE_EMULATOR_HOST: process.env.FIREBASE_STORAGE_EMULATOR_HOST,
    FIREBASE_EMULATOR_HUB: process.env.FIREBASE_EMULATOR_HUB };
  const projectEnv = project => ({ ...baseEnv, GCLOUD_PROJECT: project, GOOGLE_CLOUD_PROJECT: project });
  // Load the exact local Rules into each isolated demo project, rather than
  // assuming a multi-project emulator uses the intended default Rules.
  for (const project of ['demo-servicepilot-registration', 'demo-servicepilot-categories', 'demo-servicepilot-review-author', 'demo-servicepilot-dispatcher', 'demo-servicepilot-admin-worker']) {
    const response = await fetch(`http://${fsHost}/emulator/v1/projects/${project}:securityRules`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content: readFileSync(resolve(root, 'firestore.rules'), 'utf8') }] } }),
    });
    if (!response.ok) throw Error(`Cannot load local Rules for ${project}: HTTP ${response.status}`);
  }
  await run('registration-current-rules', 'node --test scripts/tests/registration-emulator.test.mjs', root, projectEnv('demo-servicepilot-registration'));
  await run('rules-categories-profiles-legal', 'node --test --test-concurrency=1 scripts/tests/service-categories-emulator.test.mjs scripts/tests/profile-save-emulator.test.mjs scripts/tests/legal-emulator.test.mjs', root, projectEnv('demo-servicepilot-categories'));
  await run('rules-workflow-photos-notifications', 'node --test --test-concurrency=1 scripts/tests/scheduling-emulator.test.mjs scripts/tests/job-evidence-emulator.test.mjs scripts/tests/request-attachments-emulator.test.mjs scripts/tests/r2-photo-security-emulator.test.mjs scripts/tests/notification-history-emulator.test.mjs scripts/tests/password-reset-emulator.test.mjs', root, projectEnv('demo-servicepilot-review-author'));
  await run('rules-map-reviews-availability', 'node --test --test-concurrency=1 scripts/tests/availability-booking.test.mjs scripts/tests/map-admin.test.mjs scripts/tests/map-backfill.test.mjs scripts/tests/map-location.test.mjs scripts/tests/review-storage.test.mjs scripts/tests/reviewer-names.test.mjs', root, projectEnv('demo-servicepilot-review-author'));
  await run('rules-dispatcher-lifecycle', 'node --test --test-concurrency=1 scripts/tests/account-lifecycle.test.mjs scripts/tests/dispatcher-provisioning.test.mjs', root, projectEnv('demo-servicepilot-dispatcher'));
  await run('booking-worker-wire', 'npm.cmd run test:emulator', resolve(root, 'booking-worker'), projectEnv('demo-servicepilot-review-author'));
  await run('admin-worker-wire', 'npm.cmd run test:emulator', resolve(root, 'admin-worker'), projectEnv('demo-servicepilot-admin-worker'));
  const backendEnv = { ...environment, ...projectEnv('demo-servicepilot-review-author'), DISPATCHER_MODE: 'emulator', DISPATCHER_SERVICES: 'booking', PORT: '8789' };
  const backend = spawn(process.execPath, ['functions/lib/dispatcher-main.js'], { cwd: root, env: backendEnv, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let backendLog = ''; backend.stdout.on('data', data => { backendLog += data; }); backend.stderr.on('data', data => { backendLog += data; });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 40; attempt++) {
      try { await fetch('http://127.0.0.1:8789/health', { signal: AbortSignal.timeout(1000) }); ready = true; break; } catch {}
      await new Promise(done => setTimeout(done, 250));
    }
    if (!ready) throw Error('Local standalone booking backend did not start.');
    await run('booking-standalone-http', 'node --test scripts/tests/booking-runtime.test.mjs', root, { ...projectEnv('demo-servicepilot-review-author'), DISPATCHER_MODE: 'emulator' });
  } finally { backend.kill(); writeFileSync(resolve(artifacts, 'booking-backend.log'), redact(backendLog)); }
} else if (mode === 'emulator-tests') {
  const group = process.argv[3], sharedEnv = {
    FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST,
    FIREBASE_AUTH_EMULATOR_HOST: process.env.FIREBASE_AUTH_EMULATOR_HOST,
    FIREBASE_STORAGE_EMULATOR_HOST: process.env.FIREBASE_STORAGE_EMULATOR_HOST,
    GCLOUD_PROJECT: process.env.GCLOUD_PROJECT,
    FIREBASE_EMULATOR_HUB: process.env.FIREBASE_EMULATOR_HUB,
  };
  for (const key of ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST']) {
    if (!/^(127\.0\.0\.1|localhost):\d+$/.test(sharedEnv[key] ?? '')) throw Error('Loopback emulators required.');
  }
  if (!sharedEnv.GCLOUD_PROJECT?.startsWith('demo-')) throw Error('Demo project required.');
  if (group === 'categories') await run('rules-categories-profiles-legal', 'node --test --test-concurrency=1 scripts/tests/service-categories-emulator.test.mjs scripts/tests/profile-save-emulator.test.mjs scripts/tests/legal-emulator.test.mjs', root, sharedEnv);
  else if (group === 'workflow') {
    await run('rules-workflow-photos-notifications', 'node --test --test-concurrency=1 scripts/tests/scheduling-emulator.test.mjs scripts/tests/job-evidence-emulator.test.mjs scripts/tests/request-attachments-emulator.test.mjs scripts/tests/r2-photo-security-emulator.test.mjs scripts/tests/notification-history-emulator.test.mjs scripts/tests/password-reset-emulator.test.mjs', root, sharedEnv);
    await run('booking-worker-wire', 'npm.cmd run test:emulator', resolve(root, 'booking-worker'), sharedEnv);
  } else if (group === 'registration') await run('registration-current-rules', 'node --test scripts/tests/registration-emulator.test.mjs', root, sharedEnv);
  else if (group === 'admin') await run('admin-worker-wire', 'npm.cmd run test:emulator', resolve(root, 'admin-worker'), sharedEnv);
  else if (group === 'dispatcher') await run('rules-dispatcher-lifecycle-isolated', 'node --test --test-concurrency=1 scripts/tests/account-lifecycle.test.mjs scripts/tests/dispatcher-provisioning.test.mjs', root, sharedEnv);
  else if (group === 'accepted-controls') {
    await run('audit-evidence-accepted-controls', 'node --import ./scripts/lib/audit-accepted-fixtures.mjs --test --test-concurrency=1 scripts/tests/job-evidence-emulator.test.mjs scripts/tests/r2-photo-security-emulator.test.mjs', root, sharedEnv);
    await run('audit-map-reviews-accepted-controls', 'node --import ./scripts/lib/audit-accepted-fixtures.mjs --test --test-concurrency=1 scripts/tests/map-location.test.mjs scripts/tests/review-storage.test.mjs scripts/tests/reviewer-names.test.mjs scripts/tests/availability-booking.test.mjs', root, sharedEnv, 90000);
    await run('password-reset-hosted-controls', 'node --test scripts/tests/password-reset-emulator.test.mjs', root, sharedEnv);
  } else if (group === 'author') {
    await run('audit-current-policy-evidence', 'node --test scripts/tests/functional-audit-evidence-emulator.test.mjs', root, sharedEnv);
    await run('audit-map-accepted-current', 'node --import ./scripts/lib/audit-accepted-fixtures.mjs --test scripts/tests/map-location.test.mjs', root, sharedEnv, 60000);
    await run('audit-availability-accepted-current', 'node --import ./scripts/lib/audit-accepted-fixtures.mjs --test scripts/tests/availability-booking.test.mjs', root, sharedEnv, 60000);
    await run('audit-reviewer-names-accepted-current', 'node --import ./scripts/lib/audit-accepted-fixtures.mjs --test scripts/tests/reviewer-names.test.mjs', root, sharedEnv, 60000);
  }
  else throw Error('Unknown emulator group.');
} else if (mode !== undefined) throw Error('Use checks, units, workers or emulator-tests GROUP.');
