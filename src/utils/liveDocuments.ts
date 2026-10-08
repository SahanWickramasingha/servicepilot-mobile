type Document = { id: string; data: () => Record<string, unknown> };
type Snapshot = { docs: Document[]; docChanges?: () => { type: string; doc: Document }[] };

/** Preserve unchanged row identities and map only Firestore's changed documents. */
export function liveDocuments<T>(map: (id: string, data: Record<string, unknown>) => T) {
  const values = new Map<string, T>();
  return (snapshot: Snapshot): T[] => {
    if (!snapshot.docChanges) {
      values.clear();
      for (const doc of snapshot.docs) values.set(doc.id, map(doc.id, doc.data()));
    } else {
      for (const change of snapshot.docChanges()) {
        if (change.type === "removed") values.delete(change.doc.id);
        else values.set(change.doc.id, map(change.doc.id, change.doc.data()));
      }
    }
    return snapshot.docs.map((doc) => values.get(doc.id)!);
  };
}
