import { FirebaseError } from "firebase/app";
import {
  collection,
  limit,
  documentId,
  orderBy,
  startAfter,
  onSnapshot,
  query,
  where,
  type QueryConstraint,
} from "firebase/firestore";
import { useEffect, useState } from "react";

import { db } from "../firebase/config";
import type { UserRecord } from "../types";
import { timestampMillis } from "../utils/format";
import { isReviewableTechnicianApplication } from "../../../functions/src/domain/technicianApplication";

type TechnicianStatus = "pending" | "approved" | "rejected";

type TechnicianUsersOptions = {
  reviewQueue?: boolean;
  paginated?: boolean;
  status?: TechnicianStatus;
  page: string;
  queryType: string;
};

type TechnicianUsersState = {
  retry: () => void;
  loadMore: () => void;
  firstPage: () => void;
  previousPage: () => void;
  pageNumber: number;
  hasPrevious: boolean;
  hasMore: boolean;
  data: UserRecord[];
  loading: boolean;
  error: string;
};

export function useTechnicianUsers({
  reviewQueue = false,
  paginated = reviewQueue,
  status,
  page,
  queryType,
}: TechnicianUsersOptions): TechnicianUsersState {
  const [attempt, setAttempt] = useState(0);
  const [cursor, setCursor] = useState<{ status?: TechnicianStatus; history: string[] }>();
  const [lastId, setLastId] = useState("");
  const history = cursor && cursor.status === status ? cursor.history : [];
  const after = history.at(-1);
  const [hasMore, setHasMore] = useState(false);
  const [state, setState] = useState<Pick<TechnicianUsersState, "data" | "loading" | "error">>({
    data: [],
    loading: true,
    error: "",
  });

  useEffect(() => {
    let active = true;
    setState({
      data: [],
      loading: true,
      error: "",
    });

    const constraints: QueryConstraint[] = [where("role", "==", "technician")];

    if (status) {
      constraints.push(where("technicianApprovalStatus", "==", status));
    }
    if (status === "pending") constraints.push(where("emailVerified", "==", true));
    if (paginated) constraints.push(orderBy(documentId()), ...(after ? [startAfter(after)] : []), limit(50));

    const technicianQuery = query(collection(db, "users"), ...constraints);

    const deadline = paginated ? setTimeout(() => { if (active) setState({ data: [], loading: false,
      error: "Unable to confirm technicians online. Check your connection and retry." }); }, 15000) : undefined;
    const stop = onSnapshot(
      technicianQuery,
      { includeMetadataChanges: true },
      (snapshot) => {
        if (!active || paginated && snapshot.metadata.fromCache) return;
        clearTimeout(deadline);
        setHasMore(paginated && snapshot.size === 50);
        setLastId(snapshot.docs.at(-1)?.id ?? "");
        const data = snapshot.docs
          .map(
            (item) =>
              ({
                id: item.id,
                ...item.data(),
              }) as UserRecord
          )
          .filter(user => status !== "pending" || isReviewableTechnicianApplication(user))
          .sort(
            (first, second) =>
              timestampMillis(second.createdAt) - timestampMillis(first.createdAt)
          );

        setState({
          data,
          loading: false,
          error: "",
        });
      },
      (error) => {
        if (!active) return;
        clearTimeout(deadline);
        if (import.meta.env.DEV) {
          const code =
            error instanceof FirebaseError ? error.code : "unknown-firestore-error";
          console.warn("Dispatcher Firestore query failed", {
            page,
            queryType,
            code,
          });
        }

        setState({
          data: [],
          loading: false,
          error:
            error instanceof FirebaseError && error.code === "permission-denied"
              ? "You do not have permission to view this data."
              : "Unable to load data. Please try again.",
        });
      }
    );
    return () => { active = false; clearTimeout(deadline); stop(); };
  }, [page, queryType, status, attempt, after, paginated]);

  return { ...state, retry: () => setAttempt(value => value + 1), hasMore,
    pageNumber: history.length + 1, hasPrevious: history.length > 0,
    loadMore: () => { if (lastId && hasMore && !state.loading && !state.error) setCursor({ status, history: [...history, lastId] }); },
    previousPage: () => setCursor({ status, history: history.slice(0, -1) }), firstPage: () => setCursor(undefined) };
}
