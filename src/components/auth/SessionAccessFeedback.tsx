import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";

export function SessionAccessFeedback({ errorMessage, onRetry }: {
  errorMessage: string;
  onRetry: () => void;
}) {
  return (
    <View style={styles.container}>
      {errorMessage ? <>
        <Text style={styles.error} accessibilityRole="alert">{errorMessage}</Text>
        <TouchableOpacity style={styles.button} onPress={onRetry} accessibilityRole="button">
          <Text style={styles.buttonText}>Try again</Text>
        </TouchableOpacity>
      </> : <ActivityIndicator color="#3B82F6" accessibilityLabel="Checking account access" />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#06101D", padding: 24 },
  error: { color: "#FCA5A5", textAlign: "center", marginBottom: 16 },
  button: { backgroundColor: "#2563EB", borderRadius: 12, paddingHorizontal: 24, paddingVertical: 14 },
  buttonText: { color: "#FFFFFF", fontWeight: "600" },
});
