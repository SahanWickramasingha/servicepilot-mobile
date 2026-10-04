import { useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { DISTRICTS } from "@/functions/src/domain/map";

export function DistrictPicker({ selected, onChange, multiple = false, disabled = false }: {
  selected: string[]; onChange: (ids: string[]) => void; multiple?: boolean; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const labels = selected.map((id) => DISTRICTS.find((district) => district.id === id)?.name).filter(Boolean);
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel="Choose service districts" disabled={disabled}
      style={styles.button} onPress={() => { setSearch(""); setOpen(true); }}>
      <Text style={styles.label}>{labels.join(", ") || "Select service district"}</Text>
      <Text style={styles.hint}>Choose {multiple ? "districts" : "district"} ›</Text>
    </Pressable>
    <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.overlay}><View style={styles.sheet}>
        <Text style={styles.title}>{multiple ? "Districts you serve" : "Choose a service district"}</Text>
        <TextInput accessibilityLabel="Search districts" value={search} onChangeText={setSearch}
          placeholder="Search all 25 districts" placeholderTextColor="#64748B" style={styles.search} />
        <ScrollView keyboardShouldPersistTaps="handled">{DISTRICTS.filter((district) => district.name.toLowerCase().includes(search.toLowerCase())).map((district) =>
          <Pressable key={district.id} accessibilityRole={multiple ? "checkbox" : "radio"}
            accessibilityState={{ checked: selected.includes(district.id) }} style={styles.row} onPress={() => {
              onChange(multiple ? (selected.includes(district.id) ? selected.filter((id) => id !== district.id) : [...selected, district.id]) : [district.id]);
              if (!multiple) setOpen(false);
            }}><Text style={styles.label}>{district.name}</Text>
            <Text style={styles.check}>{selected.includes(district.id) ? "✓" : "○"}</Text>
          </Pressable>)}</ScrollView>
        <Pressable style={styles.done} onPress={() => setOpen(false)}><Text style={styles.label}>Done</Text></Pressable>
      </View></KeyboardAvoidingView>
    </Modal>
  </>;
}
const styles = StyleSheet.create({
  button: { padding: 14, borderRadius: 14, backgroundColor: "#0D1B2A", borderWidth: 1, borderColor: "#1E3A5F", gap: 5 },
  label: { color: "#F8FAFC", fontWeight: "700", fontSize: 14 }, hint: { color: "#94A3B8", fontSize: 11 },
  overlay: { flex: 1, backgroundColor: "#0009", justifyContent: "flex-end" },
  sheet: { backgroundColor: "#0D1B2A", padding: 20, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "85%", paddingBottom: 35 },
  title: { color: "#FFFFFF", fontWeight: "800", fontSize: 20, marginBottom: 12 },
  search: { color: "#FFFFFF", backgroundColor: "#06101D", padding: 14, borderRadius: 12, marginBottom: 10 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 15, borderBottomWidth: 1, borderColor: "#17263A" },
  check: { color: "#60A5FA", fontSize: 18 }, done: { backgroundColor: "#2563EB", padding: 15, alignItems: "center", borderRadius: 12, marginTop: 12 },
});
