// Captures introspected native manifest privately; never prints Maps metadata.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const cli = join(dirname(require.resolve('expo/package.json')), 'bin', 'cli');
const profile = JSON.parse(readFileSync('eas.json', 'utf8')).build.preview;
const result = spawnSync(process.execPath, [cli, 'config', '--type', 'introspect', '--json'], {
  env: { ...process.env, ...profile.env, EXPO_NO_DOTENV: '1', EXPO_NO_TELEMETRY: '1' },
  encoding: 'utf8', timeout: 60000, maxBuffer: 20 * 1024 * 1024,
});
if (result.error || result.status !== 0) { console.log('FAIL ANDROID_MANIFEST_INTROSPECTION'); process.exit(1); }
const granted = new Set(), removed = new Set();
function visit(value) {
  if (!value || typeof value !== 'object') return;
  for (const permission of value['uses-permission'] ?? []) {
    const attributes = permission.$ ?? {};
    if (typeof attributes['android:name'] === 'string') (attributes['tools:node'] === 'remove' ? removed : granted).add(attributes['android:name']);
  }
  for (const child of Object.values(value)) if (Array.isArray(child)) child.forEach(visit); else visit(child);
}
try { visit(JSON.parse(result.stdout)); } catch { console.log('FAIL ANDROID_MANIFEST_JSON'); process.exit(1); }
if (!granted.size) { console.log('FAIL NO_GENERATED_MANIFEST'); process.exit(1); }
for (const name of [...granted].filter(name => !removed.has(name)).sort()) console.log(`GENERATED ${name}`);
const blocked = JSON.parse(readFileSync('app.json', 'utf8')).expo.android.blockedPermissions;
const missing = blocked.filter(name => !removed.has(name));
for (const name of missing) console.log(`FAIL MISSING_REMOVAL ${name}`);
const versions = readFileSync('node_modules/react-native/gradle/libs.versions.toml', 'utf8');
console.log(`INSTALLED_RN_TARGET_API ${/^targetSdk\s*=\s*"(\d+)"/m.exec(versions)?.[1] ?? 'UNKNOWN'}`);
console.log(missing.length ? 'FAIL' : 'PASS GENERATED_MANIFEST_EXCLUSIONS');
console.log('FINAL_GRADLE_MERGED_MANIFEST_UNVERIFIED');
process.exitCode = missing.length ? 1 : 0;
