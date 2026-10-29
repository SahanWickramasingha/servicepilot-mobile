import { Text, View } from "react-native";
import { auth } from "@/src/firebase/config";
import { JobPhoto } from "./JobEvidenceView";

/** Persist paths only; the shared viewer fetches authenticated bytes, never public URLs. */
export function RequestAttachments({ paths }: { paths: string[] }) {
  const attachments = paths.filter((path) => /^r2:v1:[a-f0-9]{64}$/.test(path) || path.startsWith("request_attachments/")).slice(0, 2);
  return <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginVertical: 8 }}>
    {attachments.map((path) => <JobPhoto key={`${auth.currentUser?.uid}:${path}`} path={path} label="customer request photo" />)}
    {!attachments.length && <Text style={{ color: "#94A3B8" }}>No request photos.</Text>}
  </View>;
}
