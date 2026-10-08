import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url), ts = require('typescript');
function pureModule(path) {
  const exports = {};
  new Function('exports', ts.transpileModule(readFileSync(new URL('../../'+path, import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(exports);
  return exports;
}
const { createSharedSubscription } = pureModule('src/utils/sharedSubscription.ts');
const documents = pureModule('src/utils/liveDocuments.ts');
// Run the real pooling/reducer logic in host tests, bound to each fixture's Auth.
export function performanceTestDependency(id, deps) {
  if (id === '@/src/utils/liveDocuments') return documents;
  if (id === './session-subscriptions') {
    const auth = deps['@/src/firebase/config']?.auth;
    return { createSessionStream: (reset) => createSharedSubscription({
      current: () => auth?.currentUser?.uid ?? null,
      watch: (change) => typeof auth?.onAuthStateChanged === 'function' ? auth.onAuthStateChanged(change) : () => {},
    }, reset) };
  }
}
