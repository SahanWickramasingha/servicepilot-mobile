import { useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { PolicyDocument, type PolicyPage } from "./PolicyDocument";
export function TermsAcceptance({ checked, onChange, error, disabled = false }: {
  checked: boolean; onChange: (value: boolean) => void; error?: string; disabled?: boolean;
}) {
  const [page, setPage] = useState<PolicyPage>();
  return <View style={{ gap: 8, marginVertical: 14 }}>
    <Pressable accessibilityRole="checkbox" accessibilityLabel="I agree to the Terms & Conditions and acknowledge the Privacy Policy."
      accessibilityState={{ checked, disabled }} disabled={disabled} onPress={() => onChange(!checked)}
      style={{ minHeight: 48, flexDirection: "row", alignItems: "center", gap: 12 }}>
      <Text style={{ color: checked ? "#60A5FA" : "#CBD5E1", fontSize: 28 }}>{checked ? "☑" : "☐"}</Text>
      <Text style={{ color: "#CBD5E1", flex: 1, lineHeight: 22 }}>I agree to the Terms & Conditions and acknowledge the Privacy Policy.</Text>
    </Pressable>
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 20 }}>
      {(["terms", "privacy"] as const).map(value => <Pressable key={value} accessibilityRole="link" onPress={() => setPage(value)} style={{ minHeight: 44, justifyContent: "center" }}>
        <Text style={{ color: "#60A5FA", textDecorationLine: "underline" }}>{value === "terms" ? "Terms & Conditions" : "Privacy Policy"}</Text>
      </Pressable>)}
    </View>
    {!!error && <Text accessibilityRole="alert" style={{ color: "#FCA5A5" }}>{error}</Text>}
    <Modal visible={!!page} animationType="slide" onRequestClose={() => setPage(undefined)}>
      <View style={{ flex: 1, backgroundColor: "#06101D", paddingTop: 40 }}>
        {page && <PolicyDocument page={page} />}
        <Pressable accessibilityRole="button" onPress={() => setPage(undefined)} style={{ minHeight: 56, padding: 20 }}><Text style={{ color: "#60A5FA" }}>Back to form</Text></Pressable>
      </View>
    </Modal>
  </View>;
}
