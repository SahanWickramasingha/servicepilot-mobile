import { StyleSheet, Text, View } from "react-native";
import { TechnicianMapProps } from "./TechnicianMap.types";
export default function TechnicianMap(_props: TechnicianMapProps) {
  return <View style={styles.card}><Text style={styles.text}>Open ServicePilot on Android or iOS for the map. The same Technician list is available here.</Text></View>;
}
const styles = StyleSheet.create({ card: { padding: 25, borderRadius: 20, backgroundColor: "#0D1B2A" }, text: { color: "#94A3B8", lineHeight: 22 } });
