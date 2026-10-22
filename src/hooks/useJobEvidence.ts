import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/src/firebase/config";
import { subscribeToJobEvidence, type JobEvidence } from "@/src/services/jobEvidence.service";
export function useJobEvidence(requestId: string) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ viewer: string | null; id: string; evidence: JobEvidence | null; confirmed: boolean; loading: boolean; error: string }>({ viewer: null, id: "", evidence: null, confirmed: false, loading: true, error: "" });
  useEffect(() => {
    let alive = true, generation = 0, stop = () => {};
    let deadline: ReturnType<typeof setTimeout> | undefined;
    const stopAuth = onAuthStateChanged(auth, (user) => {
      const version = ++generation; stop(); clearTimeout(deadline);
      const identity = { viewer: user?.uid ?? null, id: requestId };
      setState({ ...identity, evidence: null, confirmed: false, loading: !!user && !!requestId, error: user ? "" : "Please sign in to view service evidence." });
      if (!user || !requestId) return;
      const current = () => alive && generation === version && auth.currentUser?.uid === user.uid;
      deadline = setTimeout(() => { if (current()) setState({ ...identity, evidence: null, confirmed: false, loading: false, error: "Unable to confirm service evidence online. Check your connection and retry." }); }, 15000);
      stop = subscribeToJobEvidence(requestId, (evidence, confirmed) => {
        if (confirmed) clearTimeout(deadline);
        if (current()) setState({ ...identity, evidence, confirmed, loading: !confirmed && !evidence, error: "" });
      }, () => { if (current()) setState({ ...identity, evidence: null, confirmed: false, loading: false, error: "Service evidence is unavailable. Check your connection and retry." }); });
    });
    return () => { alive = false; generation++; clearTimeout(deadline); stop(); stopAuth(); };
  }, [requestId, attempt]);
  const current = state.viewer === (auth.currentUser?.uid ?? null) && state.id === requestId;
  return { ...(current ? state : { evidence: null, confirmed: false, loading: true, error: "" }), retry: () => setAttempt((value) => value + 1) };
}
