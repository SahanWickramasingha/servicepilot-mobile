import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { subscribeToUserProfile, UserProfile } from "@/src/services/user.service";

import {
  ServiceRequest,
  subscribeToServiceRequest,
} from "@/src/services/request.service";
import { auth } from "@/src/firebase/config";

export function useTechnicianRequest() {
  const params = useLocalSearchParams<{ id?: string }>();
  const requestId = String(params.id ?? "");
  const [request, setRequest] = useState<ServiceRequest | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(!!requestId);
  const [errorMessage, setErrorMessage] = useState(
    requestId ? "" : "No service request was selected."
  );

  useEffect(() => {
    let stopRequest: (() => void) | undefined, stopProfile: (() => void) | undefined;
    let generation = 0;
    const stopAuth = onAuthStateChanged(auth, (user) => {
      stopRequest?.(); stopProfile?.();
      const version = ++generation;
      const isCurrent = () => version === generation && auth.currentUser?.uid === user?.uid;
      setRequest(null); setProfile(null); setLoading(true); setErrorMessage("");
      if (!requestId || !user) {
        setErrorMessage(user ? "No service request was selected." : "Please sign in to view this job.");
        setLoading(false); return;
      }
      // A failed availability read blocks acceptance only; existing jobs stay open.
      stopProfile = subscribeToUserProfile(user.uid, (item) => {
        if (isCurrent()) setProfile(item?.role === "technician" ? item : null);
      }, () => { if (isCurrent()) setProfile(null); });
      stopRequest = subscribeToServiceRequest(
        requestId,
        (nextRequest) => {
          if (!isCurrent()) return;
          const uid = user.uid;

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
          if (!isCurrent()) return;
          console.error("Technician request subscription error:", error);
          setRequest(null);
          setErrorMessage("Unable to load this service request.");
          setLoading(false);
        }
      );
    });
    return () => { generation++; stopRequest?.(); stopProfile?.(); stopAuth(); };
  }, [requestId]);

  return {
    requestId,
    request,
    profile,
    loading,
    errorMessage,
  };
}
