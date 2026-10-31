// Offline inspection only: no Admin SDK initialization, token requests or Firebase reads/writes.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { inspectBookingLocal } from './lib/booking-real-config.mjs';

const report = inspectBookingLocal(process.cwd());
const adcPath = process.env.APPDATA && resolve(process.env.APPDATA, 'gcloud/application_default_credentials.json');
console.log(`Standard user ADC file present: ${Boolean(adcPath && existsSync(adcPath))} (not selected automatically)`);
for (const name of ['DISPATCHER_ADMIN_ORIGIN', 'DISPATCHER_SMTP_HOST', 'DISPATCHER_SMTP_PORT',
  'DISPATCHER_SMTP_USER', 'DISPATCHER_SMTP_PASSWORD', 'DISPATCHER_SMTP_FROM']) {
  console.log(`${name} configured in server shell: ${Boolean(process.env[name])} (value hidden)`);
}
for (const fact of report.facts) console.log(fact);
console.log('Booking-only mode: SMTP and account-administration routes disabled. Local port: 8790. Project: servicepilot-756d9.');
for (const issue of report.issues) console.error(`MISSING/INVALID: ${issue}`);
process.exitCode = report.issues.length ? 1 : 0;
