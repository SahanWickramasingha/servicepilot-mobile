import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  Camera,
  ChevronRight,
  Clock3,
  ImagePlus,
  MapPin,
  Wrench,
} from "lucide-react-native";
import {
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

type Priority = "low" | "medium" | "high" | "emergency";

export default function CreateRequestScreen() {
  const [serviceType, setServiceType] = useState(params.service ?? "");
  const [priority, setPriority] = useState<Priority>("medium");
  const [date, setDate] = useState("20 May 2026");
  const [time, setTime] = useState("10:00 AM");
  const [location, setLocation] = useState(
    "123, Main Street, Colombo 07"
  );
  const [description, setDescription] = useState("");
  const [photoCount, setPhotoCount] = useState(0);

  const canContinue = useMemo(() => {
    return (
      serviceType.trim().length > 0 &&
      description.trim().length >= 10 &&
      location.trim().length > 0
    );
  }, [serviceType, description, location]);

  const handleSelectService = () => {
    router.push("/select-service");
  };

  const handleSubmit = () => {
    if (!canContinue) {
      return;
    }

    /*
      Firebase integration will come later.

      Future flow:
      1. Validate form
      2. Capture GPS GeoPoint
      3. Upload photos
      4. Create Firestore job
      5. Status = pending
      6. Notify dispatcher
    */

    router.push("/bookings");
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
            onPress={() => router.back()}
            activeOpacity={0.8}
          >
            <ArrowLeft size={20} color="#FFFFFF" />
          </TouchableOpacity>

          <View style={styles.headerText}>
            <Text style={styles.title}>
              Create Service Request
            </Text>

            <Text style={styles.subtitle}>
              Tell us what service you need
            </Text>
          </View>
        </View>

        {/* Service Type */}
        <Text style={styles.sectionTitle}>
          Service Details
        </Text>

        <View style={styles.card}>
          <Text style={styles.label}>
            Service Type
          </Text>

          <TouchableOpacity
            style={styles.selector}
            activeOpacity={0.8}
            onPress={handleSelectService}
          >
            <View style={styles.selectorLeft}>
              <View style={styles.iconBox}>
                <Wrench size={20} color="#60A5FA" />
              </View>

              <View>
                <Text style={styles.selectorValue}>
                  {serviceType || "Select a service"}
                </Text>

                <Text style={styles.selectorHint}>
                  Choose the required service
                </Text>
              </View>
            </View>

            <ChevronRight
              size={19}
              color="#64748B"
            />
          </TouchableOpacity>

          {/* Demo service chooser until select-service screen is connected */}
          {!serviceType && (
            <TouchableOpacity
              style={styles.demoSelect}
              onPress={() => setServiceType("AC Repair")}
            >
              <Text style={styles.demoSelectText}>
                Use AC Repair for preview
              </Text>
            </TouchableOpacity>
          )}

          <Text style={[styles.label, styles.priorityLabel]}>
            Priority
          </Text>

          <View style={styles.priorityRow}>
            <PriorityButton
              label="Low"
              value="low"
              selected={priority === "low"}
              onPress={() => setPriority("low")}
            />

            <PriorityButton
              label="Medium"
              value="medium"
              selected={priority === "medium"}
              onPress={() => setPriority("medium")}
            />

            <PriorityButton
              label="High"
              value="high"
              selected={priority === "high"}
              onPress={() => setPriority("high")}
            />
          </View>

          <PriorityButton
            label="Emergency"
            value="emergency"
            selected={priority === "emergency"}
            onPress={() => setPriority("emergency")}
            fullWidth
          />

          {priority === "emergency" && (
            <View style={styles.emergencyInfo}>
              <AlertTriangle
                size={17}
                color="#F87171"
              />

              <Text style={styles.emergencyText}>
                Emergency requests may be prioritised by the dispatcher.
              </Text>
            </View>
          )}
        </View>

        {/* Schedule */}
        <Text style={styles.sectionTitle}>
          Preferred Schedule
        </Text>

        <View style={styles.card}>
          <View style={styles.twoColumnRow}>
            <TouchableOpacity
              style={styles.halfField}
              activeOpacity={0.8}
            >
              <View style={styles.smallFieldHeader}>
                <CalendarDays
                  size={17}
                  color="#60A5FA"
                />

                <Text style={styles.smallFieldLabel}>
                  Date
                </Text>
              </View>

              <Text style={styles.smallFieldValue}>
                {date}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.halfField}
              activeOpacity={0.8}
            >
              <View style={styles.smallFieldHeader}>
                <Clock3
                  size={17}
                  color="#A78BFA"
                />

                <Text style={styles.smallFieldLabel}>
                  Time
                </Text>
              </View>

              <Text style={styles.smallFieldValue}>
                {time}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Location */}
        <Text style={styles.sectionTitle}>
          Location
        </Text>

        <View style={styles.card}>
          <View style={styles.locationInput}>
            <MapPin
              size={20}
              color="#3B82F6"
            />

            <TextInput
              value={location}
              onChangeText={setLocation}
              placeholder="Enter service location"
              placeholderTextColor="#64748B"
              style={styles.locationTextInput}
            />
          </View>

          <TouchableOpacity
            style={styles.locationButton}
            activeOpacity={0.8}
          >
            <MapPin
              size={17}
              color="#3B82F6"
            />

            <Text style={styles.locationButtonText}>
              Use Current Location
            </Text>
          </TouchableOpacity>
        </View>

        {/* Description */}
        <Text style={styles.sectionTitle}>
          Description
        </Text>

        <View style={styles.card}>
          <Text style={styles.descriptionHint}>
            Explain the problem clearly so the technician can prepare.
          </Text>

          <View style={styles.descriptionBox}>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Example: AC is not cooling properly and makes a noise..."
              placeholderTextColor="#64748B"
              multiline
              textAlignVertical="top"
              maxLength={500}
              style={styles.descriptionInput}
            />

            <Text style={styles.characterCount}>
              {description.length}/500
            </Text>
          </View>
        </View>

        {/* Photos */}
        <Text style={styles.sectionTitle}>
          Upload Photos
        </Text>

        <View style={styles.card}>
          <Text style={styles.photoHint}>
            Add photos of the issue if available. You can review or remove
            them before submission.
          </Text>

          <View style={styles.photoRow}>
            <TouchableOpacity
              style={styles.addPhotoBox}
              activeOpacity={0.8}
              onPress={() =>
                setPhotoCount((current) =>
                  Math.min(current + 1, 4)
                )
              }
            >
              <ImagePlus
                size={26}
                color="#60A5FA"
              />

              <Text style={styles.addPhotoText}>
                Add Photo
              </Text>
            </TouchableOpacity>

            {Array.from({ length: photoCount }).map((_, index) => (
              <View
                key={index}
                style={styles.photoPreview}
              >
                <Camera
                  size={23}
                  color="#94A3B8"
                />

                <Text style={styles.photoNumber}>
                  {index + 1}
                </Text>
              </View>
            ))}
          </View>

          <Text style={styles.photoCountText}>
            {photoCount}/4 photos selected
          </Text>
        </View>

        {/* Review */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>
            Request Summary
          </Text>

          <SummaryRow
            label="Service"
            value={serviceType || "Not selected"}
          />

          <SummaryRow
            label="Priority"
            value={capitalize(priority)}
          />

          <SummaryRow
            label="Schedule"
            value={`${date} • ${time}`}
          />

          <SummaryRow
            label="Photos"
            value={`${photoCount} selected`}
          />
        </View>

        {/* Submit */}
        <TouchableOpacity
          style={[
            styles.submitButton,
            !canContinue && styles.submitButtonDisabled,
          ]}
          disabled={!canContinue}
          activeOpacity={0.85}
          onPress={handleSubmit}
        >
          <Text style={styles.submitButtonText}>
            Review & Submit
          </Text>

          <ChevronRight
            size={19}
            color="#FFFFFF"
          />
        </TouchableOpacity>

        {!canContinue && (
          <Text style={styles.validationText}>
            Select a service, enter a location, and add at least 10
            characters of description.
          </Text>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function PriorityButton({
  label,
  value,
  selected,
  onPress,
  fullWidth = false,
}: {
  label: string;
  value: Priority;
  selected: boolean;
  onPress: () => void;
  fullWidth?: boolean;
}) {
  const accent = getPriorityColor(value);

  return (
    <TouchableOpacity
      style={[
        styles.priorityButton,
        fullWidth && styles.priorityButtonFull,
        selected && {
          backgroundColor: `${accent}18`,
          borderColor: accent,
        },
      ]}
      activeOpacity={0.8}
      onPress={onPress}
    >
      <Text
        style={[
          styles.priorityText,
          selected && {
            color: accent,
          },
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function SummaryRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>
        {label}
      </Text>

      <Text style={styles.summaryValue}>
        {value}
      </Text>
    </View>
  );
}

function getPriorityColor(priority: Priority) {
  switch (priority) {
    case "low":
      return "#22C55E";

    case "medium":
      return "#F59E0B";

    case "high":
      return "#F97316";

    case "emergency":
      return "#EF4444";
  }
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
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
    marginBottom: 28,
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
    marginRight: 14,
  },

  headerText: {
    flex: 1,
  },

  title: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "800",
  },

  subtitle: {
    color: "#64748B",
    fontSize: 12,
    marginTop: 4,
  },

  sectionTitle: {
    color: "#F8FAFC",
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 10,
    marginLeft: 2,
  },

  card: {
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    borderRadius: 17,
    padding: 16,
    marginBottom: 24,
  },

  label: {
    color: "#E2E8F0",
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 9,
  },

  selector: {
    minHeight: 68,
    borderRadius: 13,
    backgroundColor: "#091522",
    borderWidth: 1,
    borderColor: "#1E2D42",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 13,
  },

  selectorLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },

  iconBox: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: "#101F30",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },

  selectorValue: {
    color: "#F8FAFC",
    fontSize: 13,
    fontWeight: "700",
  },

  selectorHint: {
    color: "#64748B",
    fontSize: 10,
    marginTop: 3,
  },

  demoSelect: {
    alignSelf: "flex-start",
    marginTop: 9,
  },

  demoSelectText: {
    color: "#3B82F6",
    fontSize: 10,
    fontWeight: "600",
  },

  priorityLabel: {
    marginTop: 20,
  },

  priorityRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 8,
  },

  priorityButton: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#243247",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#091522",
  },

  priorityButtonFull: {
    flex: 0,
    width: "100%",
  },

  priorityText: {
    color: "#94A3B8",
    fontSize: 11,
    fontWeight: "700",
  },

  emergencyInfo: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginTop: 12,
    backgroundColor: "rgba(239,68,68,0.06)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.16)",
    borderRadius: 10,
    padding: 10,
  },

  emergencyText: {
    flex: 1,
    color: "#FCA5A5",
    fontSize: 10,
    lineHeight: 16,
    marginLeft: 8,
  },

  twoColumnRow: {
    flexDirection: "row",
    gap: 10,
  },

  halfField: {
    flex: 1,
    minHeight: 75,
    borderRadius: 13,
    backgroundColor: "#091522",
    borderWidth: 1,
    borderColor: "#1E2D42",
    paddingHorizontal: 13,
    paddingVertical: 12,
  },

  smallFieldHeader: {
    flexDirection: "row",
    alignItems: "center",
  },

  smallFieldLabel: {
    color: "#64748B",
    fontSize: 10,
    marginLeft: 7,
  },

  smallFieldValue: {
    color: "#F8FAFC",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 10,
  },

  locationInput: {
    minHeight: 57,
    borderRadius: 12,
    backgroundColor: "#091522",
    borderWidth: 1,
    borderColor: "#1E2D42",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
  },

  locationTextInput: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 13,
    marginLeft: 10,
    height: "100%",
  },

  locationButton: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    marginTop: 13,
  },

  locationButtonText: {
    color: "#3B82F6",
    fontSize: 11,
    fontWeight: "700",
    marginLeft: 6,
  },

  descriptionHint: {
    color: "#64748B",
    fontSize: 10,
    lineHeight: 16,
    marginBottom: 10,
  },

  descriptionBox: {
    minHeight: 145,
    borderRadius: 12,
    backgroundColor: "#091522",
    borderWidth: 1,
    borderColor: "#1E2D42",
    paddingHorizontal: 13,
    paddingTop: 12,
    paddingBottom: 28,
  },

  descriptionInput: {
    color: "#FFFFFF",
    fontSize: 13,
    minHeight: 95,
  },

  characterCount: {
    position: "absolute",
    right: 11,
    bottom: 9,
    color: "#475569",
    fontSize: 9,
  },

  photoHint: {
    color: "#64748B",
    fontSize: 10,
    lineHeight: 16,
    marginBottom: 13,
  },

  photoRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 9,
  },

  addPhotoBox: {
    width: 92,
    height: 92,
    borderRadius: 13,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#31547F",
    backgroundColor: "#091522",
    alignItems: "center",
    justifyContent: "center",
  },

  addPhotoText: {
    color: "#60A5FA",
    fontSize: 10,
    fontWeight: "700",
    marginTop: 6,
  },

  photoPreview: {
    width: 92,
    height: 92,
    borderRadius: 13,
    backgroundColor: "#101F30",
    borderWidth: 1,
    borderColor: "#1E2D42",
    alignItems: "center",
    justifyContent: "center",
  },

  photoNumber: {
    color: "#64748B",
    fontSize: 9,
    marginTop: 5,
  },

  photoCountText: {
    color: "#475569",
    fontSize: 9,
    marginTop: 10,
  },

  summaryCard: {
    backgroundColor: "#0A1625",
    borderWidth: 1,
    borderColor: "#17263A",
    borderRadius: 15,
    paddingHorizontal: 15,
    paddingVertical: 14,
    marginBottom: 20,
  },

  summaryTitle: {
    color: "#E2E8F0",
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 10,
  },

  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
  },

  summaryLabel: {
    color: "#64748B",
    fontSize: 10,
  },

  summaryValue: {
    color: "#CBD5E1",
    fontSize: 10,
    fontWeight: "600",
    maxWidth: "65%",
    textAlign: "right",
  },

  submitButton: {
    height: 56,
    borderRadius: 12,
    backgroundColor: "#2563EB",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },

  submitButtonDisabled: {
    opacity: 0.42,
  },

  submitButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },

  validationText: {
    color: "#64748B",
    fontSize: 10,
    lineHeight: 16,
    textAlign: "center",
    marginTop: 10,
  },
});