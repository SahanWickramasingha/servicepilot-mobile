// Explicit read-only provider checks. Never call the scheduling action or write data.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { inspectBookingLocal, bookingProject } from './lib/booking-real-config.mjs';

const require = createRequire(resolve('functions/package.json'));
const { cert, initializeApp, deleteApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
const permissions = ['datastore.databases.get', 'datastore.entities.get', 'datastore.entities.list',
  'datastore.entities.create', 'datastore.entities.update', 'firebaseauth.users.get'];
let app, db;
try {
  const report = inspectBookingLocal(process.cwd());
  if (report.issues.length) throw Error('configuration');
  const credential = cert(JSON.parse(readFileSync(process.env.SERVICEPILOT_BOOKING_CREDENTIALS, 'utf8')));
  const token = await credential.getAccessToken();
  console.log('OAuth credential: valid (token hidden).');
  const response = await fetch(`https://cloudresourcemanager.googleapis.com/v1/projects/${bookingProject}:testIamPermissions`, {
    method: 'POST', headers: { Authorization: `Bearer ${token.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ permissions }), signal: AbortSignal.timeout(15000),
  });
  const result = await response.json();
  if (!response.ok) throw Error('permission-probe');
  const missing = permissions.filter(permission => !result.permissions?.includes(permission));
  if (missing.length) {
    console.error('Missing runtime permissions: ' + missing.join(', '));
    throw Error('runtime-permissions');
  }
  console.log('All six booking runtime IAM permissions: granted (no policy changed).');
  app = initializeApp({ projectId: bookingProject, credential });
  const absentId = `booking-connectivity-${randomUUID()}`;
  try { await getAuth(app).getUser(absentId); }
  catch (error) { if (error.code !== 'auth/user-not-found') throw Error('auth-read'); }
  console.log('Firebase Auth user lookup: reachable.');
  db = getFirestore(app);
  db.settings({ retrySettings: { maxRetries: 0 } });
  // Random nonexistent ID; never print returned records, even in a collision.
  await db.doc(`service_requests/${absentId}`).get();
  for (const field of ['technicianId', 'assignedTechnicianId']) {
    await db.collection('service_requests').where(field, '==', absentId)
      .where('status', 'in', ['accepted', 'assigned', 'in_progress']).limit(1).get();
    console.log(`Firestore ${field}/status scheduling query: reachable, index ready.`);
  }
  console.log('Read-only readiness checks passed. No bookings, users, notifications or IAM were modified.');
} catch (error) {
  // Provider messages can contain credential paths or response details. Print only safe codes.
  const safeCode = typeof error.code === 'number' ? `provider-${error.code}` :
    ['configuration', 'permission-probe', 'runtime-permissions', 'auth-read'].includes(error.message) ? error.message : 'provider-connectivity';
  console.error(`Read-only readiness failed: ${safeCode}. Run preflight; check credentials, Google API access and scheduling indexes. Details hidden.`);
  process.exitCode = 1;
} finally {
  if (db) await db.terminate();
  if (app) await deleteApp(app);
}
