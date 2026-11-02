import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url), ts = require('typescript');
function pureModule(path) {
  const moduleURL = new URL('../../'+path, import.meta.url);
  const exports = {};
  new Function('exports', '__DEV__', 'require', ts.transpileModule(readFileSync(moduleURL, 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText)(exports, false, createRequire(moduleURL));
  return exports;
}
const { createSharedSubscription } = pureModule('src/utils/sharedSubscription.ts');
const documents = pureModule('src/utils/liveDocuments.ts');
const safetyFixture = { blocked: new Set(), ready: true, error: '' };
const { createBoundedSessionCache } = pureModule('src/utils/boundedSessionCache.ts');
// Run the real pooling/reducer logic in host tests, bound to each fixture's Auth.
export function performanceTestDependency(id, deps) {
  if (id === '@/src/components/legal/Safety') return { useSafety: () => safetyFixture, useHiddenProfiles: () => ({ hidden: safetyFixture.blocked, ready: true }), SafetyContent: 'SafetyContent', SafetyActions: 'SafetyActions' };
  if (id === '@/functions/src/domain/legalPolicy') return pureModule('functions/src/domain/legalPolicy.ts');
  // Existing transport/category workloads assume accepted users; dedicated legal
  // tests execute the real acceptance service, including cancellation/retries.
  if (id === './policy.service') return { requirePolicyAcceptance: async () => {} };
  if (id === '@/functions/src/domain/serviceCategories' || id === './serviceCategories' || id === '../domain/serviceCategories') return pureModule('functions/src/domain/serviceCategories.ts');
  if (id.startsWith('@noble/hashes/')) return require(id);
  if (id === '@/src/utils/photoReferences') return pureModule('src/utils/photoReferences.ts');
  if (id === './privatePhotos.service') {
    const output = {};
    new Function('exports', 'require', '__DEV__', ts.transpileModule(readFileSync(new URL('../../src/services/privatePhotos.service.ts', import.meta.url), 'utf8'),
      { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(output,
      (name) => deps[name] ?? performanceTestDependency(name, deps) ?? (name === './reviewPhotos.service' ? {} : undefined), false);
    return output;
  }
  if (id === '@/src/utils/requestSubmissionDiagnostics') return pureModule('src/utils/requestSubmissionDiagnostics.ts');
  if (id === '@/src/utils/requestAttachments') return pureModule('src/utils/requestAttachments.ts');
  if (id === './notificationHistory' || id === './bookingSchedule.service') {
    const output = {};
    new Function('exports', 'require', ts.transpileModule(readFileSync(new URL('../../src/services/' + (id === './notificationHistory' ? 'notificationHistory.ts' : 'bookingSchedule.service.ts'), import.meta.url), 'utf8'),
      { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(output, (name) => deps[name]);
    return output;
  }
  if (id === '@/src/utils/signatureCoordinates') return pureModule('src/utils/signatureCoordinates.ts');
  if (id === '@/functions/src/domain/scheduling') return pureModule('functions/src/domain/scheduling.ts');
  if (id === '@/functions/src/domain/workTimer') return pureModule('functions/src/domain/workTimer.ts');
  if (id === '@/functions/src/domain/jobEvidence') return pureModule('functions/src/domain/jobEvidence.ts');
  if (id === '@/functions/src/domain/booking') return pureModule('functions/src/domain/booking.ts');
  if (id === '@/src/utils/liveDocuments') return documents;
  if (id === '@/src/utils/reviewDiagnostics') return pureModule('src/utils/reviewDiagnostics.ts');
  if (id === '@/src/utils/reviewValidation') return pureModule('src/utils/reviewValidation.ts');
  if (id === './session-subscriptions') {
    const auth = deps['@/src/firebase/config']?.auth;
    const scope = {
      current: () => auth?.currentUser?.uid ?? null,
      watch: (change) => typeof auth?.onAuthStateChanged === 'function' ? auth.onAuthStateChanged(change) : () => {},
    };
    return { createSessionStream: (reset) => createSharedSubscription(scope, reset),
      createSessionCache: (capacity) => createBoundedSessionCache(scope, capacity) };
  }
}
