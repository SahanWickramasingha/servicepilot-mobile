import { useState } from "react";
import { KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { DISTRICTS } from "@/functions/src/domain/map";
import { SERVICE_AREA_CATALOGUE, ServiceArea, ServiceAreasByDistrict } from "@/functions/src/domain/serviceAreas";

export function ServiceAreaPicker({ districts, areas, onChange, disabled }: {
  districts: string[]; areas: ServiceAreasByDistrict; onChange: (areas: ServiceAreasByDistrict) => void; disabled: boolean;
}) {
  const [openDistrict, setOpenDistrict] = useState<string>();
  const [search, setSearch] = useState("");
  const setArea = (id: string, area?: ServiceArea) => {
    const next = { ...areas };
    if (area) next[id] = area; else delete next[id];
    onChange(next);
  };
  return <View style={styles.group}>
    {districts.map((id) => <View key={id} style={styles.group}>
      <Text style={styles.label}>Town / Area — {DISTRICTS.find((d) => d.id === id)?.name}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`Choose town or area for ${id}`} disabled={disabled}
        style={styles.input} onPress={() => { setSearch(""); setOpenDistrict(id); }}>
        <Text style={styles.label}>{areas[id]?.id === "other" ? "Other area (technician-provided)" : areas[id]?.label || "District only — choose an area"}</Text>
      </Pressable>
      {areas[id]?.id === "other" && <TextInput accessibilityLabel={`Other area for ${id}, technician-provided`}
        editable={!disabled} maxLength={80} style={styles.input} placeholder="Locality name only, not your street/home address"
        placeholderTextColor="#64748B" value={areas[id].label} onChangeText={(label) => setArea(id, { id: "other", label, source: "technician" })} />}
    </View>)}
    <Text style={styles.hint}>Selected localities describe where you offer services, not your current GPS town. Other areas are technician-provided. Use locality names only; these are public.</Text>
    <Pressable accessibilityRole="link" onPress={() => { void Linking.openURL("https://www.geonames.org/"); }}>
      <Text style={styles.hint}>Locality names: GeoNames (CC BY 4.0). Curated Kandy list; other localities can be entered using Other area.</Text>
    </Pressable>
    <Modal visible={!!openDistrict} transparent animationType="slide" onRequestClose={() => setOpenDistrict(undefined)}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.overlay}><View style={styles.sheet}>
        <Text style={styles.label}>Search Town / Area — {DISTRICTS.find((d) => d.id === openDistrict)?.name}</Text>
        <TextInput accessibilityLabel="Search towns and areas" style={styles.input} value={search} onChangeText={setSearch}
          placeholder="Search available localities" placeholderTextColor="#64748B" />
        <ScrollView keyboardShouldPersistTaps="handled">
          {(SERVICE_AREA_CATALOGUE[openDistrict ?? ""] ?? []).filter((a) => a.label.toLowerCase().includes(search.trim().toLowerCase())).map((area) =>
            <Pressable key={area.id} accessibilityRole="radio" accessibilityState={{ checked: areas[openDistrict ?? ""]?.id === area.id }}
              style={styles.input} onPress={() => { if (openDistrict) setArea(openDistrict, area); setOpenDistrict(undefined); }}><Text style={styles.label}>{area.label}</Text></Pressable>)}
          <Pressable accessibilityRole="button" style={styles.input} onPress={() => {
            if (openDistrict) setArea(openDistrict, { id: "other", label: "", source: "technician" }); setOpenDistrict(undefined);
          }}><Text style={styles.label}>Other area (technician-provided)</Text></Pressable>
          <Pressable style={styles.input} onPress={() => { if (openDistrict) setArea(openDistrict); setOpenDistrict(undefined); }}><Text style={styles.label}>District only / Clear area</Text></Pressable>
        </ScrollView>
        <Pressable style={styles.input} onPress={() => setOpenDistrict(undefined)}><Text style={styles.label}>Close</Text></Pressable>
      </View></KeyboardAvoidingView>
    </Modal>
  </View>;
}
const styles = StyleSheet.create({
  group: { gap: 10 }, label: { color: "#F8FAFC", fontSize: 13, fontWeight: "600" },
  hint: { color: "#94A3B8", fontSize: 12, lineHeight: 19 },
  input: { color: "#FFFFFF", backgroundColor: "#091522", borderColor: "#1E2D42", borderWidth: 1, padding: 14, borderRadius: 12, marginBottom: 8 },
  overlay: { flex: 1, backgroundColor: "#0009", justifyContent: "flex-end" },
  sheet: { padding: 20, paddingBottom: 35, gap: 12, backgroundColor: "#0D1B2A", borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "85%" },
});
