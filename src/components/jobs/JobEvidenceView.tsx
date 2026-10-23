import { useEffect, useState } from "react";
import { ActivityIndicator, Image, Modal, Text, TouchableOpacity, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { auth } from "@/src/firebase/config";
import { loadReviewPhoto } from "@/src/services/reviewPhotos.service";
import { useJobEvidence } from "@/src/hooks/useJobEvidence";
import { SIGNATURE_WIDTH, SIGNATURE_HEIGHT, SIGNATURE_STROKE } from "@/src/utils/signatureCoordinates";

export function JobPhoto({ path }: { path: string }) {
  const viewer = auth.currentUser?.uid;
  const [image, setImage] = useState<string | null>(null), [error, setError] = useState(false), [opened, setOpened] = useState(false), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let current = true; setImage(null); setError(false); setOpened(false);
    void loadReviewPhoto(path).then((value) => { if (current && viewer === auth.currentUser?.uid) setImage(value); }, () => { if (current && viewer === auth.currentUser?.uid) setError(true); });
    return () => { current = false; };
  }, [path, viewer, attempt]);
  return <>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={error ? "Job photo unavailable. Retry" : "Open saved job photo"} onPress={() => image ? setOpened(true) : setAttempt((value) => value + 1)} style={{ width: 90, minHeight: 90, backgroundColor: "#17263A", padding: 4 }}>
      {image ? <Image source={{ uri: image }} style={{ width: 82, height: 82 }} /> : error ? <Text style={{ color: "#FCA5A5" }}>Photo unavailable. Retry</Text> : <ActivityIndicator color="#60A5FA" />}
    </TouchableOpacity>
    <Modal visible={opened && !!image && viewer === auth.currentUser?.uid} transparent onRequestClose={() => setOpened(false)}>
      <View accessibilityViewIsModal style={{ flex: 1, backgroundColor: "#06101D", padding: 24, paddingTop: 60 }}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close job photo" onPress={() => setOpened(false)} style={{ minHeight: 44 }}><Text style={{ color: "white" }}>Close photo</Text></TouchableOpacity>
        {image && <Image source={{ uri: image }} resizeMode="contain" style={{ flex: 1 }} />}
      </View>
    </Modal>
  </>;
}
export function SignaturePreview({ path, fillPad = false }: { path: string; fillPad?: boolean }) {
  return <Svg width="100%" height={fillPad ? "100%" : SIGNATURE_HEIGHT} viewBox={`0 0 ${SIGNATURE_WIDTH} ${SIGNATURE_HEIGHT}`} preserveAspectRatio="xMidYMid meet" style={{ backgroundColor: "#F8FAFC" }}><Path d={path} stroke="#0F172A" strokeWidth={SIGNATURE_STROKE} fill="none" /></Svg>;
}
export function JobEvidenceView({ requestId }: { requestId: string }) {
  const state = useJobEvidence(requestId), data = state.evidence;
  return <View style={{ gap: 12, marginVertical: 16 }}>
    <Text style={{ color: "#E2E8F0", fontSize: 18, fontWeight: "700" }}>Service evidence</Text>
    {state.loading ? <ActivityIndicator color="#60A5FA" /> : state.error ? <TouchableOpacity accessibilityRole="button" onPress={state.retry}><Text style={{ color: "#FCA5A5" }}>{state.error} Retry</Text></TouchableOpacity> : !data ? <Text style={{ color: "#94A3B8" }}>No service evidence saved yet.</Text> : <>
      {!state.confirmed && <Text style={{ color: "#94A3B8" }}>Showing saved service evidence</Text>}
      {(["before", "after"] as const).map((stage) => <View key={stage}><Text style={{ color: "#CBD5E1" }}>{stage === "before" ? "Before service" : "After service"}</Text><View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{data[stage === "before" ? "beforePhotos" : "afterPhotos"].map((path) => <JobPhoto key={`${auth.currentUser?.uid}:${path}`} path={path} />)}</View></View>)}
      {data.notes && <View><Text style={{ color: "#CBD5E1" }}>Diagnosis: {data.notes.diagnosis}</Text><Text style={{ color: "#CBD5E1" }}>Work completed: {data.notes.workCompleted}</Text>{!!data.notes.recommendation && <Text style={{ color: "#CBD5E1" }}>Recommendations: {data.notes.recommendation}</Text>}{data.notes.parts.map((part, index) => <Text key={index} style={{ color: "#CBD5E1" }}>{part.name} × {part.quantity}</Text>)}</View>}
      {data.signature && <View><Text style={{ color: "#CBD5E1" }}>Customer approval: {data.signature.customerName}</Text><SignaturePreview path={data.signature.path} /></View>}
    </>}
  </View>;
}
