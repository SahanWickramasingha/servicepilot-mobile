import { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { Image, Linking, Pressable, ScrollView, Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { LEGAL_CONTENT } from "@/functions/src/domain/legalPolicy";
import { PolicyDocument, type PolicyPage } from "@/src/components/legal/PolicyDocument";
import { TermsAcceptance } from "@/src/components/legal/TermsAcceptance";
import { acceptCurrentPolicies } from "@/src/services/policy.service";
import { deletionEmailURL, openContactLink } from "@/src/utils/legalContact";
import { auth } from "@/src/firebase/config";
export default function LegalScreen() {
  const params = useLocalSearchParams<{ page: string }>();
  const page: PolicyPage = Object.hasOwn(LEGAL_CONTENT.documents, params.page ?? "") ? params.page as PolicyPage : "support";
  const [message, setMessage] = useState(""), [checked, setChecked] = useState(false), [busy, setBusy] = useState(false);
  const open = async (url: string) => setMessage(await openContactLink(url, Linking.openURL) ?
    (url.startsWith("mailto:") ? "Mail composer opened. Review and send your email; opening it does not submit a request." : "") : "Unable to open this link. Use the contact details below or copy the email address.");
  const button = (label: string, action: () => void) => <Pressable key={label} accessibilityRole="button" style={{ minHeight: 48, paddingVertical: 12 }} onPress={action}><Text style={{ color: "#60A5FA", fontSize: 16 }}>{label}</Text></Pressable>;
  return <View style={{ flex: 1, backgroundColor: "#06101D", paddingTop: 45 }}>
    <Pressable accessibilityRole="button" style={{ padding: 18 }} onPress={() => router.canGoBack() ? router.back() : router.replace("/login")}><Text style={{ color: "#60A5FA" }}>Back</Text></Pressable>
    <ScrollView contentContainerStyle={{ paddingBottom: 35, maxWidth: 720, width: "100%", alignSelf: "center" }}>
      {page === "about" && <Image source={require("@/assets/images/servicepilot-logo.png")} accessibilityLabel="ServicePilot logo" style={{ height: 90, width: 90, alignSelf: "center" }} />}
      <PolicyDocument page={page} />
      <View style={{ paddingHorizontal: 20 }}>
        {(page === "terms" || page === "privacy") && auth.currentUser && <>
          <TermsAcceptance checked={checked} onChange={setChecked} disabled={busy} />
          <Pressable accessibilityRole="button" disabled={busy} style={{ minHeight: 48 }} onPress={async () => {
            if (!checked) { setMessage("Please agree to the Terms and acknowledge the Privacy Policy."); return; }
            setBusy(true); try { await acceptCurrentPolicies(); setMessage("Your acceptance was saved."); }
            catch { setMessage("Unable to confirm acceptance. Check your connection and retry."); } finally { setBusy(false); }
          }}><Text style={{ color: "#60A5FA" }}>{busy ? "Saving…" : "Save my acceptance"}</Text></Pressable>
        </>}
        {button(page === "deletion" ? "Open deletion-request email" : "Email support", () => { void open(page === "deletion" ? deletionEmailURL() : `mailto:${LEGAL_CONTENT.email}`); })}
        <Text selectable style={{ color: "#CBD5E1", fontSize: 16 }}>{LEGAL_CONTENT.email}</Text>
        {button("Copy email address", () => { void Clipboard.setStringAsync(LEGAL_CONTENT.email).then(() => setMessage("Email address copied. No request has been sent.")).catch(() => setMessage("Copy unavailable. Select and copy the email address above.")); })}
        {button(`Call ${LEGAL_CONTENT.phone}`, () => { void open(LEGAL_CONTENT.phoneLink); })}
        {button("LinkedIn — Sahan Wikramasingha", () => { void open(LEGAL_CONTENT.linkedIn); })}
        {!!message && <Text accessibilityRole="alert" style={{ color: "#CBD5E1", lineHeight: 23 }}>{message}</Text>}
      </View>
    </ScrollView>
  </View>;
}
