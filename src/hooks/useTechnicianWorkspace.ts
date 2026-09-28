import { onAuthStateChanged } from "firebase/auth";
import { useEffect, useState } from "react";

import { auth } from "@/src/firebase/config";
import {
  ServiceRequest,
  subscribeToTechnicianRequests,
} from "@/src/services/request.service";
import {
  getMobileAccessDecision,
  subscribeToUserProfile,
  UserProfile,
} from "@/src/services/user.service";

type TechnicianWorkspaceState = {
  uid: string | null;
  profile: UserProfile | null;
  requests: ServiceRequest[];
  loading: boolean;
  errorMessage: string;
};

export function useTechnicianWorkspace(): TechnicianWorkspaceState {
  const [uid, setUid] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [authLoading, setAuthLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(true);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let unsubscribeProfile: (() => void) | undefined;
    let unsubscribeRequests: (() => void) | undefined;

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      unsubscribeProfile?.();
      unsubscribeRequests?.();

      setProfile(null);
      setRequests([]);
      setErrorMessage("");
      setAuthLoading(false);

      if (!user) {
        setUid(null);
        setProfileLoading(false);
        setRequestsLoading(false);
        setErrorMessage("Please sign in to view your technician workspace.");
        return;
      }

      setUid(user.uid);
      setProfileLoading(true);
      setRequestsLoading(true);

      unsubscribeProfile = subscribeToUserProfile(
        user.uid,
        (nextProfile) => {
          setProfileLoading(false);

          if (!nextProfile) {
            setProfile(null);
            setErrorMessage("Technician profile was not found.");
            return;
          }

          const accessDecision = getMobileAccessDecision(nextProfile);

          if (
            nextProfile.role !== "technician" ||
            !accessDecision.allowed
          ) {
            setProfile(null);
            setErrorMessage(
              accessDecision.message ||
                "This technician account is not approved for dashboard access."
            );
            return;
          }

          setProfile(nextProfile);
        },
        (error) => {
          console.error("Technician profile subscription error:", error);
          setProfileLoading(false);
          setErrorMessage("Unable to load technician profile.");
        }
      );

      unsubscribeRequests = subscribeToTechnicianRequests(
        user.uid,
        (nextRequests) => {
          setRequests(nextRequests);
          setRequestsLoading(false);
        },
        (error) => {
          console.error("Technician requests subscription error:", error);
          setRequestsLoading(false);
          setErrorMessage("Unable to load technician jobs.");
        }
      );
    });

    return () => {
      unsubscribeProfile?.();
      unsubscribeRequests?.();
      unsubscribeAuth();
    };
  }, []);

  return {
    uid,
    profile,
    requests,
    loading: authLoading || profileLoading || requestsLoading,
    errorMessage,
  };
}
