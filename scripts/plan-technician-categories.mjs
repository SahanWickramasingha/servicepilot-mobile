// Offline review plan only. There is deliberately no Admin SDK or apply mode.
import { readFileSync, writeFileSync } from 'node:fs';
import { loadService } from './lib/subscription-reliability-workloads.mjs';
const { technicianCategory } = loadService('functions/src/domain/serviceCategories.ts', {});
const args = process.argv.slice(2), value = name => args[args.indexOf(name) + 1];
if (!args.includes('--audit') || !args.includes('--output')) throw Error('Supply --audit <local JSON> and --output <local plan JSON>.');
const audit = JSON.parse(readFileSync(value('--audit'), 'utf8'));
if (audit.project !== 'servicepilot-756d9' || audit.readOnly !== true) throw Error('Expected a read-only project category audit.');
const plan = { project: audit.project, remoteWrites: false, complete: audit.complete, manualCorrection: [], confirmedNormalization: [] };
for (const record of audit.records) {
  const category = technicianCategory(record.user);
  const base = { id: record.id, name: record.projection?.fullName ?? '(no public projection)', legacySpecialization: record.user.specialization ?? null };
  if (!category) plan.manualCorrection.push({ ...base, reason: 'Missing, ambiguous, invalid or conflicting specialty. Technician must explicitly select a category.' });
  else if (record.user.serviceCategoryId !== category.id || record.projection?.serviceCategoryId !== category.id || record.projection?.serviceCategory !== category.label) {
    plan.confirmedNormalization.push({ ...base, serviceCategoryId: category.id, label: category.label, action: 'Review, then save through the technician profile or normal approval flow; nothing applied by this script.' });
  }
}
writeFileSync(value('--output'), JSON.stringify(plan, null, 2));
console.log(JSON.stringify(plan, null, 2));
