import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import release from './release-config.cjs';

export function evaluatePreviewConfig({ projectRoot = process.cwd(), env = process.env, run = spawnSync } = {}) {
  const app = JSON.parse(readFileSync(join(projectRoot, 'app.json'), 'utf8')).expo;
  const profile = JSON.parse(readFileSync(join(projectRoot, 'eas.json'), 'utf8')).build.preview;
  const environment = { ...env, ...profile.env, EXPO_NO_DOTENV: '1', EXPO_NO_TELEMETRY: '1' };
  const problems = release.releaseProblems(release.releaseEnvironment(environment, app));
  const diagnostics = problems.map(problem => `FAIL ${problem}`); // Fixed, value-free release messages.
  const require = createRequire(join(projectRoot, 'package.json'));
  const cli = join(dirname(require.resolve('expo/package.json')), 'bin', 'cli');
  const options = { cwd: projectRoot, env: environment, encoding: 'utf8', timeout: 30000, maxBuffer: 10 * 1024 * 1024 };
  // Match EAS's real subprocess instead of relying on in-process getConfig/cache.
  const result = run(process.execPath, [cli, 'config', '--json'], options);
  if (result.error || result.status !== 0) {
    diagnostics.push(`FAIL EXPO_CONFIG_PROCESS${result.error?.code === 'ETIMEDOUT' ? '_TIMEOUT' : ''}`);
    // Expo --json suppresses errors here. Capture non-JSON diagnostics privately;
    // never print this output, which may contain an actual key on success.
    const details = run(process.execPath, [cli, 'config'], options);
    const captured = `${details.stderr ?? ''}\n${details.stdout ?? ''}`;
    if (captured.includes('Release configuration rejected:')) diagnostics.push('FAIL EXPO_CONFIG_RELEASE_VALIDATION');
    if (/Cannot find module|MODULE_NOT_FOUND/.test(captured)) diagnostics.push('FAIL EXPO_CONFIG_MODULE_RESOLUTION');
    return { ok: false, diagnostics };
  }
  let exp;
  try { exp = JSON.parse(result.stdout); }
  catch { return { ok: false, diagnostics: [...diagnostics, 'FAIL EXPO_CONFIG_JSON'] }; }
  const expected = release.releaseEnvironment(environment, app);
  if (exp.android?.package !== expected.EXPO_ANDROID_PACKAGE || exp.owner !== expected.EXPO_OWNER ||
      exp.extra?.eas?.projectId !== expected.EXPO_EAS_PROJECT_ID ||
      exp.android?.config?.googleMaps?.apiKey !== expected.GOOGLE_MAPS_ANDROID_API_KEY) {
    diagnostics.push('FAIL EXPO_CONFIG_RESOLVED_VALUES');
  }
  return { ok: diagnostics.length === 0, diagnostics };
}
