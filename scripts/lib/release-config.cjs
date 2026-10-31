const { isIP } = require('node:net');

function permanentOrigin(value, name) {
  let url;
  try { url = new URL(value); } catch { throw Error(`${name} must be a permanent HTTPS origin.`); }
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
    !host.includes('.') || isIP(host.replace(/^\[|\]$/g, '')) ||
    /(^|\.)(localhost|local|localdomain|internal|test|invalid|example|trycloudflare\.com|ngrok\.io|ngrok-free\.app|localhost\.run|nip\.io|sslip\.io)$/.test(host) ||
    /(^|\.)example\.(com|org|net)$/.test(host) || /(^|\.)(demo|replace-me|your-[a-z-]+)(\.|$)/.test(host)) {
    throw Error(`${name} must use a public permanent HTTPS origin; local, demo, example and temporary tunnel URLs are forbidden.`);
  }
  return url.origin;
}

function releaseProblems(env) {
  const issues = [];
  for (const name of ['EXPO_PUBLIC_BOOKING_API_URL', 'EXPO_PUBLIC_PHOTO_API_URL']) {
    try { permanentOrigin(env[name], name); } catch (error) { issues.push(error.message); }
  }
  if (env.EXPO_PUBLIC_USE_FIREBASE_EMULATORS !== '0') issues.push('EXPO_PUBLIC_USE_FIREBASE_EMULATORS must explicitly be 0 for a release.');
  for (const name of ['EXPO_PUBLIC_FIREBASE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST', 'FIRESTORE_EMULATOR_HOST',
    'FIREBASE_STORAGE_EMULATOR_HOST', 'FIREBASE_DATABASE_EMULATOR_HOST']) {
    if (env[name]) issues.push(`Remove ${name} from the release environment.`);
  }
  if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(env.EXPO_ANDROID_PACKAGE ?? '') ||
    /^(com\.example|host\.exp\.exponent)(\.|$)/.test(env.EXPO_ANDROID_PACKAGE ?? '')) {
    issues.push('EXPO_ANDROID_PACKAGE must be the owner-approved permanent Android application ID.');
  }
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(env.EXPO_EAS_PROJECT_ID ?? '')) issues.push('EXPO_EAS_PROJECT_ID must be the actual linked EAS project UUID.');
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(env.EXPO_OWNER ?? '')) issues.push('EXPO_OWNER must identify the actual Expo account or organization.');
  if (!env.GOOGLE_MAPS_ANDROID_API_KEY?.trim()) issues.push('GOOGLE_MAPS_ANDROID_API_KEY is required for the native Android map.');
  for (const [name, value] of Object.entries(env)) {
    if (value && ((name.startsWith('EXPO_PUBLIC_') && (/SECRET|PRIVATE|CREDENTIAL|SERVICE_ACCOUNT|PASSWORD|TOKEN/.test(name) || /-----BEGIN .*PRIVATE KEY-----/.test(value))) ||
      /^(GOOGLE_APPLICATION_CREDENTIALS|SERVICEPILOT_BOOKING_CREDENTIALS|BOOKING_SERVICE_ACCOUNT_EMAIL|BOOKING_SERVICE_ACCOUNT_PRIVATE_KEY|FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY|FIREBASE_PRIVATE_KEY|DISPATCHER_SMTP_PASSWORD)$/.test(name))) {
      issues.push(`Remove server credential variable ${name} from the mobile build environment.`);
    }
  }
  return issues;
}

function assertReleaseEnvironment(env) {
  const issues = releaseProblems(env);
  if (issues.length) throw Error('Release configuration rejected:\n- ' + issues.join('\n- '));
}

module.exports = { permanentOrigin, releaseProblems, assertReleaseEnvironment };
