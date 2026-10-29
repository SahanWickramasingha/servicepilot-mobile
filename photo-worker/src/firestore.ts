import { serviceAccessToken } from "./auth";
import { PhotoError, type Data, type Env, type Store, type PhotoRecord } from "./types";

function encode(value: any): any {
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (value === null) return { nullValue: null };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } };
  return { mapValue: { fields: fields(value) } };
}
const fields = (data: Data): Data => Object.fromEntries(Object.entries(data).map(([key, value]) => [key, encode(value)]));
function decode(value: any): any {
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("timestampValue" in value) return new Date(value.timestampValue);
  if ("arrayValue" in value) return (value.arrayValue.values ?? []).map(decode);
  if ("mapValue" in value) return dataOf(value.mapValue.fields);
  return null;
}
const dataOf = (raw: Data = {}): Data => Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, decode(value)]));
/** Caller ID tokens are used for authorization reads (Rules apply). The scoped
 * OAuth identity is used only for trusted photo metadata and atomic cleanup. */
export function firestoreStore(env: Env): Store {
  const root = `projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents`;
  const url = `https://firestore.googleapis.com/v1/${root}`;
  const fullName = (path: string) => `${root}/${path}`;
  let requests = 0;
  async function call(suffix: string, method: string, body?: unknown, token?: string) {
    // Leave headroom for Auth/OAuth and R2 operations under Workers Free's
    // subrequest budget. Conflict/outage retries fail closed before overrunning.
    if (++requests > 36) throw new PhotoError(503, "temporarily-unavailable");
    const response = await fetch(url + suffix, { method, headers: { Authorization: `Bearer ${token ?? await serviceAccessToken(env)}`, "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(8000) });
    if (response.status === 404) return null;
    if (!response.ok) throw new PhotoError(response.status === 409 ? 409 : response.status === 403 ? 403 : 503,
      response.status === 409 ? "conflict" : response.status === 403 ? "access-denied" : "temporarily-unavailable");
    return response.json() as Promise<any>;
  }
  return {
    async expired(cursor) {
      const query = { from: [{ collectionId: "photo_objects" }],
        where: { fieldFilter: { field: { fieldPath: "expiresAt" }, op: "LESS_THAN_OR_EQUAL", value: { timestampValue: new Date().toISOString() } } },
        orderBy: [{ field: { fieldPath: "expiresAt" }, direction: "ASCENDING" }, { field: { fieldPath: "__name__" }, direction: "ASCENDING" }], limit: 3,
        ...(cursor ? { startAt: { before: false, values: [{ timestampValue: cursor.time }, { referenceValue: fullName(`photo_objects/${cursor.id}`) }] } } : {}) };
      const result = await call(":runQuery", "POST", { structuredQuery: query });
      const records = (result ?? []).filter((row: Data) => row.document).map((row: Data) => dataOf(row.document.fields) as PhotoRecord);
      const last = records.at(-1);
      return { records, ...(records.length === 3 && last ? { cursor: { time: last.expiresAt.toISOString(), id: last.id } } : {}) };
    },
    async get(path, callerToken) {
      const result = await call("/" + path.split("/").map(encodeURIComponent).join("/"), "GET", undefined, callerToken);
      return result ? dataOf(result.fields) : null;
    },
    async atomic(paths, change) {
      for (let attempt = 0; attempt < 3; attempt++) {
        const started = await call(":beginTransaction", "POST", { options: { readWrite: {} } });
        if (!started?.transaction) throw new PhotoError(503, "temporarily-unavailable");
        try {
          const docs = await call(":batchGet", "POST", { documents: paths.map(fullName), transaction: started.transaction });
          const rows = new Map<string, Data | null>();
          for (const item of docs) {
            const name = item.found?.name ?? item.missing;
            rows.set(name.slice(root.length + 1), item.found ? dataOf(item.found.fields) : null);
          }
          const result = change(rows);
          // All trusted mutations are restricted to the photo_objects collection.
          const writes = Object.entries(result.writes).map(([path, data]) => {
            if (!/^photo_objects\/[a-f0-9]{64}$/.test(path)) throw new PhotoError(500, "invalid-server-write");
            return { update: { name: fullName(path), fields: fields(data) } };
          });
          await call(":commit", "POST", { transaction: started.transaction, writes });
          return result.result;
        } catch (cause) {
          await call(":rollback", "POST", { transaction: started.transaction }).catch(() => {});
          if (!(cause instanceof PhotoError) || cause.status !== 409 || attempt === 2) throw cause;
        }
      }
      throw new PhotoError(409, "conflict");
    },
  };
}
