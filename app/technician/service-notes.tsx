import { router, useLocalSearchParams } from "expo-router";
import {
  ArrowLeft,
  CheckCircle2,
  FileText,
  Package,
  Plus,
  Trash2,
  Wrench,
} from "lucide-react-native";
import { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

type PartItem = {
  id: number;
  name: string;
  quantity: string;
};

export default function ServiceNotesScreen() {
  const params = useLocalSearchParams<{ id?: string }>();

  const jobId = params.id ?? "REQ-2026-0012";

  const [diagnosis, setDiagnosis] = useState("");
  const [workCompleted, setWorkCompleted] = useState("");
  const [recommendation, setRecommendation] = useState("");

  const [parts, setParts] = useState<PartItem[]>([
    {
      id: 1,
      name: "",
      quantity: "1",
    },
  ]);

  const updatePart = (
    id: number,
    field: "name" | "quantity",
    value: string
  ) => {
    setParts((current) =>
      current.map((part) =>
        part.id === id
          ? {
              ...part,
              [field]: value,
            }
          : part
      )
    );
  };

  const addPart = () => {
    setParts((current) => [
      ...current,
      {
        id: Date.now(),
        name: "",
        quantity: "1",
      },
    ]);
  };

  const removePart = (id: number) => {
    if (parts.length === 1) {
      setParts([
        {
          id: 1,
          name: "",
          quantity: "1",
        },
      ]);

      return;
    }

    setParts((current) =>
      current.filter((part) => part.id !== id)
    );
  };

  const handleSave = () => {
    if (!diagnosis.trim()) {
      Alert.alert(
        "Diagnosis Required",
        "Please enter the problem diagnosis."
      );

      return;
    }

    if (!workCompleted.trim()) {
      Alert.alert(
        "Service Notes Required",
        "Please describe the work completed."
      );

      return;
    }

    /*
      Backend later:

      saveServiceNotes({
        jobId,
        diagnosis,
        workCompleted,
        recommendation,
        parts
      })
    */

    Alert.alert(
      "Notes Saved",
      "Service notes have been saved successfully.",
      [
        {
          text: "Continue",
          onPress: () => router.back(),
        },
      ]
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <StatusBar
        barStyle="light-content"
        backgroundColor="#06101D"
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
      >
        {/* Header */}

        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            activeOpacity={0.8}
            onPress={() => router.back()}
          >
            <ArrowLeft size={20} color="#FFFFFF" />
          </TouchableOpacity>

          <View style={styles.headerContent}>
            <Text style={styles.title}>
              Service Notes
            </Text>

            <Text style={styles.requestId}>
              {jobId}
            </Text>
          </View>
        </View>

        {/* Intro */}

        <View style={styles.infoCard}>
          <View style={styles.infoIcon}>
            <FileText
              size={24}
              color="#A78BFA"
            />
          </View>

          <View style={styles.infoContent}>
            <Text style={styles.infoTitle}>
              Service Report
            </Text>

            <Text style={styles.infoText}>
              Record the diagnosis, work completed,
              parts used and recommendations for the customer.
            </Text>
          </View>
        </View>

        {/* Diagnosis */}

        <Text style={styles.sectionTitle}>
          Problem Diagnosis
        </Text>

        <Text style={styles.requiredLabel}>
          Required
        </Text>

        <View style={styles.textArea}>
          <TextInput
            value={diagnosis}
            onChangeText={setDiagnosis}
            placeholder="Describe the issue found during inspection..."
            placeholderTextColor="#64748B"
            multiline
            maxLength={500}
            textAlignVertical="top"
            style={styles.textInput}
          />

          <Text style={styles.counter}>
            {diagnosis.length}/500
          </Text>
        </View>

        {/* Work */}

        <Text style={styles.sectionTitle}>
          Work Completed
        </Text>

        <Text style={styles.requiredLabel}>
          Required
        </Text>

        <View style={styles.textArea}>
          <TextInput
            value={workCompleted}
            onChangeText={setWorkCompleted}
            placeholder="Explain the repair or service work completed..."
            placeholderTextColor="#64748B"
            multiline
            maxLength={700}
            textAlignVertical="top"
            style={styles.textInput}
          />

          <Text style={styles.counter}>
            {workCompleted.length}/700
          </Text>
        </View>

        {/* Parts */}

        <View style={styles.partsHeader}>
          <View>
            <Text style={styles.sectionTitleNoMargin}>
              Parts Used
            </Text>

            <Text style={styles.optionalLabel}>
              Optional
            </Text>
          </View>

          <TouchableOpacity
            style={styles.addPartButton}
            activeOpacity={0.8}
            onPress={addPart}
          >
            <Plus
              size={16}
              color="#22C55E"
            />

            <Text style={styles.addPartText}>
              Add Part
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.partsContainer}>
          {parts.map((part, index) => (
            <View
              key={part.id}
              style={styles.partCard}
            >
              <View style={styles.partNumber}>
                <Package
                  size={17}
                  color="#60A5FA"
                />
              </View>

              <View style={styles.partInputs}>
                <Text style={styles.partLabel}>
                  Part {index + 1}
                </Text>

                <TextInput
                  value={part.name}
                  onChangeText={(value) =>
                    updatePart(
                      part.id,
                      "name",
                      value
                    )
                  }
                  placeholder="Part name"
                  placeholderTextColor="#475569"
                  style={styles.partNameInput}
                />

                <View style={styles.quantityRow}>
                  <Text style={styles.quantityLabel}>
                    Quantity
                  </Text>

                  <TextInput
                    value={part.quantity}
                    onChangeText={(value) =>
                      updatePart(
                        part.id,
                        "quantity",
                        value
                      )
                    }
                    keyboardType="number-pad"
                    placeholder="1"
                    placeholderTextColor="#475569"
                    style={styles.quantityInput}
                  />
                </View>
              </View>

              <TouchableOpacity
                style={styles.deleteButton}
                activeOpacity={0.8}
                onPress={() =>
                  removePart(part.id)
                }
              >
                <Trash2
                  size={17}
                  color="#EF4444"
                />
              </TouchableOpacity>
            </View>
          ))}
        </View>

        {/* Recommendation */}

        <View style={styles.recommendationHeader}>
          <Text style={styles.sectionTitleNoMargin}>
            Technician Recommendation
          </Text>

          <Text style={styles.optionalLabel}>
            Optional
          </Text>
        </View>

        <View style={styles.textArea}>
          <TextInput
            value={recommendation}
            onChangeText={setRecommendation}
            placeholder="Add maintenance advice or recommendations for the customer..."
            placeholderTextColor="#64748B"
            multiline
            maxLength={400}
            textAlignVertical="top"
            style={styles.textInput}
          />

          <Text style={styles.counter}>
            {recommendation.length}/400
          </Text>
        </View>

        {/* Summary */}

        <View style={styles.summaryCard}>
          <View style={styles.summaryIcon}>
            <Wrench
              size={20}
              color="#22C55E"
            />
          </View>

          <View style={styles.summaryContent}>
            <Text style={styles.summaryTitle}>
              Service Report Status
            </Text>

            <Text style={styles.summaryText}>
              {diagnosis.trim() &&
              workCompleted.trim()
                ? "Required information completed"
                : "Complete all required fields before saving"}
            </Text>
          </View>

          {diagnosis.trim() &&
            workCompleted.trim() && (
              <CheckCircle2
                size={21}
                color="#22C55E"
              />
            )}
        </View>

        {/* Save */}

        <TouchableOpacity
          style={[
            styles.saveButton,
            (!diagnosis.trim() ||
              !workCompleted.trim()) &&
              styles.saveButtonDisabled,
          ]}
          activeOpacity={0.85}
          onPress={handleSave}
        >
          <CheckCircle2
            size={19}
            color="#FFFFFF"
          />

          <Text style={styles.saveButtonText}>
            Save Service Notes
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#06101D",
  },

  content: {
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    paddingHorizontal: 18,
    paddingTop: 54,
    paddingBottom: 70,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 24,
  },

  backButton: {
    width: 44,
    height: 44,
    borderRadius: 13,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 13,
  },

  headerContent: {
    flex: 1,
  },

  title: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "800",
  },

  requestId: {
    color: "#64748B",
    fontSize: 9,
    marginTop: 3,
  },

  infoCard: {
    minHeight: 102,
    borderRadius: 17,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    marginBottom: 25,
  },

  infoIcon: {
    width: 52,
    height: 52,
    borderRadius: 15,
    backgroundColor: "#101F30",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },

  infoContent: {
    flex: 1,
  },

  infoTitle: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },

  infoText: {
    color: "#64748B",
    fontSize: 9,
    lineHeight: 15,
    marginTop: 5,
  },

  sectionTitle: {
    color: "#F8FAFC",
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 3,
  },

  sectionTitleNoMargin: {
    color: "#F8FAFC",
    fontSize: 14,
    fontWeight: "800",
  },

  requiredLabel: {
    color: "#F59E0B",
    fontSize: 8,
    fontWeight: "700",
    marginBottom: 9,
  },

  optionalLabel: {
    color: "#64748B",
    fontSize: 8,
    marginTop: 3,
  },

  textArea: {
    minHeight: 155,
    borderRadius: 15,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#1E2D42",
    paddingHorizontal: 13,
    paddingTop: 12,
    paddingBottom: 28,
    marginBottom: 24,
  },

  textInput: {
    minHeight: 110,
    color: "#FFFFFF",
    fontSize: 11,
    lineHeight: 18,
  },

  counter: {
    position: "absolute",
    right: 11,
    bottom: 9,
    color: "#475569",
    fontSize: 8,
  },

  partsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },

  addPartButton: {
    height: 36,
    borderRadius: 10,
    backgroundColor: "rgba(34,197,94,0.07)",
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.20)",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    gap: 5,
  },

  addPartText: {
    color: "#22C55E",
    fontSize: 9,
    fontWeight: "700",
  },

  partsContainer: {
    gap: 10,
    marginBottom: 25,
  },

  partCard: {
    minHeight: 128,
    borderRadius: 16,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    flexDirection: "row",
    padding: 12,
  },

  partNumber: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#101F30",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },

  partInputs: {
    flex: 1,
  },

  partLabel: {
    color: "#64748B",
    fontSize: 8,
    marginBottom: 5,
  },

  partNameInput: {
    height: 40,
    borderRadius: 10,
    backgroundColor: "#091522",
    borderWidth: 1,
    borderColor: "#1E2D42",
    color: "#FFFFFF",
    fontSize: 10,
    paddingHorizontal: 10,
  },

  quantityRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
  },

  quantityLabel: {
    color: "#64748B",
    fontSize: 9,
    marginRight: 9,
  },

  quantityInput: {
    width: 65,
    height: 36,
    borderRadius: 9,
    backgroundColor: "#091522",
    borderWidth: 1,
    borderColor: "#1E2D42",
    color: "#FFFFFF",
    fontSize: 10,
    textAlign: "center",
  },

  deleteButton: {
    width: 35,
    height: 35,
    borderRadius: 10,
    backgroundColor: "rgba(239,68,68,0.06)",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 7,
  },

  recommendationHeader: {
    marginBottom: 9,
  },

  summaryCard: {
    minHeight: 78,
    borderRadius: 15,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    marginBottom: 18,
  },

  summaryIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: "rgba(34,197,94,0.07)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 11,
  },

  summaryContent: {
    flex: 1,
  },

  summaryTitle: {
    color: "#E2E8F0",
    fontSize: 10,
    fontWeight: "700",
  },

  summaryText: {
    color: "#64748B",
    fontSize: 8,
    marginTop: 4,
  },

  saveButton: {
    height: 56,
    borderRadius: 12,
    backgroundColor: "#15803D",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },

  saveButtonDisabled: {
    opacity: 0.45,
  },

  saveButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
});