// Read-only baseline/verification around an operator's manual acceptance tap.
// No scheduling HTTP call, transaction, user write or notification write exists here.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { validateBookingCredential, bookingProject } from './lib/booking-real-config.mjs';
const require = createRequire(resolve('functions/package.json'));
const { initializeApp, cert, deleteApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const mode = process.argv[2];
const selectedTag = process.argv[3];
if (!['baseline', 'verify'].includes(mode)) throw Error('Use baseline or verify [requestTag].');
const credential = JSON.parse(readFileSync(process.env.SERVICEPILOT_BOOKING_CREDENTIALS, 'utf8'));
validateBookingCredential(credential, process.env.SERVICEPILOT_BOOKING_SERVICE_ACCOUNT);
const app = initializeApp({ projectId: bookingProject, credential: cert(credential) });
const db = getFirestore(app);
const directory = '.firebase/review-config/real-booking';
const file = `${directory}/acceptance-baseline.json`;
async function notifications(id) {
  const result = await db.collection('notifications').where('requestId', '==', id).limit(101).get();
  if (result.size > 100) throw Error('notification-count-bound-exceeded');
  return result.docs.filter(doc => doc.data().type === 'technician_accepted_request').length;
}
try {
  if (mode === 'baseline') {
    const result = await db.collection('service_requests').where('status', 'in', ['requested', 'pending']).limit(51).get();
    if (result.size > 50) throw Error('pending-request-bound-exceeded');
    const entries = [];
    for (const document of result.docs) {
      entries.push({ id: document.id, tag: createHash('sha256').update(document.id).digest('hex').slice(0, 16),
        status: document.data().status, acceptanceNotifications: await notifications(document.id) });
    }
    mkdirSync(directory, { recursive: true });
    writeFileSync(file, JSON.stringify({ project: bookingProject, capturedAt: new Date().toISOString(), entries }, null, 2));
    console.log(`Read-only baseline saved for ${entries.length} pending requests. No payloads or personal data logged.`);
    for (const { tag, status, acceptanceNotifications } of entries) console.log(JSON.stringify({ tag, status, acceptanceNotifications }));
  } else {
    const baseline = JSON.parse(readFileSync(file, 'utf8'));
    if (baseline.project !== bookingProject) throw Error('baseline-project-mismatch');
    const entries = baseline.entries.filter(entry => !selectedTag || entry.tag === selectedTag);
    if (!entries.length) throw Error('request-not-in-baseline');
    for (const entry of entries) {
      const snapshot = await db.doc(`service_requests/${entry.id}`).get();
      const job = snapshot.data();
      const count = await notifications(entry.id);
      console.log(JSON.stringify({ tag: entry.tag, beforeStatus: entry.status, status: job?.status ?? 'absent',
        schedulingVersion: job?.schedulingVersion, acceptanceNotificationsBefore: entry.acceptanceNotifications,
        acceptanceNotificationsAfter: count, notificationDelta: count - entry.acceptanceNotifications,
        deterministicNoticeExists: (await db.doc(`notifications/${entry.id}_technician_accepted_request`).get()).exists }));
    }
  }
} catch (error) {
  console.error('Read-only acceptance inspection failed; code: ' +
    (typeof error.code === 'number' ? error.code : /^[a-z-]+$/.test(error.message) ? error.message : 'provider-error'));
  process.exitCode = 1;
} finally { await db.terminate(); await deleteApp(app); }
