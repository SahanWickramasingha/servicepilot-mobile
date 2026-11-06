import { useEffect, useState } from "react";
import { AccessibilityInfo, ActivityIndicator, Image, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";

/** Presentation only. AppModal supplies the measured safe-area viewport. */
export function AccountSetupLoading() {
  const { width } = useWindowDimensions();
  const logoSize = Math.min(88, Math.max(56, width * 0.22));
  // Stay still until the platform preference is known; avoid an initial spin
  // for people who have requested reduced motion.
  const [reduceMotion, setReduceMotion] = useState(true);
  useEffect(() => {
    let active = true, preferenceChanged = false;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => {
      if (active && !preferenceChanged) setReduceMotion(value);
    }).catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", value => {
      preferenceChanged = true;
      setReduceMotion(value);
    });
    return () => { active = false; subscription.remove(); };
  }, []);

  return <ScrollView style={styles.screen} contentContainerStyle={styles.content}
    contentInsetAdjustmentBehavior="never" showsVerticalScrollIndicator={false} bounces={false}>
    <View style={styles.group} accessible accessibilityRole="progressbar"
      accessibilityState={{ busy: true }} accessibilityLiveRegion="polite"
      accessibilityLabel="Getting things ready. Checking your account setup…">
      <Image source={require("@/assets/images/servicepilot-logo.png")} resizeMode="contain" fadeDuration={0}
        accessible={false} style={{ width: logoSize, height: logoSize, borderRadius: logoSize * 0.24, marginBottom: 20 }} />
      <View style={styles.indicator} accessible={false} importantForAccessibility="no-hide-descendants">
        {reduceMotion ? <View style={styles.stillIndicator} /> : <ActivityIndicator size="small" color="#60A5FA" />}
      </View>
      <Text accessible={false} style={styles.heading}>Getting things ready</Text>
      <Text accessible={false} style={styles.supporting}>Checking your account setup…</Text>
    </View>
  </ScrollView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#06101D" },
  content: { flexGrow: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  group: { width: "100%", maxWidth: 360, alignItems: "center" },
  indicator: { height: 20, justifyContent: "center", alignItems: "center", marginBottom: 20 },
  stillIndicator: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: "#60A5FA" },
  heading: { color: "#FFFFFF", fontSize: 22, lineHeight: 30, fontWeight: "700", textAlign: "center" },
  supporting: { color: "#94A3B8", fontSize: 15, lineHeight: 22, textAlign: "center", marginTop: 8 },
});
