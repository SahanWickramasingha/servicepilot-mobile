import { FirebaseError } from "firebase/app";
import { useEffect, useState } from "react";

import {
  subscribeToReceivedSystemMessages,
  type ReceivedSystemMessage,
} from "../services/receivedMessageService";
import type { UserRecord } from "../types";

export function useReceivedSystemMessages(profile?: UserRecord | null) {
  const [state, setState] = useState<{
    data: ReceivedSystemMessage[];
    loading: boolean;
    error: string;
  }>({
    data: [],
    loading: true,
    error: "",
  });

  useEffect(() => {
    const userId = profile?.uid ?? profile?.id;
    const role = profile?.role;

    if (!userId || (role !== "dispatcher" && role !== "super_admin")) {
      setState({ data: [], loading: false, error: "" });
      return;
    }

    setState({ data: [], loading: true, error: "" });

    return subscribeToReceivedSystemMessages(
      { userId, role },
      (items) =>
        setState({
          data: items,
          loading: false,
          error: "",
        }),
      ({ error, queryType }) => {
        const code =
          error instanceof FirebaseError ? error.code : "unknown-error";
        const message =
          code === "permission-denied"
            ? "Permission denied while loading received messages."
            : code === "failed-precondition"
              ? "Received messages need a Firestore index for this query."
              : code === "unavailable"
                ? "Network error while loading received messages."
                : `Unable to load ${queryType.replace("-", " ")}.`;

        setState((current) => ({
          data: current.data,
          loading: false,
          error: message,
        }));
      }
    );
  }, [profile?.id, profile?.role, profile?.uid]);

  return state;
}
