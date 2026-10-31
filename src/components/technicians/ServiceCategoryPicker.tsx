import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SERVICE_CATEGORY_DEFINITIONS, type ServiceCategoryId } from "@/functions/src/domain/serviceCategories";
export function ServiceCategoryPicker({ value, onChange, disabled = false }: {
  value: string; onChange: (id: ServiceCategoryId) => void; disabled?: boolean;
}) {
  return <View style={styles.options}>{SERVICE_CATEGORY_DEFINITIONS.map(category => <TouchableOpacity key={category.id}
    accessibilityRole="radio" accessibilityLabel={category.label} accessibilityState={{ selected: value === category.id, disabled }}
    disabled={disabled} onPress={() => onChange(category.id)} style={[styles.option, value === category.id && styles.selected, disabled && styles.disabled]}>
    <Text style={styles.label}>{category.label}</Text>
  </TouchableOpacity>)}</View>;
}
const styles = StyleSheet.create({ options: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginVertical: 10 },
  option: { minHeight: 44, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: "#334155", backgroundColor: "#101F30", justifyContent: "center" },
  selected: { borderColor: "#60A5FA", backgroundColor: "#1D4ED8" }, disabled: { opacity: 0.5 }, label: { color: "#E2E8F0", fontSize: 14 } });
