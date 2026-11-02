import { ScrollView, StyleSheet, Text, View } from "react-native";
import { LEGAL_CONTENT } from "@/functions/src/domain/legalPolicy";
export type PolicyPage = keyof typeof LEGAL_CONTENT.documents;
export function PolicyDocument({ page }: { page: PolicyPage }) {
  const document = LEGAL_CONTENT.documents[page];
  return <ScrollView contentContainerStyle={styles.body} accessibilityLabel={document.title}>
    <Text accessibilityRole="header" style={styles.title}>{document.title}</Text>
    <Text style={styles.copy}>Effective {LEGAL_CONTENT.effectiveDate} · Terms {LEGAL_CONTENT.termsVersion} · Privacy {LEGAL_CONTENT.privacyPolicyVersion}</Text>
    {document.sections.map(section => <View key={section.heading} style={styles.section}>
      <Text accessibilityRole="header" style={styles.heading}>{section.heading}</Text><Text selectable style={styles.copy}>{section.text}</Text>
    </View>)}
  </ScrollView>;
}
const styles = StyleSheet.create({ body: { padding: 20, gap: 22, paddingBottom: 35 }, section: { gap: 8 },
  title: { color: "#F8FAFC", fontSize: 25, fontWeight: "800" }, heading: { color: "#F8FAFC", fontSize: 17, fontWeight: "700" },
  copy: { color: "#CBD5E1", fontSize: 15, lineHeight: 24 } });
