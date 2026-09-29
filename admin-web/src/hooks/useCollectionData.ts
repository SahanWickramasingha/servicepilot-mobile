import { collection, onSnapshot } from "firebase/firestore";
import { useEffect, useState } from "react";

import { db } from "../firebase/config";
import { timestampMillis } from "../utils/format";

type CollectionState<T> = {
  data: T[];
  loading: boolean;
  error: string;
};

export function useCollectionData<T extends { id: string }>(
  collectionName: string,
  sortField = "createdAt"
): CollectionState<T> {
  const [state, setState] = useState<CollectionState<T>>({
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

    return onSnapshot(
      collection(db, collectionName),
      (snapshot) => {
        const data = snapshot.docs
          .map(
            (item) =>
              ({
                id: item.id,
                ...item.data(),
              }) as T
          )
          .sort(
            (first, second) =>
              timestampMillis((second as Record<string, unknown>)[sortField]) -
              timestampMillis((first as Record<string, unknown>)[sortField])
          );

        setState({
          data,
          loading: false,
          error: "",
        });
      },
      (error) => {
        setState({
          data: [],
          loading: false,
          error:
            error.code === "permission-denied"
              ? "You do not have permission to view this data."
              : "Unable to load data. Please try again.",
        });
      }
    );
  }, [collectionName, sortField]);

  return state;
}
