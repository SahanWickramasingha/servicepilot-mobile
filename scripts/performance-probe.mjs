// Deterministic local workload counters, NOT a native FPS/startup benchmark.
import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { performance } from 'node:perf_hooks';
const require = createRequire(import.meta.url), ts = require('typescript');
const root = resolve(process.argv[2] ?? '.');
const fallback = resolve('.');
const modules = new Map(), jsonLoads = [];
const connections = [], authCallbacks = new Set();
const documentMappings = {};
const auth = { currentUser: { uid: 'performance-fixture', emailVerified: true } };
const firestore = new Proxy({
  onSnapshot: (...args) => {
    const options = typeof args[1] === 'object';
    const entry = { path: args[0], next: args[options ? 2 : 1], error: args[options ? 3 : 2], stopped: false };
    connections.push(entry); return () => { entry.stopped = true; };
  },
}, { get: (object, name) => name in object ? object[name] : (...args) => ({ name, args }) });
function load(path) {
  let file = resolve(root, path);
  if (!existsSync(file)) file = resolve(fallback, path);
  if (modules.has(file)) return modules.get(file);
  if (file.endsWith('.json')) { jsonLoads.push(path); const data = JSON.parse(readFileSync(file, 'utf8')); modules.set(file, data); return data; }
  const exports = {};
  modules.set(file, exports);
  const source = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  } }).outputText;
  const get = (id) => {
    if (id === 'firebase/firestore') return firestore;
    if (id === 'firebase/auth') return { onAuthStateChanged: (_, next) => { authCallbacks.add(next); return () => authCallbacks.delete(next); } };
    if (id === 'firebase/app') return { FirebaseError: Error };
    if (id === '@/src/firebase/config') return { db: {}, auth };
    if (id.startsWith('@/')) return load(`${id.slice(2)}.ts`);
    if (id.startsWith('.')) return load(join(dirname(path), id.endsWith('.json') ? id : `${id}.ts`));
    return require(id);
  };
  new Function('exports', 'require', '__DEV__', source)(exports, get, false);
  return exports;
}
const user = load('src/services/user.service.ts'), jobs = load('src/services/request.service.ts');
const tech = load('src/services/technician.service.ts'), notifications = load('src/services/notification.service.ts');
const stops = [];
for (let i = 0; i < 4; i++) {
  stops.push(user.subscribeToUserProfile(auth.currentUser.uid, () => {}, () => {}));
  stops.push(jobs.subscribeToTechnicianRequests(auth.currentUser.uid, () => {}, () => {}));
}
for (let i = 0; i < 3; i++) stops.push(tech.subscribeToTechnicianReviews(auth.currentUser.uid, () => {}, () => {}));
for (let i = 0; i < 2; i++) stops.push(notifications.subscribeToNotificationCenter({ userId: auth.currentUser.uid, role: 'technician' }, () => {}, () => {}));
const beforeData = connections.length;
for (const connection of connections) {
  const collection = connection.path.name === 'doc' ? 'users' : connection.path.args[0].args[1];
  const size = collection === 'service_requests' || collection === 'service_reviews' ? 1000 : 0;
  const docs = Array.from({ length: size }, (_, index) => ({ id: 'fixture-'+index, data: () => {
    documentMappings[collection] = (documentMappings[collection] ?? 0) + 1;
    return { rating: 5, customerName: 'Bandara', status: 'accepted', technicianId: auth.currentUser.uid };
  } }));
  const base = { exists: () => true, data: () => ({ uid: auth.currentUser.uid, role: 'technician' }), docs,
    metadata: { fromCache: false, hasPendingWrites: false } };
  connection.next({ ...base, docChanges: () => docs.map((doc) => ({ type: 'added', doc })) });
  connection.next({ ...base, docChanges: () => docs.length ? [{ type: 'modified', doc: docs[0] }] : [] });
}
const active = connections.filter((entry) => !entry.stopped).length;
stops.forEach((stop) => stop());
const startupGeometryLoads = [...jsonLoads];
const map = load('functions/src/domain/map.ts');
const at = performance.now();
const district = map.DISTRICTS.find((item) => item.id === 'kandy');
const geometry = district.geometry;
const firstGeometryMs = performance.now() - at;
console.log(JSON.stringify({ source: root, consumers: { profiles: 4, jobs: 4, reviews: 3, notificationCenters: 2 },
  firestoreOnSnapshotCalls: beforeData, activeListeners: active, listenersAfterCleanup: connections.filter((entry) => !entry.stopped).length,
  documentMappings, startupGeometryLoads, firstGeometryMs, districtCount: map.DISTRICTS.length, kandyGeometryType: geometry.type }, null, 2));
