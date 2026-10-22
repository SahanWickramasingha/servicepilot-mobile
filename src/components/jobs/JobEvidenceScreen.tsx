import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, type GestureResponderEvent } from "react-native";
import { auth } from "@/src/firebase/config";
import { useTechnicianRequest } from "@/src/hooks/useTechnicianRequest";
import { useJobEvidence } from "@/src/hooks/useJobEvidence";
import { cleanupJobUploads, newJobPhotoAttempt, pickJobPhotos, saveJobEvidence, uploadJobPhoto, type JobPhotoStage, type ServiceNotes } from "@/src/services/jobEvidence.service";
import { type SelectedReviewPhoto } from "@/src/services/reviewPhotos.service";
import { JobPhoto, SignaturePreview } from "./JobEvidenceView";

type Mode = JobPhotoStage | "notes" | "signature";
const titles = { before: "Before Service Photos", after: "After Service Photos", notes: "Service Notes", signature: "Customer Signature" };
export function JobEvidenceScreen({ mode }: { mode: Mode }) {
  const job = useTechnicianRequest(), state = useJobEvidence(job.requestId), viewer = auth.currentUser?.uid;
  const [owner, setOwner] = useState(viewer), [photos, setPhotos] = useState<SelectedReviewPhoto[]>([]), [kept, setKept] = useState<string[]>([]);
  const [notes, setNotes] = useState<ServiceNotes>({ diagnosis: "", workCompleted: "", recommendation: "", parts: [] });
  const [name, setName] = useState(""), [path, setPath] = useState(""), [approved, setApproved] = useState(false);
  const [busy, setBusy] = useState(false), [progress, setProgress] = useState(0), [message, setMessage] = useState("");
  const session = useRef(0), inFlight = useRef(false), dirty = useRef(false), hydrated = useRef(false), baseRevision = useRef(0), uploadAttempt = useRef("");
  const abort = useRef<AbortController | null>(null), pad = useRef({ width: 320, height: 180 });
  useEffect(() => {
    session.current++; hydrated.current = false; dirty.current = false; baseRevision.current = 0; uploadAttempt.current = "";
    setOwner(viewer); setPhotos([]); setKept([]); setPath(""); setName(""); setApproved(false); setMessage(""); setBusy(false); inFlight.current = false;
    setNotes({ diagnosis: "", workCompleted: "", recommendation: "", parts: [] });
    return () => { session.current++; abort.current?.abort(); };
  }, [viewer, job.requestId, mode]);
  useEffect(() => {
    if (!state.confirmed || hydrated.current || dirty.current || owner !== viewer) return;
    hydrated.current = true; baseRevision.current = state.evidence?.revision ?? 0;
    setKept(state.evidence?.[mode === "before" ? "beforePhotos" : "afterPhotos"] ?? []);
    if (state.evidence?.notes) setNotes(state.evidence.notes);
    setName(state.evidence?.signature?.customerName ?? job.request?.customerName ?? "");
    setPath(state.evidence?.signature?.path ?? ""); setApproved(state.evidence?.signature?.confirmed ?? false);
  }, [state.confirmed, state.evidence, mode, owner, viewer, job.request?.customerName]);
  const canEdit = !!job.request && (mode === "before" ? ["accepted", "assigned", "in_progress"] : ["in_progress"]).includes(job.request.status);
  const changed = () => { dirty.current = true; setMessage(""); };
  const choose = async (camera: boolean) => {
    if (inFlight.current) return; inFlight.current = true; const version = session.current; setBusy(true);
    try { const selected = await pickJobPhotos(3 - kept.length - photos.length, camera); if (version === session.current && selected.length) { changed(); uploadAttempt.current = ""; setPhotos((value) => [...value, ...selected]); } }
    catch { if (version === session.current) setMessage("Unable to choose a photo. Check camera permission or choose a supported image smaller than 15 MB."); }
    finally { if (version === session.current) { inFlight.current = false; setBusy(false); } }
  };
  const save = async () => {
    if (inFlight.current || !viewer || owner !== viewer || !canEdit || !state.confirmed) return;
    inFlight.current = true; setBusy(true); setProgress(0); setMessage(""); const version = session.current, uid = viewer, uploaded: string[] = [];
    abort.current = new AbortController(); let committing = false;
    const attempted: string[] = [];
    try {
      if (mode === "before" || mode === "after") {
        uploadAttempt.current ||= newJobPhotoAttempt();
        for (let index = 0; index < photos.length; index++) {
          attempted.push(`job_photos/${uid}/${job.requestId}/${mode}/${uploadAttempt.current}/${index}.jpg`);
          uploaded.push(await uploadJobPhoto(job.requestId, mode, uploadAttempt.current, index, photos[index], (fraction) => {
          if (version === session.current) setProgress((index + fraction) / photos.length);
          }, abort.current.signal));
        }
        if (version !== session.current) {
          if (auth.currentUser?.uid === uid) { try { await cleanupJobUploads(job.requestId, uid, attempted); } catch { /* Retry cleanup with an authoritative connection. */ } }
          return;
        }
        committing = true;
        await saveJobEvidence(job.requestId, baseRevision.current, mode === "before" ? { beforePhotos: [...kept, ...uploaded] } : { afterPhotos: [...kept, ...uploaded] });
      } else await saveJobEvidence(job.requestId, baseRevision.current, mode === "notes" ? { notes } : { signature: { customerName: name.trim(), path, confirmed: approved as true } });
      if (version === session.current && auth.currentUser?.uid === uid) { dirty.current = false; setMessage("Saved successfully."); router.back(); }
    } catch (error) {
      if (version === session.current && auth.currentUser?.uid === uid) {
        setMessage(error instanceof Error && !('code' in error) ? error.message : "Unable to confirm this save. Your selections are kept; check your connection and retry.");
        // The fresh read in cleanup protects any files referenced by a lost-ack commit.
      }
      const code = (error as { code?: string }).code;
      if (auth.currentUser?.uid === uid && (!committing || code === "permission-denied" || !code)) {
        try { await cleanupJobUploads(job.requestId, uid, attempted); } catch { /* Offline/ambiguous: retain files for safe retry. */ }
      }
    } finally { if (version === session.current) { inFlight.current = false; setBusy(false); } }
  };
  const draw = (event: GestureResponderEvent, start: boolean) => {
    if (busy || !canEdit || !state.confirmed) return;
    const x = Math.max(0, Math.min(320, event.nativeEvent.locationX * 320 / pad.current.width)).toFixed(1);
    const y = Math.max(0, Math.min(180, event.nativeEvent.locationY * 180 / pad.current.height)).toFixed(1);
    changed(); setApproved(false); setPath((value) => value.length > 14950 ? value : `${value}${start ? "M" : "L"}${x},${y} `);
  };
  if (owner !== viewer || job.loading || state.loading) return <View style={styles.screen}><ActivityIndicator color="#60A5FA" /><Text style={styles.text}>Loading service evidence…</Text></View>;
  if (job.errorMessage || !job.request || state.error) return <View style={styles.screen}><Text style={styles.text}>{job.errorMessage || state.error || "Job unavailable."}</Text><Button label="Retry" onPress={state.retry} /><Button label="Back" onPress={() => router.back()} /></View>;
  return <ScrollView style={styles.screen} contentContainerStyle={{ padding: 20, paddingBottom: 50 }} keyboardShouldPersistTaps="handled">
    <Button label="Back" onPress={() => router.back()} /><Text accessibilityRole="header" style={styles.title}>{titles[mode]}</Text>
    {!canEdit && <Text style={styles.text}>Saved service evidence. This job cannot be edited in its current status.</Text>}
    {!state.confirmed && <Text style={styles.error}>Showing saved evidence. Reconnect before saving.</Text>}
    {(mode === "before" || mode === "after") && <>
      <Text style={styles.text}>One to three photos per stage. JPEG, PNG or WebP; up to 15 MB before compression and 5 MB after.</Text>
      <View style={styles.row}>{kept.map((saved) => <View key={saved}><JobPhoto path={saved} />{canEdit && <Button label="Remove saved photo" disabled={busy} onPress={() => { changed(); setKept((value) => value.filter((p) => p !== saved)); }} />}</View>)}
        {photos.map((photo, index) => <View key={photo.uri}><Image source={{ uri: photo.uri }} style={{ width: 90, height: 90 }} /><Button label={`Remove selection ${index + 1}`} disabled={busy} onPress={() => { changed(); uploadAttempt.current = ""; setPhotos((value) => value.filter((_, i) => i !== index)); }} /></View>)}</View>
      {canEdit && <View style={styles.row}><Button label="Choose photos" disabled={busy} onPress={() => void choose(false)} /><Button label="Take photo" disabled={busy} onPress={() => void choose(true)} /></View>}
    </>}
    {mode === "notes" && <>
      {([['diagnosis', 'Diagnosis (required)'], ['workCompleted', 'Work completed (required)'], ['recommendation', 'Recommendations (optional)']] as const).map(([key, label]) => <View key={key}><Text style={styles.text}>{label}</Text><TextInput accessibilityLabel={label} editable={canEdit && !busy} multiline maxLength={3000} style={styles.input} value={notes[key]} onChangeText={(text) => { changed(); setNotes((value) => ({ ...value, [key]: text })); }} /></View>)}
      <Text style={styles.text}>Parts used (optional)</Text>{notes.parts.map((part, index) => <View key={index}><TextInput accessibilityLabel={`Part ${index + 1} name`} editable={canEdit && !busy} maxLength={100} style={styles.input} value={part.name} onChangeText={(text) => { changed(); setNotes((value) => ({ ...value, parts: value.parts.map((p, i) => i === index ? { ...p, name: text } : p) })); }} /><TextInput accessibilityLabel={`Part ${index + 1} quantity`} editable={canEdit && !busy} keyboardType="number-pad" style={styles.input} value={String(part.quantity || '')} onChangeText={(text) => { changed(); setNotes((value) => ({ ...value, parts: value.parts.map((p, i) => i === index ? { ...p, quantity: Number(text) } : p) })); }} /><Button label="Remove part" disabled={busy || !canEdit} onPress={() => { changed(); setNotes((value) => ({ ...value, parts: value.parts.filter((_, i) => i !== index) })); }} /></View>)}
      {canEdit && <Button label="Add part" disabled={busy || notes.parts.length >= 10} onPress={() => { changed(); setNotes((value) => ({ ...value, parts: [...value.parts, { name: '', quantity: 1 }] })); }} />}
    </>}
    {mode === "signature" && <>
      <Text style={styles.text}>Customer name</Text><TextInput accessibilityLabel="Customer signature name" editable={canEdit && !busy} maxLength={100} style={styles.input} value={name} onChangeText={(value) => { changed(); setName(value); setApproved(false); }} />
      <Text style={styles.text}>Ask the customer to draw their signature below.</Text>
      <View accessible accessibilityLabel="Customer signature drawing area" onLayout={(event) => { pad.current = event.nativeEvent.layout; }} onStartShouldSetResponder={() => canEdit && !busy && state.confirmed} onMoveShouldSetResponder={() => true} onResponderGrant={(event) => draw(event, true)} onResponderMove={(event) => draw(event, false)} style={{ height: 180 }}><View pointerEvents="none"><SignaturePreview path={path} /></View></View>
      {canEdit && <><Button label="Clear signature" disabled={busy} onPress={() => { changed(); setPath(""); setApproved(false); }} /><TouchableOpacity accessibilityRole="checkbox" accessibilityState={{ checked: approved, disabled: busy }} disabled={busy} onPress={() => { changed(); setApproved((value) => !value); }} style={styles.button}><Text style={styles.text}>{approved ? "☑" : "☐"} Customer confirms approval of the completed service</Text></TouchableOpacity></>}
    </>}
    {busy && <View style={styles.row}><ActivityIndicator color="#60A5FA" /><Text style={styles.text}>{progress > 0 ? `Uploading ${Math.round(progress * 100)}%` : "Saving…"}</Text></View>}
    {!!message && <Text accessibilityRole="alert" style={styles.error}>{message}</Text>}
    {canEdit && <Button label={message ? "Retry save" : "Save"} disabled={busy || !state.confirmed} onPress={() => void save()} />}
  </ScrollView>;
}
function Button({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
  return <TouchableOpacity accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={[styles.button, disabled && { opacity: 0.5 }]}><Text style={styles.text}>{label}</Text></TouchableOpacity>;
}
const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: "#06101D" }, title: { fontSize: 24, fontWeight: "700", color: "white", marginVertical: 16 },
  text: { color: "#CBD5E1", fontSize: 14, lineHeight: 21 }, row: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginVertical: 12 },
  input: { backgroundColor: "#101F30", color: "white", borderRadius: 12, padding: 12, minHeight: 50, marginVertical: 8 },
  button: { minHeight: 44, backgroundColor: "#17263A", borderRadius: 10, padding: 12, justifyContent: "center", marginVertical: 6 }, error: { color: "#FCA5A5", marginVertical: 12 } });
