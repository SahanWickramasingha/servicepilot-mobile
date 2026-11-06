// Focused, local-only reruns; reuses sanitized command/result recording.
import { run } from './run-functional-audit.mjs';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..'), directory = resolve(root, '.firebase/review-config/audit-fixes');
mkdirSync(directory, { recursive: true });
const project = 'demo-servicepilot-review-author';
const local = { GCLOUD_PROJECT: project, GOOGLE_CLOUD_PROJECT: project, FIRESTORE_EMULATOR_HOST: '127.0.0.1:8187',
  FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9197', FIREBASE_EMULATOR_HUB: '127.0.0.1:30440' };
const phase = process.argv[2];
if (phase === 'rules') {
  await run('fix-rules-core-evidence', 'node --test --test-concurrency=1 scripts/tests/functional-audit-core-emulator.test.mjs scripts/tests/functional-audit-evidence-emulator.test.mjs', root, local);
} else if (phase === 'units') {
  await run('fix-focused-units', 'node --test scripts/tests/functional-audit.test.mjs scripts/tests/account-session.test.mjs scripts/tests/registration.test.mjs scripts/tests/legal-policy.test.mjs scripts/tests/service-categories.test.mjs scripts/tests/job-evidence.test.mjs scripts/tests/work-timer.test.mjs scripts/tests/service-areas-distance.test.mjs', root);
} else if (phase === 'map') {
  // This runner owns these loopback demo emulators. Isolate bounded-query fixtures
  // from the preceding core suite; never use a project or host from app config.
  for (const url of [
    'http://127.0.0.1:8187/emulator/v1/projects/demo-servicepilot-review-author/databases/(default)/documents',
    'http://127.0.0.1:9197/emulator/v1/projects/demo-servicepilot-review-author/accounts',
  ]) {
    const response = await fetch(url, { method: 'DELETE' });
    if (!response.ok) throw Error('Could not reset owned local demo fixtures: ' + response.status);
  }
  await run('fix-map-integration', 'node --import ./scripts/lib/audit-accepted-fixtures.mjs --test scripts/tests/map-location.test.mjs', root, local, 90000);
} else if (phase === 'checks') {
  await Promise.all([
    run('fix-types', 'npx.cmd tsc --noEmit'), run('fix-lint', 'npm.cmd run lint'),
    run('fix-category-rules-sync', 'node scripts/generate-service-category-rules.mjs'),
  ]);
} else if (phase === 'project') {
  const name = process.argv[3], settings = {
    registration: ['demo-servicepilot-registration', 41497], categories: ['demo-servicepilot-categories', 42497],
  }[name];
  if (!settings) throw Error('Unknown test project');
  const [target, port] = settings;
  const result = await fetch(`${'http://127.0.0.1:8187'}/emulator/v1/projects/${target}:securityRules`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content: readFileSync(resolve(root, 'firestore.rules'), 'utf8') }] } }),
  });
  if (!result.ok) throw Error('Could not load local demo Rules: ' + result.status);
  const config = resolve(directory, name + '.json');
  writeFileSync(config, JSON.stringify({ emulators: { auth: { host: '127.0.0.1', port }, hub: { host: '127.0.0.1', port: port - 57 },
    logging: { host: '127.0.0.1', port: port - 52 }, ui: { enabled: false }, singleProjectMode: true } }));
  await run('fix-' + name + '-harness', `firebase.cmd emulators:exec --only auth --project ${target} --config "${config}" "node scripts/run-audit-fixes.mjs ${name}"`, root, { FIRESTORE_EMULATOR_HOST: local.FIRESTORE_EMULATOR_HOST });
} else if (phase === 'registration') {
  await run('fix-registration-emulator', 'node --test scripts/tests/registration-emulator.test.mjs', root,
    { ...local, GCLOUD_PROJECT: 'demo-servicepilot-registration', FIREBASE_AUTH_EMULATOR_HOST: process.env.FIREBASE_AUTH_EMULATOR_HOST });
} else if (phase === 'categories') {
  await run('fix-profile-rules', 'node --test --test-concurrency=1 scripts/tests/service-categories-emulator.test.mjs scripts/tests/profile-save-emulator.test.mjs scripts/tests/legal-emulator.test.mjs', root,
    { ...local, GCLOUD_PROJECT: 'demo-servicepilot-categories', FIREBASE_AUTH_EMULATOR_HOST: process.env.FIREBASE_AUTH_EMULATOR_HOST });
} else throw Error('Use rules, units, map, checks, or project registration|categories');
