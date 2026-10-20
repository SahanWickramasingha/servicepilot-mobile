import { useEffect, useState } from "react";
import { useAdminAuth } from "../auth/AdminAuthContext";
import { auth } from "../firebase/config";
import { subscribeToAdminTechnicianRating } from "../services/technicianRatingService";
import { getTechnicianRatingDisplay, type TechnicianRatingLoadState } from "../../../src/utils/technicianRating";

export function TechnicianRating({ technicianId }: { technicianId: string }) {
  const { firebaseUser } = useAdminAuth();
  const viewerUid = firebaseUser?.uid ?? null;
  const [state, setState] = useState<TechnicianRatingLoadState & { viewerUid: string | null; technicianId: string }>({
    status: "loading", summary: null, errorMessage: "", viewerUid: null, technicianId: "",
  });
  useEffect(() => {
    if (!viewerUid) return;
    let active = true;
    const current = () => active && auth.currentUser?.uid === viewerUid;
    const stop = subscribeToAdminTechnicianRating(technicianId, (summary) => {
      if (current()) setState({ status: "ready", summary, errorMessage: "", viewerUid, technicianId });
    }, (cause) => {
      if (current()) setState({ status: "error", summary: null, viewerUid, technicianId,
        errorMessage: (cause as { code?: string }).code === "permission-denied" ? "Ratings unavailable: permission denied." : "Unable to load ratings. Please try again." });
    });
    return () => { active = false; stop(); };
  }, [technicianId, viewerUid]);
  const display = getTechnicianRatingDisplay(state.viewerUid === viewerUid && state.technicianId === technicianId ? state : {
    status: "loading", summary: null, errorMessage: "",
  });
  return <span role={state.status === "error" ? "alert" : undefined} aria-live="polite">{display.label}</span>;
}
