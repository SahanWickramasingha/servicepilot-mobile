import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { collection, deleteDoc, doc, getDocFromServer, limit, onSnapshot, query, runTransaction, serverTimestamp, setDoc } from "firebase/firestore";
import { Modal, Pressable, Text, TextInput, View } from "react-native";
import { auth, db } from "@/src/firebase/config";
type SafetyState = { blocked: Set<string>; ready: boolean; error: string };
const SafetyContext = createContext<SafetyState>({ blocked: new Set(), ready: false, error: "" });
export const useSafety = () => useContext(SafetyContext);
/** One bounded single-document listener per loaded map profile (maximum 24). */
export function useHiddenProfiles(ids: string[]) {
  const identity = ids.join('|');
  const [state, setState] = useState<{ hidden: Set<string>; ready: boolean }>({ hidden: new Set(), ready: false });
  useEffect(() => {
    let active = true; const rows = new Map<string, boolean>();
    const values = identity ? identity.split('|') : [];
    setState({ hidden: new Set(), ready: values.length === 0 });
    const emit = (id: string, hidden: boolean) => {
      if (!active) return; rows.set(id, hidden);
      setState({ hidden: new Set([...rows].filter(([, value]) => value).map(([id]) => id)), ready: rows.size === values.length });
    };
    const stops = values.map(id => onSnapshot(doc(db, 'content_restrictions', `profile_${id}`), saved => emit(id, saved.data()?.hidden === true), () => emit(id, true)));
    return () => { active = false; stops.forEach(stop => stop()); };
  }, [identity]);
  return state;
}
export function SafetyProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SafetyState>({ blocked: new Set(), ready: false, error: "" });
  useEffect(() => {
    let stop = () => {};
    const unsubscribe = onAuthStateChanged(auth, user => {
      stop(); setState({ blocked: new Set(), ready: !user, error: "" });
      if (user) {
        let stopBlocks = () => {}, started = false;
        // Auth exists before the registration profile. Wait for the authoritative
        // profile instead of permanently failing the first block-list listener.
        const stopProfile = onSnapshot(doc(db, "users", user.uid), { includeMetadataChanges: true }, profile => {
          if (auth.currentUser?.uid !== user.uid || profile.metadata.fromCache) return;
          if (!profile.exists()) { setState({ blocked: new Set(), ready: false, error: "" }); return; }
          if (started) return;
          started = true;
          stopBlocks = onSnapshot(query(collection(db, "user_blocks", user.uid, "blocked"), limit(200)), snapshot => {
            if (auth.currentUser?.uid === user.uid) setState({ blocked: new Set(snapshot.docs.map(item => item.id)), ready: true, error: "" });
          }, () => { started = false; if (auth.currentUser?.uid === user.uid) setState({ blocked: new Set(), ready: false, error: "Unable to load blocked users. Retry by reopening the app." }); });
        }, () => { if (auth.currentUser?.uid === user.uid) setState({ blocked: new Set(), ready: false, error: "Unable to verify your profile. Reopen the app to retry." }); });
        stop = () => { stopBlocks(); stopProfile(); };
      }
    });
    return () => { stop(); unsubscribe(); };
  }, []);
  return <SafetyContext.Provider value={state}>{children}</SafetyContext.Provider>;
}
export function SafetyContent({ target, children, kind = "profile", contentId = target }: { target: string; children: ReactNode; kind?: "profile" | "review"; contentId?: string }) {
  const safety = useSafety();
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    setHidden(false);
    if (!auth.currentUser || !contentId || !safety.ready) return;
    return onSnapshot(doc(db, "content_restrictions", `${kind}_${contentId}`), saved => setHidden(saved.data()?.hidden === true), () => setHidden(true));
  }, [kind, contentId, safety.ready]);
  if (hidden) return <Text style={{ color: "#CBD5E1", padding: 12 }}>Content unavailable.</Text>;
  if (auth.currentUser && !safety.ready) return <Text style={{ color: "#CBD5E1", padding: 12 }}>{safety.error || "Checking blocked users…"}</Text>;
  if (safety.blocked.has(target)) return <View style={{ padding: 16, gap: 8 }}><Text style={{ color: "#CBD5E1" }}>Content from this blocked user is hidden. Existing job history is retained.</Text><SafetyActions target={target} kind="profile" contentId={target} /></View>;
  return <>{children}</>;
}
export function SafetyActions({ target, kind, contentId }: { target: string; kind: "profile" | "review" | "job"; contentId: string }) {
  const safety = useSafety();
  const [reporting, setReporting] = useState(false), [reason, setReason] = useState(""), [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  const [reportId, setReportId] = useState("");
  const submitting = useRef(false);
  const uid = auth.currentUser?.uid;
  useEffect(() => { setReporting(false); setReason(""); setReportId(""); setMessage(""); }, [uid, target, kind, contentId]);
  if (!uid || (!target && kind !== "review") || uid === target) return null;
  const toggle = async () => {
    setBusy(true); setMessage("");
    try {
      if (!safety.ready) throw new Error("Wait for your block list to load.");
      if (!safety.blocked.has(target) && safety.blocked.size >= 200) throw new Error("Your block list is full. Contact support to manage it.");
      const ref = doc(db, "user_blocks", uid, "blocked", target);
      if (safety.blocked.has(target)) await deleteDoc(ref);
      else await runTransaction(db, async tx => { const saved = await tx.get(ref); if (auth.currentUser?.uid !== uid) throw new Error("Account changed."); if (!saved.exists()) tx.set(ref, { createdAt: serverTimestamp() }); });
      setMessage("Block preference saved. Existing jobs were not cancelled or deleted.");
    } catch { setMessage("Unable to save block preference. Check your connection or contact support."); }
    finally { setBusy(false); }
  };
  const submit = async () => {
    if (submitting.current) return;
    if (reason.trim().length < 10) { setMessage("Describe the concern in at least 10 characters."); return; }
    submitting.current = true; setBusy(true); setMessage("");
    const id = reportId || doc(collection(db, "content_reports")).id; setReportId(id);
    const data = { reporterId: uid, targetUserId: target, contentKind: kind, contentId, reason: reason.trim(), status: "open", createdAt: serverTimestamp() };
    try {
      if (auth.currentUser?.uid !== uid) throw new Error("Account changed.");
      const ref = doc(db, "content_reports", id);
      try { await setDoc(ref, data); }
      catch (cause) { const saved = (await getDocFromServer(ref)).data(); if (!saved || !Object.entries(data).filter(([key]) => key !== "createdAt" && key !== "status").every(([key, value]) => saved[key] === value)) throw cause; }
      if (auth.currentUser?.uid === uid) { setReporting(false); setReason(""); setReportId(""); setMessage("Report saved for authorized moderation review."); }
    } catch { setMessage("Unable to confirm the report. Check your connection and retry."); }
    finally { submitting.current = false; setBusy(false); }
  };
  return <View style={{ gap: 4, paddingVertical: 8 }}>
    <View style={{ flexDirection: "row", gap: 18 }}>
      <Pressable accessibilityRole="button" disabled={busy} style={{ minHeight: 44, justifyContent: "center" }} onPress={() => setReporting(true)}><Text style={{ color: "#60A5FA" }}>Report {kind === "review" ? "review / user" : "user / content"}</Text></Pressable>
      {!!target && <Pressable accessibilityRole="button" disabled={busy} style={{ minHeight: 44, justifyContent: "center" }} onPress={() => { void toggle(); }}><Text style={{ color: "#60A5FA" }}>{safety.blocked.has(target) ? "Unblock user" : "Block user"}</Text></Pressable>}
    </View>
    {!!message && <Text accessibilityRole="alert" style={{ color: "#CBD5E1" }}>{message}</Text>}
    <Modal visible={reporting} animationType="slide" onRequestClose={() => { if (!busy) setReporting(false); }}>
      <View style={{ flex: 1, padding: 24, paddingTop: 60, backgroundColor: "#06101D", gap: 20 }}>
        <Text accessibilityRole="header" style={{ color: "white", fontSize: 24 }}>Report objectionable content or user</Text>
        <Text style={{ color: "#CBD5E1" }}>Describe the issue. Avoid passwords, private keys and unnecessary personal data. Reports are private to you and authorized super administrators.</Text>
        <TextInput accessibilityLabel="Report reason" multiline maxLength={2000} editable={!busy} value={reason} onChangeText={value => { setReason(value); setReportId(""); }} style={{ color: "white", backgroundColor: "#17263A", minHeight: 130, padding: 14 }} />
        {!!message && <Text accessibilityRole="alert" style={{ color: "#FCA5A5" }}>{message}</Text>}
        <Pressable accessibilityRole="button" disabled={busy} style={{ minHeight: 48 }} onPress={() => { void submit(); }}><Text style={{ color: "#60A5FA" }}>{busy ? "Saving…" : "Submit report"}</Text></Pressable>
        <Pressable accessibilityRole="button" disabled={busy} style={{ minHeight: 48 }} onPress={() => setReporting(false)}><Text style={{ color: "#CBD5E1" }}>Cancel</Text></Pressable>
      </View>
    </Modal>
  </View>;
}
