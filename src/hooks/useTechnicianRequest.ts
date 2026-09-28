import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";

import {
  ServiceRequest,
  subscribeToServiceRequest,
} from "@/src/services/request.service";
import { auth } from "@/src/firebase/config";

export function useTechnicianRequest() {
  const params = useLocalSearchParams<{ id?: string }>();
  const requestId = String(params.id ?? "");
  const [request, setRequest] = useState<ServiceRequest | null>(null);
  const [loading, setLoading] = useState(!!requestId);
  const [errorMessage, setErrorMessage] = useState(
    requestId ? "" : "No service request was selected."
  );

  useEffect(() => {
    if (!requestId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMessage("");

    const unsubscribe = subscribeToServiceRequest(
      requestId,
      (nextRequest) => {
        const uid = auth.currentUser?.uid;

        if (!nextRequest) {
          setRequest(null);
          setErrorMessage("This service request was not found.");
        } else if (uid && nextRequest.technicianId !== uid) {
          setRequest(null);
          setErrorMessage("This service request is not assigned to you.");
        } else {
          setRequest(nextRequest);
        }

        setLoading(false);
      },
      (error) => {
        console.error("Technician request subscription error:", error);
        setRequest(null);
        setErrorMessage("Unable to load this service request.");
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [requestId]);

  return {
    requestId,
    request,
    loading,
    errorMessage,
  };
}
