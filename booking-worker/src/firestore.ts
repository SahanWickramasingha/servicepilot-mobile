import type { BookingData, BookingQuery, BookingRef, BookingSnapshot, BookingStore, BookingTransaction, BookingValues } from '../../functions/src/domain/bookingSchedule';
import { UpstreamError } from './auth';

// Only the adapter produces these sentinels. User-supplied input never reaches
// an unvalidated write path; the shared engine constructs every mutation.
const serverTime = Symbol('serverTimestamp'), deletion = Symbol('deleteField');
class TimestampValue {
  constructor(readonly iso: string) {}
  toMillis() {
    const match = /^(.*?)(?:\.(\d+))?Z$/.exec(this.iso);
    if (!match) return NaN;
    return Date.parse(match[1] + 'Z') + Number(('0.' + (match[2] ?? '0'))) * 1000;
  }
}
export const values: BookingValues = {
  serverTimestamp: () => serverTime, deleteField: () => deletion,
  timestamp: (ms) => new TimestampValue(new Date(ms).toISOString()),
};
// Google wire values are heterogeneous; decoding never trusts scheduling fields.
type Wire = Record<string, any>;
export function encode(value: unknown): Wire {
  if (value instanceof TimestampValue) return { timestampValue: value.iso };
  if (value === null) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number' && Number.isFinite(value)) return Number.isSafeInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } };
  if (typeof value === 'object' && value) return { mapValue: { fields: fields(value as BookingData) } };
  throw new UpstreamError('booking/invalid-write');
}
const fields = (data: BookingData): Wire => Object.fromEntries(Object.entries(data).map(([key, value]) => [key, encode(value)]));
function decode(value: Wire): unknown {
  if ('timestampValue' in value) return new TimestampValue(value.timestampValue);
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) {
    const n = Number(value.integerValue);
    if (!Number.isSafeInteger(n)) throw new UpstreamError('booking/unsafe-integer');
    return n;
  }
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('booleanValue' in value) return value.booleanValue;
  if ('nullValue' in value) return null;
  if ('mapValue' in value) return dataOf(value.mapValue.fields);
  if ('arrayValue' in value) return (value.arrayValue.values ?? []).map(decode);
  // Non-scheduling fields such as GeoPoints/bytes/references remain opaque.
  // They are never rewritten; updateMask restricts job writes to engine fields.
  return value;
}
const dataOf = (raw: Wire = {}): BookingData => Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, decode(value)]));
class RestFailure extends UpstreamError {
  constructor(readonly status: string) { super('booking/firestore-' + status.toLowerCase().replace(/_/g, '-')); }
}
function query(collection: string, filters: unknown[] = [], limitCount = 501): BookingQuery {
  return { collection, filters, limitCount,
    where(field, op, value) { return query(collection, [...filters, { fieldFilter: { field: { fieldPath: field }, op: op === 'in' ? 'IN' : 'EQUAL', value: encode(value) } }], limitCount); },
    limit(n) { return query(collection, filters, n); } };
}
export function firestoreStore({ project, token, endpoint = 'https://firestore.googleapis.com/v1', deadline = Date.now() + 23_000 }:
  { project: string; token: () => Promise<string>; endpoint?: string; deadline?: number }): BookingStore & { ready(): Promise<void> } {
  const root = `projects/${project}/databases/(default)/documents`, base = `${endpoint}/${root}`;
  let calls = 0;
  async function call(suffix: string, body: unknown, cleanup = false): Promise<Wire> {
    const remaining = deadline - Date.now();
    if (++calls > 40 || (!cleanup && remaining < 100)) throw new UpstreamError('booking/transaction-deadline');
    const response = await fetch(base + suffix, { method: 'POST',
      headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      signal: AbortSignal.timeout(cleanup ? 1000 : Math.max(1, Math.min(6000, remaining))) });
    const data = await response.json() as Wire;
    if (!response.ok) throw new RestFailure(typeof data.error?.status === 'string' ? data.error.status : 'UNAVAILABLE');
    return data;
  }
  function snapshot(row: Wire): BookingSnapshot {
    const name = row.found?.name ?? row.missing;
    if (typeof name !== 'string' || !name.startsWith(root + '/')) throw new UpstreamError('booking/invalid-document');
    return { id: name.slice(name.lastIndexOf('/') + 1), data: () => row.found ? dataOf(row.found.fields) : undefined };
  }
  function write(ref: BookingRef, data: BookingData, update: boolean): Wire {
    // Custom Firebase UIDs can contain Unicode/punctuation. Preserve valid
    // existing accounts while restricting writes to one document in our three
    // collections; never treat an ID as a nested path.
    if (!/^(service_requests|booking_schedule_locks|notifications)\/[^/]{1,300}$/u.test(ref.path) ||
      /\/\.{1,2}$/.test(ref.path) || new TextEncoder().encode(ref.path.split('/')[1]).length > 1500) throw new UpstreamError('booking/invalid-write-path');
    const regular: BookingData = {}, transforms: Wire[] = [];
    for (const [key, value] of Object.entries(data)) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) throw new UpstreamError('booking/invalid-field');
      if (value === serverTime) transforms.push({ fieldPath: key, setToServerValue: 'REQUEST_TIME' });
      else if (value !== deletion) regular[key] = value;
    }
    return { update: { name: `${root}/${ref.path}`, fields: fields(regular) },
      ...(update ? { updateMask: { fieldPaths: Object.entries(data).filter(([, value]) => value !== serverTime).map(([key]) => key) }, currentDocument: { exists: true } } : {}),
      ...(transforms.length ? { updateTransforms: transforms } : {}) };
  }
  return {
    doc: (path) => ({ path }), collection: (path) => query(path),
    async ready() { await call(':batchGet', { documents: [`${root}/_runtime_health/booking`] }); },
    async runTransaction<T>(action: (tx: BookingTransaction) => Promise<T>): Promise<T> {
      let retryTransaction: string | undefined;
      for (let attempt = 0; attempt < 5; attempt++) {
        const begun = await call(':beginTransaction', { options: { readWrite: retryTransaction ? { retryTransaction } : {} } });
        if (typeof begun.transaction !== 'string' || !begun.transaction) throw new UpstreamError('booking/missing-transaction');
        const transaction = begun.transaction, writes: Wire[] = [];
        let commitStarted = false;
        const tx: BookingTransaction = {
          async getAll(...refs) {
            const rows = await call(':batchGet', { documents: refs.map((ref) => `${root}/${ref.path}`), transaction });
            if (!Array.isArray(rows)) throw new UpstreamError('booking/invalid-batch');
            const byName = new Map(rows.map((row) => [row.found?.name ?? row.missing, snapshot(row)]));
            return refs.map((ref) => { const doc = byName.get(`${root}/${ref.path}`); if (!doc) throw new UpstreamError('booking/missing-snapshot'); return doc; });
          },
          async get(q) {
            const rows = await call(':runQuery', { transaction, structuredQuery: { from: [{ collectionId: q.collection }],
              // The unchanged overlap engine reads only these four fields.
              // Bound memory even if unrelated job evidence is very large.
              select: { fields: ['technicianId', 'assignedTechnicianId', 'scheduledAt', 'scheduledEndAt'].map(fieldPath => ({ fieldPath })) },
              where: { compositeFilter: { op: 'AND', filters: q.filters } }, limit: q.limitCount } });
            if (!Array.isArray(rows)) throw new UpstreamError('booking/invalid-query');
            const docs = rows.filter((row) => row.document).map((row) => snapshot({ found: row.document })) as (BookingSnapshot & { data(): BookingData })[];
            return { docs, size: docs.length };
          },
          set(ref, data) { writes.push(write(ref, data, false)); },
          update(ref, data) { writes.push(write(ref, data, true)); },
        };
        try {
          const result = await action(tx);
          commitStarted = true;
          await call(':commit', { transaction, writes });
          return result;
        } catch (error) {
          await call(':rollback', { transaction }, true).catch(() => {});
          // Only a definite ABORTED is retried. Network/commit timeouts may
          // already be saved: return ambiguity and let the existing mobile
          // reconciliation read + same-action retry use domain idempotency.
          if (!(error instanceof RestFailure) || error.status !== 'ABORTED' || attempt === 4) {
            if (commitStarted && !(error instanceof RestFailure)) throw new UpstreamError('booking/commit-outcome-unknown');
            throw error;
          }
          retryTransaction = transaction;
          await new Promise((resolve) => setTimeout(resolve, 30 * 2 ** attempt + Math.random() * 30));
        }
      }
      throw new UpstreamError('booking/transaction-exhausted');
    },
  };
}
