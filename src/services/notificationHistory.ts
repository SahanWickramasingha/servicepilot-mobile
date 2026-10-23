import { collection, doc, documentId, getDocFromServer, getDocsFromServer, limit, onSnapshot, orderBy,
  query, serverTimestamp, startAfter, where, writeBatch, type DocumentData, type QueryDocumentSnapshot } from "firebase/firestore";
import { auth, db } from "@/src/firebase/config";
import type { UserRole } from "./user.service";
import type { NotificationCenterItem, NotificationCenterStatus, NotificationQueryType } from "./notification.service";

export const NOTIFICATION_PAGE_SIZE = 20;
type Row = { id: string; data: DocumentData; cursor: QueryDocumentSnapshot<DocumentData> };
type Source = { key: string; kind: NotificationQueryType; collection: string; filters: ReturnType<typeof where>[];
  pages: Map<number, Map<string, Row>>; retained: Map<string, Row>; cursor?: QueryDocumentSnapshot<DocumentData>; more: boolean; pagesLoaded: number };

/** Three recent queries plus receipt queries scoped only to loaded system IDs.
 * History pages stay live. Rows evicted across page boundaries are individually
 * verified before retention, so a new arrival cannot silently discard history.
 */
export function connectNotificationHistory(userId: string, role: UserRole,
  mapPersonal: (id: string, data: DocumentData) => NotificationCenterItem,
  mapSystem: (id: string, data: DocumentData) => Omit<NotificationCenterItem, "source" | "read">,
  next: (items: NotificationCenterItem[], status: NotificationCenterStatus) => void,
  error: (cause: Error, kind: NotificationQueryType) => void) {
  const viewer = auth.currentUser;
  let alive = true, version = 0, total: number | undefined, totalBusy = false, markBusy = false;
  let historyBusy = false, operationError = "";
  let windowChanged = false;
  const pending = new Set<string>(), failures = new Map<string, NotificationQueryType>(), stops: (() => void)[] = [];
  const pendingPages = new Set<() => void>();
  const receipts = new Map<string, DocumentData>(), receiptStops = new Map<string, () => void>();
  const sources: Source[] = [
    { key: "personal", kind: "personal-notifications" as const, collection: "notifications", filters: [where("userId", "==", userId)] },
    ...["active", "sent"].map((status) => ({ key: status, kind: "system-messages" as const, collection: "system_messages",
      filters: [where("audienceRoles", "array-contains", role), where("status", "==", status)] })),
  ].map((source) => ({ ...source, pages: new Map(), retained: new Map(), more: true, pagesLoaded: 0 }));
  const current = () => alive && auth.currentUser === viewer && viewer?.uid === userId;
  const requireCurrent = () => { if (!current()) throw new Error("Account changed. Reopen notifications."); };
  const changed = () => { version++; total = undefined; };
  const rowsFor = (source: Source) => {
    const rows = new Map(source.retained);
    for (const page of source.pages.values()) for (const [id, row] of page) rows.set(id, row);
    return rows;
  };
  const emit = () => {
    if (!current()) return;
    const merged = new Map<string, NotificationCenterItem>();
    for (const source of sources) for (const row of rowsFor(source).values()) {
      const item = source.key === "personal" ? mapPersonal(row.id, row.data) : {
        ...mapSystem(row.id, row.data), source: "system" as const, read: receipts.has(row.id), readAt: receipts.get(row.id)?.readAt,
      } as NotificationCenterItem;
      merged.set(`${item.source}:${item.id}`, item);
    }
    const items = [...merged.values()].sort((a, b) => {
      const time = (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0);
      const first = `${a.source}:${a.id}`, second = `${b.source}:${b.id}`;
      return time || (first === second ? 0 : first < second ? 1 : -1);
    });
    next(items, { loading: [...pending].some((key) => !key.startsWith("history:")), errors: [...new Set(failures.values())],
      hasMore: sources.some((source) => source.more), historyLoading: historyBusy, operationError,
      unreadTotal: total, totalBusy, markAllBusy: markBusy, windowChanged });
  };
  const fail = (key: string, kind: NotificationQueryType, cause: Error) => {
    if (!current()) return;
    pending.delete(key); failures.set(key, kind); error(cause, kind); emit();
  };
  const syncReceipts = () => {
    const ids = [...new Set(sources.slice(1).flatMap((source) => [...rowsFor(source).keys()]))].sort();
    const keys = new Set<string>();
    for (let offset = 0; offset < ids.length; offset += NOTIFICATION_PAGE_SIZE) {
      const group = ids.slice(offset, offset + NOTIFICATION_PAGE_SIZE), key = JSON.stringify(group); keys.add(key);
      if (receiptStops.has(key)) continue;
      const stateKey = `receipt:${key}`; pending.add(stateKey);
      let active = true;
      const stop = onSnapshot(query(collection(db, "message_reads"), where("userId", "==", userId),
        where("messageId", "in", group), limit(NOTIFICATION_PAGE_SIZE)), (snapshot) => {
        if (!current() || !active) return;
        for (const id of group) receipts.delete(id);
        for (const receipt of snapshot.docs) receipts.set(String(receipt.data().messageId), receipt.data());
        changed(); pending.delete(stateKey); failures.delete(stateKey); emit();
      }, (cause) => { if (active) fail(stateKey, "message-reads", cause); });
      receiptStops.set(key, () => { active = false; stop(); });
    }
    for (const [key, stop] of receiptStops) if (!keys.has(key)) {
      stop(); receiptStops.delete(key); pending.delete(`receipt:${key}`); failures.delete(`receipt:${key}`);
    }
    for (const id of receipts.keys()) if (!ids.includes(id)) receipts.delete(id);
  };
  const pageQuery = (source: Source, cursor?: QueryDocumentSnapshot<DocumentData>) => query(collection(db, source.collection),
    ...source.filters, orderBy("createdAt", "desc"), orderBy(documentId(), "desc"),
    ...(cursor ? [startAfter(cursor)] : []), limit(NOTIFICATION_PAGE_SIZE));
  const attach = (source: Source, cursor?: QueryDocumentSnapshot<DocumentData>) => new Promise<void>((resolve) => {
    const finish = () => { pendingPages.delete(finish); resolve(); };
    pendingPages.add(finish);
    const pageIndex = source.pagesLoaded++, key = pageIndex ? `history:${source.key}:${pageIndex}` : source.key;
    pending.add(key); let first = true, generation = 0;
    stops.push(onSnapshot(pageQuery(source, cursor), (snapshot) => {
      if (!current()) return;
      const event = ++generation, previous = source.pages.get(pageIndex) ?? new Map<string, Row>();
      const rows = new Map(snapshot.docs.map((item) => [item.id, { id: item.id, data: item.data(), cursor: item }]));
      if (pageIndex === 0 && source.pagesLoaded > 1 && previous.size === NOTIFICATION_PAGE_SIZE &&
        snapshot.size === NOTIFICATION_PAGE_SIZE && ![...rows.keys()].some((id) => previous.has(id))) windowChanged = true;
      source.pages.set(pageIndex, rows);
      if (pageIndex === source.pagesLoaded - 1) { source.cursor = snapshot.docs.at(-1) ?? cursor; source.more = snapshot.size === NOTIFICATION_PAGE_SIZE; }
      changed(); pending.delete(key); failures.delete(key);
      // A limit-query removal can be a boundary shift OR deletion/withdrawal.
      for (const [id, old] of previous) if (!rows.has(id)) {
        if (source.pagesLoaded === 1) continue; // The next page starts at the current live boundary.
        if (source.retained.size >= NOTIFICATION_PAGE_SIZE * source.pagesLoaded) { windowChanged = true; continue; }
        source.retained.set(id, old);
        void getDocFromServer(doc(db, source.collection, id)).then((saved) => {
          if (!current() || event !== generation) return;
          const data = saved.data();
          const eligible = data && (source.key === "personal" ? data.userId === userId :
            data.status === source.key && Array.isArray(data.audienceRoles) && data.audienceRoles.includes(role));
          if (eligible) source.retained.set(id, { ...old, data }); else source.retained.delete(id);
          changed(); syncReceipts(); emit();
        }, (cause) => { if (current() && event === generation) {
          if ((cause as { code?: string }).code === "permission-denied") source.retained.delete(id);
          else fail(key, source.kind, cause);
          syncReceipts(); emit();
        } });
      }
      for (const id of rows.keys()) source.retained.delete(id);
      syncReceipts(); emit(); if (first) { first = false; finish(); }
    }, (cause) => {
      generation++;
      if (current() && (cause as { code?: string }).code === "permission-denied") { source.pages.delete(pageIndex); source.retained.clear(); changed(); syncReceipts(); }
      fail(key, source.kind, cause); if (first) { first = false; finish(); }
    }));
  });
  // Explicit all-history operations use bounded pages, never the loaded subset.
  // There is no scalable aggregate join for audience messages and per-user reads
  // in this schema. Totals are checked on demand and invalidated by live changes.
  const sweep = async (mark: boolean) => {
    let count = 0;
    const seen = new Set<string>();
    for (const source of sources) {
      let cursor: QueryDocumentSnapshot<DocumentData> | undefined;
      do {
        requireCurrent(); const page = await getDocsFromServer(pageQuery(source, cursor)); requireCurrent();
        let batch = writeBatch(db), writes = 0;
        const readIds = new Set<string>();
        if (source.key !== "personal" && page.size) {
          const saved = await getDocsFromServer(query(collection(db, "message_reads"), where("userId", "==", userId),
            where("messageId", "in", page.docs.map((item) => item.id)), limit(NOTIFICATION_PAGE_SIZE)));
          requireCurrent(); saved.docs.forEach((item) => readIds.add(String(item.data().messageId)));
        }
        for (const item of page.docs) {
          const key = `${source.collection}:${item.id}`;
          if (seen.has(key)) continue;
          seen.add(key);
          requireCurrent(); const data = item.data();
          requireCurrent(); const unread = source.key === "personal" ? data.read !== true : !readIds.has(item.id);
          if (!unread) continue;
          count++;
          if (mark) {
            if (source.key === "personal") batch.update(item.ref, { read: true, updatedAt: serverTimestamp() });
            else batch.set(doc(db, "message_reads", `${userId}_${item.id}`), { userId, messageId: item.id, readAt: serverTimestamp() }, { merge: true });
            writes++;
            // Keep cross-document Rules work bounded for each receipt commit.
            if (writes === 5) { requireCurrent(); await batch.commit(); requireCurrent(); batch = writeBatch(db); writes = 0; }
          }
        }
        requireCurrent(); if (writes) await batch.commit(); requireCurrent();
        cursor = page.docs.at(-1); if (page.size < NOTIFICATION_PAGE_SIZE) break;
      } while (cursor);
    }
    return count;
  };
  const operate = async (mark: boolean) => {
    if (totalBusy || markBusy) return;
    requireCurrent(); const initialVersion = version; operationError = "";
    if (mark) markBusy = true; else totalBusy = true; emit();
    try {
      const count = await sweep(mark); requireCurrent();
      if (!mark && version === initialVersion) total = count;
      else if (!mark) operationError = "Notifications changed during the count. Check total again.";
    } catch (cause) {
      if (current()) operationError = mark ? "Not all read updates were confirmed. Reconnect and retry Mark all read." : "Unread total unavailable. Reconnect and retry.";
      throw cause;
    } finally { if (current()) { totalBusy = false; markBusy = false; emit(); } }
  };
  sources.forEach((source) => { void attach(source); });
  return {
    stop: () => { alive = false; stops.forEach((stop) => stop()); receiptStops.forEach((stop) => stop()); pendingPages.forEach((finish) => finish()); receipts.clear(); sources.forEach((source) => { source.pages.clear(); source.retained.clear(); }); },
    loadMore: async () => {
      if (historyBusy || windowChanged) return;
      requireCurrent(); historyBusy = true; emit();
      try { await Promise.all(sources.filter((source) => source.more && source.cursor).map((source) => attach(source, source.cursor))); }
      finally { if (current()) { historyBusy = false; emit(); } }
    },
    refreshTotal: () => operate(false), markAll: () => operate(true),
  };
}
