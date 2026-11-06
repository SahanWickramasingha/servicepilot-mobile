import { AppModal as Modal } from "@/src/components/layout/AppModal";
import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { Pressable, Text, View } from "react-native";
import { auth } from "@/src/firebase/config";
import { acceptCurrentPolicies, subscribePolicyPrompt } from "@/src/services/policy.service";
import { TermsAcceptance } from "./TermsAcceptance";
type Prompt = Parameters<Parameters<typeof subscribePolicyPrompt>[0]>[0];
export function PolicyAcceptancePrompt() {
  const [prompt, setPrompt] = useState<Prompt>();
  const [checked, setChecked] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => {
    let current: Prompt | undefined;
    const unsubscribe = subscribePolicyPrompt(next => {
      current?.reject(); current = next; setChecked(false); setError(""); setPrompt(next);
    });
    const stopAuth = onAuthStateChanged(auth, user => { if (current && current.uid !== user?.uid) { current.reject(); current = undefined; setPrompt(undefined); } });
    return () => { current?.reject(); unsubscribe(); stopAuth(); };
  }, []);
  const cancel = () => { if (!busy) { prompt?.reject(); setPrompt(undefined); } };
  return <Modal visible={!!prompt} animationType="slide" onRequestClose={cancel}>
    <View style={{ flex: 1, backgroundColor: "#06101D", padding: 24, paddingTop: 24, justifyContent: "center", gap: 18 }}>
      <Text accessibilityRole="header" style={{ color: "white", fontSize: 24 }}>Before sharing content</Text>
      <Text style={{ color: "#CBD5E1", lineHeight: 23 }}>Read the current Terms and Privacy Policy. Optional device permissions remain separate. You can cancel and continue browsing.</Text>
      <TermsAcceptance checked={checked} onChange={setChecked} error={error} disabled={busy} />
      <Pressable accessibilityRole="button" disabled={busy} style={{ minHeight: 48 }} onPress={async () => {
        if (!checked) { setError("Please agree to the Terms and acknowledge the Privacy Policy."); return; }
        const pending = prompt; setBusy(true);
        try { await acceptCurrentPolicies(); if (pending && auth.currentUser?.uid === pending.uid) { pending.resolve(); setPrompt(undefined); } }
        catch { setError("Unable to confirm acceptance. Check your connection and retry."); }
        finally { setBusy(false); }
      }}><Text style={{ color: "#60A5FA" }}>{busy ? "Saving…" : "Agree and continue"}</Text></Pressable>
      <Pressable accessibilityRole="button" disabled={busy} style={{ minHeight: 48 }} onPress={cancel}><Text style={{ color: "#CBD5E1" }}>Cancel</Text></Pressable>
    </View>
  </Modal>;
}
