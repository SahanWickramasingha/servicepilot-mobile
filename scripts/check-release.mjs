// Offline validation only. Does not contact EAS, Cloudflare, Firebase or Play.
import { readFileSync, existsSync } from 'node:fs';
import { parseEnv } from 'node:util';
import release from './lib/release-config.cjs';
const staticOnly = process.argv.includes('--static');
const fileIndex = process.argv.indexOf('--env-file');
const environment = { ...process.env };
if (fileIndex >= 0) {
  const path = process.argv[fileIndex + 1];
  if (!path || !existsSync(path)) throw Error('Supply an existing ignored env file after --env-file.');
  Object.assign(environment, parseEnv(readFileSync(path, 'utf8')));
}
const issues = [];
const app = JSON.parse(readFileSync('app.json', 'utf8')).expo;
const eas = JSON.parse(readFileSync('eas.json', 'utf8'));
if (eas.build.preview.android.buildType !== 'apk' || eas.build.preview.distribution !== 'internal') issues.push('Preview must produce an internally distributed APK.');
if (eas.build.production.android.buildType !== 'app-bundle' || eas.build.production.distribution !== 'store') issues.push('Production must produce a store AAB.');
if (eas.cli.appVersionSource !== 'remote' || eas.build.production.autoIncrement !== true) issues.push('Remote auto-incremented production version codes are required.');
for (const profile of ['preview', 'production']) {
  if (eas.build[profile].environment !== profile || eas.build[profile].credentialsSource !== 'remote' ||
    eas.build[profile].env.SERVICEPILOT_RELEASE !== '1' || eas.build[profile].env.EXPO_PUBLIC_USE_FIREBASE_EMULATORS !== '0') issues.push(`Invalid ${profile} release environment/signing configuration.`);
}
if (!/^\d+\.\d+\.\d+$/.test(app.version)) issues.push('Set an explicit semantic app version.');
for (const asset of [app.icon, app.android.adaptiveIcon.foregroundImage, app.web.favicon]) {
  if (!existsSync(asset)) issues.push('A referenced application icon is missing.');
}
const ignored = readFileSync('.easignore', 'utf8').split(/\r?\n/);
for (const pattern of ['.env', '.env.*', 'secrets/', '**/secrets/', 'credentials.json', '**/*serviceAccount*.json',
  '**/*service-account*.json', '**/*.pem', '**/*.jks', 'photo-worker/', 'booking-worker/', 'functions/src/services/', 'pnpm-lock.yaml', 'pnpm-workspace.yaml']) {
  if (!ignored.includes(pattern)) issues.push(`Missing required EAS exclusion: ${pattern}`);
}
if (ignored.includes('functions/') || ignored.includes('functions/src/') || ignored.includes('functions/src/domain/')) issues.push('EAS must retain shared functions/src/domain source.');
if (!staticOnly) issues.push(...release.releaseProblems(environment));
for (const issue of issues) console.error(`BLOCKED: ${issue}`);
if (!issues.length) console.log(staticOnly ? 'Static release profiles/assets/upload exclusions: passed.' : 'Offline release configuration: passed. Signing, hosting, Play compliance and device tests still require verification.');
else console.error(`${issues.length} release prerequisite(s) missing/invalid. Values and secrets hidden.`);
process.exitCode = issues.length ? 1 : 0;
