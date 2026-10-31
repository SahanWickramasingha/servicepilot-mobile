// Read-only, bounded schema audit. No Auth user listing, credentials or private
// contact/address/GPS fields are logged. No remote writes or migration mode.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const args = process.argv.slice(2), value = name => args[args.indexOf(name) + 1];
if (!args.includes('--credential') || !args.includes('--output')) throw Error('Supply --credential <ignored local JSON> and --output <local report>. No values are printed.');
if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST) throw Error('Clear emulator overrides for an explicit real-project read-only audit.');
let credential;
try { credential = JSON.parse(readFileSync(resolve(value('--credential')), 'utf8')); }
catch { throw Error('Credential file is unreadable or invalid (contents hidden).'); }
if (credential.type !== 'service_account' || credential.project_id !== 'servicepilot-756d9') throw Error('Expected an approved service account for servicepilot-756d9.');
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { initializeApp, cert, deleteApp } = require('firebase-admin/app');
const { getFirestore, FieldPath } = require('firebase-admin/firestore');
const app = initializeApp({ projectId: 'servicepilot-756d9', credential: cert(credential) }, 'category-read-only-audit');
const db = getFirestore(app);
try {
  const users = await db.collection('users').where('role', '==', 'technician').orderBy(FieldPath.documentId()).limit(101)
    .select('role', 'specialization', 'serviceCategory', 'serviceCategoryId', 'technicianApprovalStatus', 'accountStatus', 'serviceDistrictIds').get();
  const rows = users.docs.slice(0, 100);
  const projections = rows.length ? await db.getAll(...rows.map(row => db.doc('technician_map_profiles/' + row.id)),
    { fieldMask: ['fullName', 'specialization', 'serviceCategory', 'serviceCategoryId', 'approved', 'serviceDistrictIds'] }) : [];
  const report = { project: 'servicepilot-756d9', readOnly: true, generatedAt: new Date().toISOString(), complete: users.size <= 100,
    records: rows.map((row, index) => ({ id: row.id, user: row.data(), projection: projections[index].exists ? projections[index].data() : null })), queryChecks: [] };
  if (args.includes('--check-indexes')) {
    for (const category of ['Electrical', 'Air Conditioning']) for (const district of [undefined, 'kandy']) {
      try {
        let query = db.collection('technician_map_profiles').where('approved', '==', true).where('serviceCategory', 'in', [category, '']);
        if (district) query = query.where('serviceDistrictIds', 'array-contains', district);
        const result = await query.orderBy(FieldPath.documentId()).limit(8).select('specialization', 'serviceCategory', 'serviceCategoryId').get();
        report.queryChecks.push({ category, district: district ?? 'All', status: 'passed', candidates: result.size });
      } catch (error) { report.queryChecks.push({ category, district: district ?? 'All', status: 'failed', code: error.code ?? 'unavailable' }); }
    }
  }
  mkdirSync(resolve(value('--output'), '..'), { recursive: true });
  writeFileSync(resolve(value('--output')), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  console.error('Read-only category audit failed:', typeof error.code === 'string' || typeof error.code === 'number' ? error.code : 'unavailable');
  process.exitCode = 1;
} finally { await db.terminate(); await deleteApp(app); }
