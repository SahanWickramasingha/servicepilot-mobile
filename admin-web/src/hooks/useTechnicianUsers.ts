import { FirebaseError } from "firebase/app";
import {
  collection,
  onSnapshot,
  query,
  where,
  type QueryConstraint,
} from "firebase/firestore";
import { useEffect, useState } from "react";

import { db } from "../firebase/config";
import type { UserRecord } from "../types";
import { timestampMillis } from "../utils/format";

type TechnicianStatus = "pending" | "approved" | "rejected";

type TechnicianUsersOptions = {
  status?: TechnicianStatus;
  page: string;
  queryType: string;
};

type TechnicianUsersState = {
  data: UserRecord[];
  loading: boolean;
  error: string;
};

export function useTechnicianUsers({
  status,
  page,
  queryType,
}: TechnicianUsersOptions): TechnicianUsersState {
  const [state, setState] = useState<TechnicianUsersState>({
    data: [],
    loading: true,
    error: "",
  });

  useEffect(() => {
    setState((current) => ({
      ...current,
      loading: true,
      error: "",
    }));

    const constraints: QueryConstraint[] = [where("role", "==", "technician")];

    if (status) {
      constraints.push(where("technicianApprovalStatus", "==", status));
    }

    const technicianQuery = query(collection(db, "users"), ...constraints);

    return onSnapshot(
      technicianQuery,
      (snapshot) => {
        const data = snapshot.docs
          .map(
            (item) =>
              ({
                id: item.id,
                ...item.data(),
              }) as UserRecord
          )
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
  }, [page, queryType, status]);

  return state;
}
