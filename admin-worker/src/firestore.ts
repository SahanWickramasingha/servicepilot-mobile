import { ProviderError } from './runtime';

// Deliberately narrow subset used by the shared engines. No SDK or gRPC runtime.
type Data = Record<string, any>;
type Wire = Record<string, any>;
export const serverTime = Symbol('admin/server-timestamp');
class Timestamp {
  constructor(readonly iso: string) {}
  toMillis() { return Date.parse(this.iso); }
}
export function encode(value: unknown): Wire {
  if (value instanceof Timestamp) return { timestampValue: value.iso };
  if (value === null) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number' && Number.isFinite(value)) return Number.isSafeInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } };
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) return { mapValue: { fields: fields(value as Data) } };
  throw new ProviderError('admin/invalid-write');
}
const fields = (value: Data): Wire => Object.fromEntries(Object.entries(value).map(([k, v]) => [k, encode(v)]));
function decode(value: Wire): unknown {
  if ('timestampValue' in value) return new Timestamp(value.timestampValue);
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('nullValue' in value) return null;
  if ('integerValue' in value) {
    const result = Number(value.integerValue);
    if (!Number.isSafeInteger(result)) throw new ProviderError('admin/unsafe-integer');
    return result;
  }
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('mapValue' in value) return dataOf(value.mapValue.fields);
  if ('arrayValue' in value) return (value.arrayValue.values ?? []).map(decode);
  return value; // Unused legacy GeoPoints/bytes remain opaque, never publicly spread.
}
const dataOf = (value: Wire = {}): Data => Object.fromEntries(Object.entries(value).map(([k, v]) => [k, decode(v)]));
class FirestoreFailure extends ProviderError {
  constructor(readonly status: string) { super('admin/firestore-unavailable'); }
}
type Snapshot = { exists: boolean; data(): Data | undefined };
export type Ref = { path: string; get(): Promise<Snapshot>; update(data: Data): Promise<void> };
type Transaction = {
  get(ref: Ref): Promise<Snapshot>; getAll(...refs: Ref[]): Promise<Snapshot[]>;
  create(ref: Ref, data: Data): void; update(ref: Ref, data: Data): void;
  set(ref: Ref, data: Data, options?: { merge: boolean }): void; delete(ref: Ref): void;
};
const allowed = new Set(['users', 'dispatcher_provisioning_operations', 'dispatcher_provisioning_emails',
  'dispatcher_invitation_deliveries', 'audit_logs', 'account_lifecycle_locks', 'account_lifecycle_requests',
  'technician_map_profiles', 'technician_locations', 'technician_map_locations', 'technician_decision_emails']);

export function firestoreStore(project: string, token: () => Promise<string>, transport: typeof fetch,
  endpoint = 'https://firestore.googleapis.com/v1') {
  const root = `projects/${project}/databases/(default)/documents`, base = `${endpoint}/${root}`;
  function name(ref: Ref) {
    const parts = ref.path.split('/');
    if (parts.length !== 2 || !allowed.has(parts[0]) || !parts[1] || parts[1].length > 128 ||
      ['.', '..'].includes(parts[1]) || Array.from(parts[1]).some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) throw new ProviderError('admin/invalid-path');
    return `${root}/${ref.path}`;
  }
  async function call(action: string, body: unknown) {
    const response = await transport(base + ':' + action, { method: 'POST',
      headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await response.json() as Wire;
    if (!response.ok) throw new FirestoreFailure(typeof data.error?.status === 'string' ? data.error.status : 'UNAVAILABLE');
    return data;
  }
  async function read(refs: Ref[], transaction?: string): Promise<Snapshot[]> {
    const rows = await call('batchGet', { documents: refs.map(name), ...(transaction ? { transaction } : {}) });
    if (!Array.isArray(rows)) throw new ProviderError('admin/invalid-batch');
    const byName = new Map(rows.map(row => [row.found?.name ?? row.missing, row]));
    return refs.map(ref => {
      const row = byName.get(name(ref));
      if (!row || Boolean(row.found) === Boolean(row.missing)) throw new ProviderError('admin/missing-snapshot');
      return { exists: Boolean(row.found), data: () => row.found ? dataOf(row.found.fields) : undefined };
    });
  }
  function write(ref: Ref, data: Data, mode: 'create' | 'update' | 'set' | 'merge'): Wire {
    const regular: Data = {}, transforms: Wire[] = [];
    for (const [key, value] of Object.entries(data)) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) throw new ProviderError('admin/invalid-field');
      if (value === serverTime) transforms.push({ fieldPath: key, setToServerValue: 'REQUEST_TIME' });
      else regular[key] = value;
    }
    // Core merge writes only top-level scalar fields and whole receipt maps.
    return { update: { name: name(ref), fields: fields(regular) },
      ...(['update', 'merge'].includes(mode) ? { updateMask: { fieldPaths: Object.keys(regular) } } : {}),
      ...(mode === 'create' ? { currentDocument: { exists: false } } : mode === 'update' ? { currentDocument: { exists: true } } : {}),
      ...(transforms.length ? { updateTransforms: transforms } : {}) };
  }
  const store = {
    doc(path: string): Ref {
      const ref: Ref = { path, get: async () => (await read([ref]))[0],
        update: async data => { await call('commit', { writes: [write(ref, data, 'update')] }); } };
      name(ref);
      return ref;
    },
    async runTransaction<T>(action: (tx: Transaction) => Promise<T>): Promise<T> {
      let retryTransaction: string | undefined;
      for (let attempt = 0; attempt < 4; attempt++) {
        const begun = await call('beginTransaction', { options: { readWrite: retryTransaction ? { retryTransaction } : {} } });
        if (typeof begun.transaction !== 'string' || !begun.transaction) throw new ProviderError('admin/missing-transaction');
        const transaction = begun.transaction, writes: Wire[] = [];
        const getAll = async (...refs: Ref[]) => {
          if (writes.length) throw new ProviderError('admin/read-after-write');
          return read(refs, transaction);
        };
        const tx: Transaction = {
          getAll, get: async ref => (await getAll(ref))[0],
          create: (ref, data) => { writes.push(write(ref, data, 'create')); },
          update: (ref, data) => { writes.push(write(ref, data, 'update')); },
          set: (ref, data, options) => { writes.push(write(ref, data, options?.merge ? 'merge' : 'set')); },
          delete: ref => { writes.push({ delete: name(ref) }); },
        };
        try {
          const result = await action(tx);
          await call('commit', { transaction, writes });
          return result;
        } catch (error) {
          await call('rollback', { transaction }).catch(() => undefined);
          // Never replay uncertain commit responses. The shared engines inspect
          // durable receipts before rollback or marking lifecycle retryable.
          if (!(error instanceof FirestoreFailure) || error.status !== 'ABORTED' || attempt === 3) throw error;
          retryTransaction = transaction;
          await new Promise(resolve => setTimeout(resolve, 20 * 2 ** attempt + Math.random() * 20));
        }
      }
      throw new ProviderError('admin/transaction-exhausted');
    },
  };
  return store;
}
