import { readFileSync, existsSync, realpathSync } from 'node:fs';
import { resolve, relative, isAbsolute, sep } from 'node:path';
import { createPrivateKey } from 'node:crypto';

export const bookingProject = 'servicepilot-756d9';
export function validateBookingCredential(value, expectedEmail, workerEmails = []) {
  if (!expectedEmail || !/^[a-z][a-z0-9-]*@servicepilot-756d9\.iam\.gserviceaccount\.com$/.test(expectedEmail)) {
    throw Error('Set SERVICEPILOT_BOOKING_SERVICE_ACCOUNT to the explicitly selected booking runtime service-account email.');
  }
  if ([...workerEmails, 'servicepilot-photo-worker@servicepilot-756d9.iam.gserviceaccount.com'].includes(expectedEmail)) {
    throw Error('The photo Worker identity cannot be used for booking. Supply a separate approved identity.');
  }
  if (!value || value.type !== 'service_account' || value.project_id !== bookingProject || value.client_email !== expectedEmail) {
    throw Error('Booking credential must be a service-account JSON for the selected identity in servicepilot-756d9.');
  }
  try {
    if (createPrivateKey(value.private_key).asymmetricKeyType !== 'rsa') throw Error();
  } catch { throw Error('Booking credential has a missing or invalid RSA private key (contents hidden).'); }
  return true;
}

export function validateBookingHttps(base) {
  let url;
  try { url = new URL(base); } catch { throw Error('Set an approved HTTPS EXPO_PUBLIC_BOOKING_API_URL.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw Error('Local real-account setup requires an HTTPS origin without credentials, path, query or fragment.');
  }
  return url.origin;
}

function envValue(text, name) {
  const raw = text.match(new RegExp(`^\\s*(?:export\\s+)?${name}\\s*=\\s*(.*)$`, 'm'))?.[1]?.trim();
  return raw?.replace(/^(['"])(.*)\1$/, '$2');
}

export function inspectBookingLocal(root, environment = process.env) {
  const issues = [], facts = [], workerEmails = [];
  for (const name of ['FIREBASE_AUTH_EMULATOR_HOST', 'FIRESTORE_EMULATOR_HOST',
    'FIREBASE_STORAGE_EMULATOR_HOST', 'FIREBASE_DATABASE_EMULATOR_HOST']) {
    if (environment[name]) issues.push(`Remove ${name} before starting the real Firebase backend.`);
  }
  for (const file of ['photo-worker/.dev.vars', 'photo-worker/.dev.vars.local']) {
    const path = resolve(root, file);
    if (!existsSync(path)) continue;
    const email = envValue(readFileSync(path, 'utf8'), 'FIREBASE_SERVICE_ACCOUNT_EMAIL');
    if (email) workerEmails.push(email);
  }
  if (environment.FIREBASE_SERVICE_ACCOUNT_EMAIL) workerEmails.push(environment.FIREBASE_SERVICE_ACCOUNT_EMAIL);
  if (/^[a-z][a-z0-9-]*@[a-z0-9-]+\.iam\.gserviceaccount\.com$/.test(environment.SERVICEPILOT_PHOTO_WORKER_SERVICE_ACCOUNT ?? '')) {
    workerEmails.push(environment.SERVICEPILOT_PHOTO_WORKER_SERVICE_ACCOUNT);
  }
  facts.push(`Photo Worker identity available for comparison: ${workerEmails.length > 0}`);
  if (!workerEmails.length) facts.push('Photo identity comparison unavailable; booking IAM must be verified independently. Known photo principals remain rejected.');
  facts.push(`Generic GOOGLE_APPLICATION_CREDENTIALS configured: ${Boolean(environment.GOOGLE_APPLICATION_CREDENTIALS)} (not selected automatically)`);
  const localEnvPath = resolve(root, '.env.local');
  const localEnv = existsSync(localEnvPath) ? readFileSync(localEnvPath, 'utf8') : '';
  for (const name of ['EXPO_PUBLIC_PHOTO_API_URL', 'EXPO_PUBLIC_BOOKING_API_URL']) {
    facts.push(`${name} in .env.local: ${Boolean(envValue(localEnv, name))} (value hidden)`);
  }
  const file = environment.SERVICEPILOT_BOOKING_CREDENTIALS;
  if (!file) issues.push('SERVICEPILOT_BOOKING_CREDENTIALS is missing. Supply an explicitly selected booking service-account JSON path.');
  else {
    try {
      let path;
      try { path = realpathSync(resolve(root, file)); }
      catch { throw Error('Booking credential file cannot be read (path and contents hidden).'); }
      const workerRelative = relative(realpathSync(resolve(root, 'photo-worker')), path);
      if (workerRelative !== '..' && !workerRelative.startsWith('..' + sep) && !isAbsolute(workerRelative)) {
        throw Error('Photo Worker credential files cannot be selected for booking.');
      }
      let credential;
      try { credential = JSON.parse(readFileSync(path, 'utf8')); }
      catch { throw Error('Booking credential file is unreadable or invalid JSON (contents hidden).'); }
      validateBookingCredential(credential, environment.SERVICEPILOT_BOOKING_SERVICE_ACCOUNT, workerEmails);
      facts.push('Selected booking credential metadata and RSA key parse: valid (no token requested; IAM not verified)');
    } catch (error) { issues.push(error.message); }
  }
  if (!environment.SERVICEPILOT_BOOKING_SERVICE_ACCOUNT) issues.push('SERVICEPILOT_BOOKING_SERVICE_ACCOUNT is missing.');
  return { facts, issues };
}
