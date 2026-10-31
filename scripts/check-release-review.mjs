// Read-only review audit. Findings print file names/categories, never matched values.
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import ignore from 'ignore';
const git = args => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] });
const split = text => text.split('\0').filter(Boolean);
const manifest = JSON.parse(readFileSync('scripts/release-review-files.json', 'utf8'));
const candidate = [...manifest.releaseFiles, ...manifest.bookingRuntimePrerequisites];
const tracked = split(git(['ls-files', '-z']));
const untracked = split(git(['ls-files', '--others', '--exclude-standard', '-z']));
const problems = [];
const sensitivePath = path => /(^|\/)(?:secrets|\.aws|\.ssh)(\/|$)|(^|\/)(?:credentials|application_default_credentials)\.json$|\.(?:pem|key|p8|p12|pfx|jks|keystore|log)$|(?:serviceAccount|service-account|service_account|firebase-adminsdk).*\.json$/i.test(path) ||
  /(^|\/)(?:\.env[^/]*|\.dev\.vars(?:\.[^/]*)?)$/.test(path) && !path.endsWith('.example');
const credentialPatterns = [
  ['private-key-material', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['github-token', /\b(?:ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{60,})\b/],
  ['aws-access-key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
];
const scanned = new Set([...tracked, ...untracked]);
for (const path of scanned) {
  if (!existsSync(path)) continue;
  if (sensitivePath(path)) problems.push(`${path}: private file is tracked or not ignored`);
  const bytes = readFileSync(path);
  if (bytes.includes(0)) continue;
  const text = bytes.toString('utf8');
  for (const [category, pattern] of credentialPatterns) if (pattern.test(text)) problems.push(`${path}: ${category}`);
  if (path.endsWith('.json')) {
    try { const value = JSON.parse(text); if (value?.type === 'service_account' && value.private_key) problems.push(`${path}: service-account JSON payload`); }
    catch { /* Non-JSON files are separately checked for private-key material. */ }
  }
}
const privateProbes = ['.env', '.env.local', '.env.production', 'functions/.env', 'functions/.env.production',
  'secrets/serviceAccountKey.json', 'functions/secrets/booking-service-account.json', 'functions/booking-service-account.json',
  'credentials.json', 'functions/credentials.json', 'functions/application_default_credentials.json',
  'functions/private.pem', 'functions/private.pfx', 'functions/release.keystore', 'firebase-debug.log',
  'booking-worker/.dev.vars', 'booking-worker/.dev.vars.production', 'booking-worker/secrets/booking-service-account.json'];
let ignored = [];
try { ignored = split(execFileSync('git', ['check-ignore', '--no-index', '-z', '--stdin'], { input: privateProbes.join('\0') + '\0', encoding: 'utf8' })); }
catch (error) { ignored = split(String(error.stdout ?? '')); }
for (const path of privateProbes) if (!ignored.includes(path)) problems.push(`${path}: exclusion probe failed`);
const easIgnored = ignore().add(readFileSync('.easignore', 'utf8'));
for (const path of privateProbes) if (!easIgnored.ignores(path)) problems.push(`${path}: EAS exclusion probe failed`);
for (const path of candidate) {
  if (!existsSync(path)) problems.push(`${path}: missing candidate file`);
  if (sensitivePath(path)) problems.push(`${path}: forbidden candidate path`);
}
if (candidate.length !== new Set(candidate).size) problems.push('Duplicate candidate paths.');
// The prepared JSONC contains strict JSON so no execution is needed to inspect it.
const worker = JSON.parse(readFileSync('booking-worker/wrangler.jsonc', 'utf8'));
if (worker.name !== 'servicepilot-booking' || worker.main !== 'src/index.ts' || worker.compatibility_date !== '2026-10-30' ||
  worker.workers_dev !== true || worker.preview_urls !== false || worker.limits !== undefined || worker.usage_model !== undefined ||
  worker.observability?.enabled !== false || worker.vars?.FIREBASE_PROJECT_ID !== 'servicepilot-756d9' ||
  Object.keys(worker.vars ?? {}).some(name => !['FIREBASE_PROJECT_ID', 'CORS_ALLOWED_ORIGINS'].includes(name))) problems.push('Booking Worker differs from the reviewed runtime/secret boundary.');
const workerPackage = JSON.parse(readFileSync('booking-worker/package.json', 'utf8'));
if (Object.keys(workerPackage.dependencies ?? {}).join() !== 'jose') problems.push('Unexpected Worker runtime dependency; review SDK/runtime compatibility.');
if (!easIgnored.ignores('booking-worker/src/index.ts')) problems.push('Booking Worker must be excluded from the mobile source archive.');
const workerSource = [...new Set([...tracked, ...candidate])].filter(path => path.startsWith('booking-worker/') || path.startsWith('functions/src/domain/'));
for (const path of workerSource) if (sensitivePath(path)) problems.push(`${path}: private path in reviewed Worker source`);
const staged = split(git(['diff', '--cached', '--name-only', '-z']));
const outside = staged.filter(path => !candidate.includes(path));
if (outside.length) problems.push(`Staged paths outside release allowlist: ${outside.length} (not altered by this audit).`);
console.log(`Reviewed source inventory: ${tracked.length} tracked + ${untracked.length} nonignored untracked files; ${scanned.size} paths scanned.`);
console.log(`Exact release allowlist: ${candidate.length} files; reviewed Worker/shared-domain source: ${workerSource.length} paths.`);
console.log(`Private-file Git ignore probes: ${privateProbes.length - privateProbes.filter(path => !ignored.includes(path)).length}/${privateProbes.length}.`);
console.log(`Staged files: ${staged.length}; nothing staged or changed by this checker.`);
for (const problem of problems) console.error(`REVIEW BLOCKER: ${problem}`);
if (!problems.length) console.log('No credential-pattern findings in reviewed nonignored sources. Worker settings and mobile archive boundary passed. Runtime tests separately inspect bundle inputs. This heuristic is not a secret-history audit or a live deployment inspection.');
process.exitCode = problems.length ? 1 : 0;
