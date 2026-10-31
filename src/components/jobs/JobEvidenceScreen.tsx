import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, type GestureResponderEvent } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { auth } from "@/src/firebase/config";
import { useTechnicianRequest } from "@/src/hooks/useTechnicianRequest";
import { useJobEvidence } from "@/src/hooks/useJobEvidence";
import { newJobPhotoAttempt, pickJobPhotos, saveJobEvidence, uploadJobPhoto, type JobPhotoStage } from "@/src/services/jobEvidence.service";
import { type SelectedReviewPhoto } from "@/src/services/reviewPhotos.service";
import { JobPhoto, SignaturePreview } from "./JobEvidenceView";
import { signaturePoint, SIGNATURE_WIDTH, SIGNATURE_HEIGHT } from "@/src/utils/signatureCoordinates";
import { normalizeServiceNotes, serviceNotesErrors, SERVICE_NOTES_MIN, SERVICE_NOTES_MAX, type ServiceNotesDraft } from "@/functions/src/domain/jobEvidence";

type Mode = JobPhotoStage | "notes" | "signature";
const titles = { before: "Before Service Photos", after: "After Service Photos", notes: "Service Notes", signature: "Customer Signature" };
export function JobEvidenceScreen({ mode }: { mode: Mode }) {
  const job = useTechnicianRequest(), state = useJobEvidence(job.requestId), viewer = auth.currentUser?.uid;
  const [owner, setOwner] = useState(viewer), [photos, setPhotos] = useState<SelectedReviewPhoto[]>([]), [kept, setKept] = useState<string[]>([]);
  const [notes, setNotes] = useState<ServiceNotesDraft>({ diagnosis: "", workCompleted: "", recommendation: "", parts: [] });
  const [notesSubmitted, setNotesSubmitted] = useState(false);
  const [name, setName] = useState(""), [path, setPath] = useState(""), [approved, setApproved] = useState(false);
  const [busy, setBusy] = useState(false), [progress, setProgress] = useState(0), [message, setMessage] = useState("");
  const [drawing, setDrawing] = useState(false);
  const session = useRef(0), inFlight = useRef(false), dirty = useRef(false), hydrated = useRef(false), baseRevision = useRef(0), uploadAttempt = useRef("");
  const abort = useRef<AbortController | null>(null), pad = useRef({ width: 320, height: 180 });
  const nextStroke = useRef(true);
  useEffect(() => {
    const generation = ++session.current; hydrated.current = false; dirty.current = false; baseRevision.current = 0; uploadAttempt.current = "";
    setOwner(viewer); setPhotos([]); setKept([]); setPath(""); setName(""); setApproved(false); setMessage(""); setBusy(false); setDrawing(false); inFlight.current = false;
    setNotes({ diagnosis: "", workCompleted: "", recommendation: "", parts: [] });
    setNotesSubmitted(false);
    return () => { session.current = generation + 1; abort.current?.abort(); };
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
  const noteErrors = mode === "notes" && notesSubmitted ? Object.fromEntries(
    Object.entries(serviceNotesErrors(notes)).map(([field, error]) => [field, shortNotesError(error)])
  ) : {};
  const changed = () => { dirty.current = true; setMessage(""); };
  const choose = async (camera: boolean) => {
    if (inFlight.current) return; inFlight.current = true; const version = session.current; setBusy(true);
    try { const selected = await pickJobPhotos(3 - kept.length - photos.length, camera); if (version === session.current && selected.length) { changed(); uploadAttempt.current = ""; setPhotos((value) => [...value, ...selected]); } }
    catch (error) { if (version === session.current) setMessage(error instanceof Error ? error.message : "Unable to choose a photo. Check permission or choose a supported image smaller than 15 MB."); }
    finally { if (version === session.current) { inFlight.current = false; setBusy(false); } }
  };
  const save = async () => {
    if (inFlight.current || !viewer || owner !== viewer || !canEdit || !state.confirmed) return;
    inFlight.current = true; setBusy(true); setProgress(0); setMessage(""); const version = session.current, uid = viewer, uploaded: string[] = [];
    abort.current = new AbortController();
    if (mode === "notes") setNotesSubmitted(true);
    try {
      if (mode === "before" || mode === "after") {
        uploadAttempt.current ||= newJobPhotoAttempt();
        for (let index = 0; index < photos.length; index++) {
          uploaded.push(await uploadJobPhoto(job.requestId, mode, uploadAttempt.current, index, photos[index], (fraction) => {
          if (version === session.current) setProgress((index + fraction) / photos.length);
          }, abort.current.signal));
        }
        if (version !== session.current || auth.currentUser?.uid !== uid) return;
        await saveJobEvidence(job.requestId, baseRevision.current, mode === "before" ? { beforePhotos: [...kept, ...uploaded] } : { afterPhotos: [...kept, ...uploaded] });
      } else await saveJobEvidence(job.requestId, baseRevision.current, mode === "notes" ? { notes: normalizeServiceNotes(notes) } : { signature: { customerName: name.trim(), path, confirmed: approved as true } });
      if (version === session.current && auth.currentUser?.uid === uid) { dirty.current = false; setMessage("Saved successfully."); router.back(); }
    } catch (error) {
      if (version === session.current && auth.currentUser?.uid === uid) {
        const code = (error as { code?: string }).code;
        const field = (error as { field?: unknown }).field;
        const inlineNotesError = mode === "notes" && typeof field === "string" && Object.prototype.hasOwnProperty.call(serviceNotesErrors(notes), field);
        if (!inlineNotesError) setMessage(error instanceof Error && (!code || code.startsWith("photos/") || code === "booking/session") ? error.message : "Unable to confirm this save. Your selections are kept; check your connection and retry.");
        // The fresh read in cleanup protects any files referenced by a lost-ack commit.
      }
      // Keep the exact upload attempt on failure/lost acknowledgement. The
      // trusted expiry process safely collects only unreferenced old objects.
    } finally { if (version === session.current) { inFlight.current = false; setBusy(false); } }
  };
  const draw = (event: GestureResponderEvent, start: boolean) => {
    if (busy || !canEdit || !state.confirmed) return;
    const point = signaturePoint(pad.current.width, pad.current.height, event.nativeEvent.locationX, event.nativeEvent.locationY);
    if (!point) return;
    const move = start || nextStroke.current; nextStroke.current = false;
    changed(); setApproved(false); setPath((value) => value.length > 14950 ? value : `${value}${move ? "M" : "L"}${point.x.toFixed(1)},${point.y.toFixed(1)} `);
  };
  if (owner !== viewer || job.loading || state.loading) return <View style={styles.screen}><ActivityIndicator color="#60A5FA" /><Text style={styles.text}>Loading service evidence…</Text></View>;
  if (job.errorMessage || !job.request || state.error) return <View style={styles.screen}><Text style={styles.text}>{job.errorMessage || state.error || "Job unavailable."}</Text><Button label="Retry" onPress={state.retry} /><Button label="Back" onPress={() => router.back()} /></View>;
  return <SafeAreaView style={styles.screen}><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}><ScrollView style={styles.screen} scrollEnabled={!drawing} contentContainerStyle={{ padding: 20, paddingBottom: 50, width: "100%", maxWidth: 560, alignSelf: "center" }} keyboardShouldPersistTaps="handled">
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
      {([['diagnosis', 'Diagnosis (required)'], ['workCompleted', 'Work completed (required)'], ['recommendation', 'Recommendations (optional)']] as const).map(([key, label]) => <View key={key} style={styles.noteField}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <TextInput accessibilityLabel={label} editable={canEdit && !busy} multiline maxLength={SERVICE_NOTES_MAX} style={[styles.input, styles.noteInput, !!noteErrors[key] && styles.invalidInput]} value={notes[key]} onChangeText={(text) => { changed(); setNotes((value) => ({ ...value, [key]: text })); }} />
        {key !== "recommendation" && !noteErrors[key] && <Text style={styles.helper}>{`Min. ${SERVICE_NOTES_MIN} characters`}</Text>}
        {!!noteErrors[key] && <Text accessibilityRole="alert" style={styles.fieldError}>{noteErrors[key]}</Text>}
      </View>)}
      <Text style={styles.fieldLabel}>Parts used (optional)</Text>
      {!!noteErrors.parts && <Text accessibilityRole="alert" style={styles.fieldError}>{noteErrors.parts}</Text>}
      {notes.parts.map((part, index) => <View key={index} style={styles.partCard}><View style={styles.partFields}><View style={styles.partName}>
        <Text style={styles.fieldLabel}>Part name</Text>
        <TextInput accessibilityLabel={`Part ${index + 1} name`} editable={canEdit && !busy} maxLength={100} style={[styles.input, !!noteErrors[`parts.${index}.name`] && styles.invalidInput]} value={part.name} onChangeText={(text) => { changed(); setNotes((value) => ({ ...value, parts: value.parts.map((p, i) => i === index ? { ...p, name: text } : p) })); }} />
        {!!noteErrors[`parts.${index}.name`] && <Text accessibilityRole="alert" style={styles.fieldError}>{noteErrors[`parts.${index}.name`]}</Text>}
        </View><View style={styles.partQuantity}><Text style={styles.fieldLabel}>Quantity</Text>
        <TextInput accessibilityLabel={`Part ${index + 1} quantity`} editable={canEdit && !busy} keyboardType="number-pad" style={[styles.input, !!noteErrors[`parts.${index}.quantity`] && styles.invalidInput]} value={String(part.quantity)} onChangeText={(text) => { changed(); setNotes((value) => ({ ...value, parts: value.parts.map((p, i) => i === index ? { ...p, quantity: text } : p) })); }} />
        {!!noteErrors[`parts.${index}.quantity`] && <Text accessibilityRole="alert" style={styles.fieldError}>{noteErrors[`parts.${index}.quantity`]}</Text>}
        </View></View>
        <Button label="Remove part" disabled={busy || !canEdit} onPress={() => { changed(); setNotes((value) => ({ ...value, parts: value.parts.filter((_, i) => i !== index) })); }} /></View>)}
      {canEdit && <Button label="Add part" disabled={busy || notes.parts.length >= 10} onPress={() => { changed(); setNotes((value) => ({ ...value, parts: [...value.parts, { name: '', quantity: 1 }] })); }} />}
    </>}
    {mode === "signature" && <>
      <Text style={styles.text}>Customer name</Text><TextInput accessibilityLabel="Customer signature name" editable={canEdit && !busy} maxLength={100} style={styles.input} value={name} onChangeText={(value) => { changed(); setName(value); setApproved(false); }} />
      <Text style={styles.text}>Ask the customer to draw their signature below as a service acknowledgment.</Text>
      <View accessible accessibilityLabel="Customer signature drawing area" onLayout={(event) => {
        const layout = event.nativeEvent.layout;
        if (layout.width !== pad.current.width || layout.height !== pad.current.height) nextStroke.current = true;
        pad.current = layout;
      }} onStartShouldSetResponder={() => canEdit && !busy && state.confirmed} onMoveShouldSetResponder={() => canEdit && !busy && state.confirmed} onResponderTerminationRequest={() => false} onResponderGrant={(event) => { setDrawing(true); draw(event, true); }} onResponderMove={(event) => draw(event, false)} onResponderRelease={() => setDrawing(false)} onResponderTerminate={() => setDrawing(false)} style={{ width: "100%", aspectRatio: SIGNATURE_WIDTH / SIGNATURE_HEIGHT }}><View pointerEvents="none" style={{ flex: 1 }}><SignaturePreview path={path} fillPad /></View></View>
      {canEdit && <><Button label="Clear signature" disabled={busy} onPress={() => { changed(); setPath(""); setApproved(false); }} /><TouchableOpacity accessibilityRole="checkbox" accessibilityState={{ checked: approved, disabled: busy }} disabled={busy} onPress={() => { changed(); setApproved((value) => !value); }} style={styles.button}><Text style={styles.text}>{approved ? "☑" : "☐"} Customer confirms approval of the completed service</Text></TouchableOpacity></>}
    </>}
    {busy && mode !== "notes" && <View style={styles.row}><ActivityIndicator color="#60A5FA" /><Text style={styles.text}>{progress > 0 ? `Uploading ${Math.round(progress * 100)}%` : "Saving…"}</Text></View>}
    {!!message && <Text accessibilityRole="alert" style={styles.error}>{message}</Text>}
    {canEdit && <Button label={mode === "notes" && busy ? "Saving…" : message ? "Retry save" : "Save"} primary={mode === "notes"} loading={mode === "notes" && busy} disabled={busy || !state.confirmed} onPress={() => void save()} />}
  </ScrollView></KeyboardAvoidingView></SafeAreaView>;
}
/** Short display copy only; the shared validator still decides every error. */
function shortNotesError(error: string): string {
  return error.replace(/^(Diagnosis|Work completed) must contain at least (\d+) characters after trimming\.$/, "Enter at least $2 characters.")
    .replace(/^(Diagnosis|Work completed|Recommendations|Part \d+ name) must be no more than (\d+) characters\.$/, "Use $2 characters or fewer.")
    .replace(/^Part \d+ name is required\.$/, "Enter a part name.")
    .replace(/^Part \d+ quantity must be a whole number from 1 to 999\.$/, "Use a whole number from 1 to 999.");
}
function Button({ label, onPress, disabled = false, primary = false, loading = false }: { label: string; onPress: () => void; disabled?: boolean; primary?: boolean; loading?: boolean }) {
  return <TouchableOpacity accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled, busy: loading }} disabled={disabled} onPress={onPress} style={[styles.button, primary && styles.primaryButton, disabled && { opacity: 0.5 }]}>{loading && <ActivityIndicator color="#FFFFFF" />}<Text accessibilityLiveRegion={loading ? "polite" : "none"} style={primary ? styles.primaryButtonText : styles.text}>{label}</Text></TouchableOpacity>;
}
const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: "#06101D" }, title: { fontSize: 24, fontWeight: "700", color: "white", marginVertical: 16 },
  text: { color: "#CBD5E1", fontSize: 14, lineHeight: 21 }, row: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginVertical: 12 },
  input: { backgroundColor: "#101F30", color: "white", borderRadius: 12, padding: 12, minHeight: 50, marginVertical: 8 },
  noteField: { marginBottom: 24 }, fieldLabel: { color: "#E2E8F0", fontSize: 14, fontWeight: "600", lineHeight: 21 },
  noteInput: { minHeight: 112, textAlignVertical: "top", marginBottom: 4 }, helper: { color: "#94A3B8", fontSize: 12, lineHeight: 18 },
  fieldError: { color: "#FCA5A5", fontSize: 13, lineHeight: 18, marginTop: 4 }, invalidInput: { borderColor: "#FCA5A5", borderWidth: 1 },
  partCard: { backgroundColor: "#0D1B2C", borderRadius: 12, padding: 14, marginTop: 12, marginBottom: 8 },
  partFields: { flexDirection: "row", flexWrap: "wrap", columnGap: 12, rowGap: 8 }, partName: { flexGrow: 1, flexBasis: 160 }, partQuantity: { width: 100 },
  primaryButton: { backgroundColor: "#2563EB", minHeight: 54, marginTop: 24, flexDirection: "row", alignItems: "center", gap: 10 },
  primaryButtonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700", lineHeight: 24 },
  button: { minHeight: 44, backgroundColor: "#17263A", borderRadius: 10, padding: 12, justifyContent: "center", marginVertical: 6 }, error: { color: "#FCA5A5", marginVertical: 12 } });
