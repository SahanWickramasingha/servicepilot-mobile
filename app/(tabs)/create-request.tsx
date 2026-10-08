import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { AvailabilityBadge } from "@/src/components/technicians/AvailabilityBadge";
import { availabilityDisplay } from "@/functions/src/domain/availability";
import DateTimePicker, {
  DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import {
  ArrowLeft,
  CalendarDays,
  Camera,
  Clock3,
  ImagePlus,
  MapPin,
  Save,
  Star,
  UserRound,
  Wrench,
} from "lucide-react-native";
import {
  ActivityIndicator,
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

import {
  RequestPriority,
  SERVICE_CATEGORIES,
  ServiceCategory,
  getPriorityColor,
  getPriorityLabel,
} from "@/src/constants/serviceRequests";
import { auth } from "@/src/firebase/config";
import { createServiceRequest } from "@/src/services/request.service";
import {
  getUserProfile,
  UserProfile,
} from "@/src/services/user.service";
import {
  subscribeToApprovedTechnician,
  PublicTechnicianProfile,
} from "@/src/services/technician.service";

const TIME_SLOTS = [
  "09:00 AM",
  "10:00 AM",
  "11:00 AM",
  "12:00 PM",
  "01:00 PM",
  "02:00 PM",
  "03:00 PM",
  "04:00 PM",
  "05:00 PM",
];

function getTodayStart() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function formatDateForStorage(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateForDisplay(date: Date) {
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function isSameCalendarDay(first: Date, second: Date) {
  return (
    first.getFullYear() === second.getFullYear() &&
    first.getMonth() === second.getMonth() &&
    first.getDate() === second.getDate()
  );
}

function buildScheduledDate(date: Date, timeSlot: string) {
  const match = timeSlot.match(/^(\d{2}):(\d{2}) (AM|PM)$/);

  if (!match) {
    return null;
  }

  const [, hourValue, minuteValue, meridiem] = match;
  let hours = Number(hourValue);

  if (meridiem === "PM" && hours !== 12) {
    hours += 12;
  }

  if (meridiem === "AM" && hours === 12) {
    hours = 0;
  }

  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    hours,
    Number(minuteValue),
    0,
    0
  );
}

function isPastTimeSlot(date: Date | null, timeSlot: string) {
  if (!date || !isSameCalendarDay(date, new Date())) {
    return false;
  }

  const scheduledDate = buildScheduledDate(date, timeSlot);
  return !scheduledDate || scheduledDate.getTime() <= Date.now();
}

export default function CreateRequestScreen() {
  const params = useLocalSearchParams<{
    service?: string;
    technicianId?: string;
  }>();

  const initialCategory = SERVICE_CATEGORIES.includes(
    params.service as ServiceCategory
  )
    ? (params.service as ServiceCategory)
    : "Air Conditioning";

  const [profile, setProfile] =
    useState<UserProfile | null>(null);
  const [technician, setTechnician] =
    useState<PublicTechnicianProfile | null>(null);
  const [serviceCategory, setServiceCategory] =
    useState<ServiceCategory>(initialCategory);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [address, setAddress] = useState("");
  const [division, setDivision] = useState("");
  const [selectedDate, setSelectedDate] =
    useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] =
    useState(false);
  const [preferredTime, setPreferredTime] = useState("");
  const [priority, setPriority] =
    useState<RequestPriority>("normal");
  const [photoCount, setPhotoCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const sessionVersion = useRef(0);
  const submissionVersion = useRef<number | null>(null);

  useEffect(() => {
    sessionVersion.current = sessionVersion.current + 1;
    let stopTechnician: (() => void) | undefined;
    const stopAuth = onAuthStateChanged(auth, (user) => {
      stopTechnician?.();
      const version = ++sessionVersion.current;
      const isCurrent = () => version === sessionVersion.current && auth.currentUser?.uid === user?.uid;
      setProfile(null); setTechnician(null); setErrorMessage(""); setSuccessMessage("");
      setAddress(""); setDivision(""); setSubmitting(false); setLoading(true);
      let profileLoaded = false, technicianLoaded = false;
      const finishLoading = () => { if (isCurrent() && profileLoaded && technicianLoaded) setLoading(false); };
      if (!user) { setErrorMessage("Please sign in again."); setLoading(false); return; }
      void getUserProfile(user.uid).then((item) => {
        if (!isCurrent()) return;
        if (!item || item.role !== "customer") { setErrorMessage("A customer account is required."); return; }
        setProfile(item); setAddress(item.address ?? "");
      }, () => { if (isCurrent()) setErrorMessage("Unable to load your profile."); })
        .finally(() => { profileLoaded = true; finishLoading(); });
      if (!params.technicianId) {
        technicianLoaded = true; setErrorMessage("Please select an approved technician."); finishLoading(); return;
      }
      stopTechnician = subscribeToApprovedTechnician(String(params.technicianId), (item) => {
        if (!isCurrent()) return;
        if (!technicianLoaded) setDivision(item?.serviceDivision ?? "");
        technicianLoaded = true; setTechnician(item);
        if (!item) setErrorMessage("This technician is no longer approved for requests.");
        finishLoading();
      }, () => {
        if (!isCurrent()) return;
        technicianLoaded = true; setTechnician(null); setErrorMessage("Unable to verify technician availability. Check your connection."); finishLoading();
      });
    });
    return () => { sessionVersion.current++; stopTechnician?.(); stopAuth(); };
  }, [params.technicianId]);

  const preferredDate = selectedDate
    ? formatDateForStorage(selectedDate)
    : "";
  const scheduledAt =
    selectedDate && preferredTime
      ? buildScheduledDate(selectedDate, preferredTime)
      : null;

  const validationMessage = useMemo(() => {
    if (!serviceCategory.trim()) {
      return "Please select a service category.";
    }

    if (!technician) {
      return "Please select an approved technician.";
    }

    if (!title.trim()) {
      return "Please enter a problem title.";
    }

    if (!description.trim()) {
      return "Please describe the problem.";
    }

    if (!address.trim()) {
      return "Please enter the service location.";
    }

    if (!selectedDate) {
      return "Please select a preferred date.";
    }

    if (!availabilityDisplay(technician.availability).canRequest) {
      return availabilityDisplay(technician.availability).description;
    }

    if (!preferredTime) {
      return "Please select a preferred time.";
    }

    if (!scheduledAt || scheduledAt.getTime() <= Date.now()) {
      return "Please select a future date and time.";
    }

    return "";
  }, [
    serviceCategory,
    technician,
    title,
    description,
    address,
    selectedDate,
    preferredTime,
    scheduledAt,
  ]);

  const canSubmit =
    !validationMessage && !submitting && !!profile;

  const handleSubmit = async () => {
    const version = sessionVersion.current;
    if (submissionVersion.current === version) return;
    const isCurrent = () => version === sessionVersion.current && auth.currentUser?.uid === profile?.uid;
    if (!profile || !technician || validationMessage) {
      setErrorMessage(validationMessage);
      return;
    }

    if (!scheduledAt) {
      setErrorMessage("Please select a future date and time.");
      return;
    }

    try {
      submissionVersion.current = version;
      setSubmitting(true);
      setErrorMessage("");
      setSuccessMessage("");

      const requestId = await createServiceRequest({
        profile,
        serviceCategory,
        title,
        description,
        address,
        technician,
        division,
        preferredDate,
        preferredTime,
        scheduledAt,
        priority,
        imageUrls: [],
      });

      if (!isCurrent()) return;

      setSuccessMessage("Service request created.");

      router.replace({
        pathname: "/request-details",
        params: { id: requestId },
      });
    } catch (error: any) {
      if (!isCurrent()) return;
      console.error("Create request error:", error);
      setErrorMessage(
        error?.message ||
          "Unable to create service request."
      );
    } finally {
      if (submissionVersion.current === version) submissionVersion.current = null;
      if (isCurrent()) setSubmitting(false);
    }
  };

  const handleDateChange = (
    event: DateTimePickerEvent,
    nextDate?: Date
  ) => {
    if (Platform.OS === "android") {
      setShowDatePicker(false);
    }

    if (event.type === "dismissed" || !nextDate) {
      return;
    }

    const normalizedDate = new Date(
      nextDate.getFullYear(),
      nextDate.getMonth(),
      nextDate.getDate()
    );

    setSelectedDate(normalizedDate);

    if (preferredTime && isPastTimeSlot(normalizedDate, preferredTime)) {
      setPreferredTime("");
    }
  };

  if (loading) {
    return (
      <View style={styles.centerScreen}>
        <ActivityIndicator color="#3B82F6" />
      </View>
    );
  }

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

        {!!errorMessage && (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>
              {errorMessage}
            </Text>
          </View>
        )}

        {!!successMessage && (
          <View style={styles.successCard}>
            <Text style={styles.successText}>
              {successMessage}
            </Text>
          </View>
        )}

        <Text style={styles.sectionTitle}>
          Selected Technician
        </Text>
        {technician ? (
          <View style={styles.selectedTechnicianCard}>
            <View style={styles.technicianAvatar}>
              <UserRound size={26} color="#FFFFFF" />
            </View>
            <View style={styles.technicianContent}>
              <Text style={styles.technicianName}>
                {technician.fullName}
              </Text>
              <AvailabilityBadge availability={technician.availability} showDescription />
              <Text style={styles.technicianMeta}>
                {technician.specialization}
              </Text>
              <View style={styles.technicianRow}>
                <Star
                  size={13}
                  color="#F59E0B"
                  fill={
                    technician.averageRating > 0
                      ? "#F59E0B"
                      : "transparent"
                  }
                />
                <Text style={styles.technicianSmallText}>
                  {technician.averageRating > 0
                    ? technician.averageRating.toFixed(1)
                    : "New"}{" "}
                  • {technician.serviceDivision}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.changeTechnicianButton}
              activeOpacity={0.8}
              onPress={() => router.push("/technicians")}
            >
              <Text style={styles.changeTechnicianText}>
                Change
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.selectTechnicianCard}
            activeOpacity={0.85}
            onPress={() => router.push("/technicians")}
          >
            <UserRound size={24} color="#60A5FA" />
            <Text style={styles.selectTechnicianText}>
              Select an approved technician
            </Text>
          </TouchableOpacity>
        )}

        <Text style={styles.sectionTitle}>
          Service Category
        </Text>
        <View style={styles.categoryGrid}>
          {SERVICE_CATEGORIES.map((category) => (
            <TouchableOpacity
              key={category}
              style={[
                styles.categoryButton,
                serviceCategory === category &&
                  styles.categoryButtonActive,
              ]}
              activeOpacity={0.8}
              onPress={() => setServiceCategory(category)}
            >
              <Wrench
                size={16}
                color={
                  serviceCategory === category
                    ? "#FFFFFF"
                    : "#60A5FA"
                }
              />
              <Text
                style={[
                  styles.categoryText,
                  serviceCategory === category &&
                    styles.categoryTextActive,
                ]}
              >
                {category}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.sectionTitle}>
          Request Details
        </Text>
        <View style={styles.card}>
          <FieldLabel label="Problem Title" />
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Example: AC is not cooling"
            placeholderTextColor="#64748B"
            style={styles.input}
          />

          <FieldLabel label="Description" />
          <View style={styles.descriptionBox}>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Explain the issue clearly..."
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

        <Text style={styles.sectionTitle}>
          Service Location
        </Text>
        <View style={styles.card}>
          <View style={styles.iconInput}>
            <MapPin size={20} color="#3B82F6" />
            <TextInput
              value={address}
              onChangeText={setAddress}
              placeholder="Enter service location"
              placeholderTextColor="#64748B"
              multiline
              style={styles.iconTextInput}
            />
          </View>
          <FieldLabel label="Division" />
          <View style={styles.iconInput}>
            <MapPin size={20} color="#22D3EE" />
            <TextInput
              value={division}
              onChangeText={setDivision}
              placeholder="Service division"
              placeholderTextColor="#64748B"
              style={styles.iconTextInput}
            />
          </View>
        </View>

        <Text style={styles.sectionTitle}>
          Preferred Schedule
        </Text>
        <View style={styles.card}>
          <View style={styles.scheduleField}>
            <View style={styles.smallFieldHeader}>
              <CalendarDays size={17} color="#60A5FA" />
              <Text style={styles.smallFieldLabel}>
                Preferred Date
              </Text>
            </View>

            <TouchableOpacity
              style={styles.datePickerButton}
              activeOpacity={0.85}
              onPress={() => setShowDatePicker(true)}
            >
              <Text
                style={[
                  styles.datePickerText,
                  !selectedDate && styles.datePickerPlaceholder,
                ]}
              >
                {selectedDate
                  ? formatDateForDisplay(selectedDate)
                  : "Select a date"}
              </Text>
            </TouchableOpacity>

            {showDatePicker && (
              <DateTimePicker
                value={selectedDate ?? getTodayStart()}
                mode="date"
                display={Platform.OS === "ios" ? "inline" : "calendar"}
                minimumDate={getTodayStart()}
                onChange={handleDateChange}
              />
            )}
          </View>

          <View style={styles.scheduleField}>
            <View style={styles.smallFieldHeader}>
              <Clock3 size={17} color="#A78BFA" />
              <Text style={styles.smallFieldLabel}>
                Preferred Time
              </Text>
            </View>

            <View style={styles.timeSlotGrid}>
              {TIME_SLOTS.map((slot) => {
                const disabled = isPastTimeSlot(selectedDate, slot);
                const selected = preferredTime === slot;

                return (
                  <TouchableOpacity
                    key={slot}
                    style={[
                      styles.timeSlot,
                      selected && styles.timeSlotActive,
                      disabled && styles.timeSlotDisabled,
                    ]}
                    activeOpacity={0.85}
                    disabled={disabled}
                    onPress={() => setPreferredTime(slot)}
                  >
                    <Text
                      style={[
                        styles.timeSlotText,
                        selected && styles.timeSlotTextActive,
                        disabled && styles.timeSlotTextDisabled,
                      ]}
                    >
                      {slot}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {!selectedDate && (
            <Text style={styles.inlineValidationText}>
              Date is required.
            </Text>
          )}

          {selectedDate && !preferredTime && (
            <Text style={styles.inlineValidationText}>
              Select one available time slot.
            </Text>
          )}
        </View>

        <Text style={styles.sectionTitle}>Priority</Text>
        <View style={styles.priorityRow}>
          {(["normal", "urgent"] as RequestPriority[]).map(
            (item) => {
              const color = getPriorityColor(item);

              return (
                <TouchableOpacity
                  key={item}
                  style={[
                    styles.priorityButton,
                    priority === item && {
                      backgroundColor: `${color}18`,
                      borderColor: color,
                    },
                  ]}
                  activeOpacity={0.8}
                  onPress={() => setPriority(item)}
                >
                  <Text
                    style={[
                      styles.priorityText,
                      priority === item && { color },
                    ]}
                  >
                    {getPriorityLabel(item)}
                  </Text>
                </TouchableOpacity>
              );
            }
          )}
        </View>

        <Text style={styles.sectionTitle}>
          Photos Optional
        </Text>
        <View style={styles.card}>
          <Text style={styles.photoHint}>
            Photo upload UI is ready for a future storage
            integration. Selected previews are not uploaded yet.
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
              <ImagePlus size={26} color="#60A5FA" />
              <Text style={styles.addPhotoText}>
                Add Photo
              </Text>
            </TouchableOpacity>

            {Array.from({ length: photoCount }).map(
              (_, index) => (
                <View
                  key={index}
                  style={styles.photoPreview}
                >
                  <Camera size={23} color="#94A3B8" />
                  <Text style={styles.photoNumber}>
                    {index + 1}
                  </Text>
                </View>
              )
            )}
          </View>
        </View>

        <TouchableOpacity
          style={[
            styles.submitButton,
            !canSubmit && styles.submitButtonDisabled,
          ]}
          disabled={!canSubmit}
          activeOpacity={0.85}
          onPress={handleSubmit}
        >
          {submitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Save size={19} color="#FFFFFF" />
              <Text style={styles.submitButtonText}>
                Submit Request
              </Text>
            </>
          )}
        </TouchableOpacity>

        {!!validationMessage && (
          <Text style={styles.validationText}>
            {validationMessage}
          </Text>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function FieldLabel({ label }: { label: string }) {
  return <Text style={styles.label}>{label}</Text>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#06101D" },
  centerScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#06101D",
  },
  content: {
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    paddingHorizontal: 18,
    paddingTop: 54,
    paddingBottom: 120,
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
    marginRight: 14,
  },
  headerText: { flex: 1 },
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
  errorCard: {
    backgroundColor: "rgba(239,68,68,0.08)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.22)",
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  errorText: {
    color: "#FCA5A5",
    fontSize: 12,
    textAlign: "center",
  },
  successCard: {
    backgroundColor: "rgba(34,197,94,0.08)",
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.22)",
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  successText: {
    color: "#86EFAC",
    fontSize: 12,
    textAlign: "center",
  },
  sectionTitle: {
    color: "#F8FAFC",
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 10,
    marginLeft: 2,
  },
  selectedTechnicianCard: {
    minHeight: 94,
    borderRadius: 17,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    marginBottom: 24,
  },
  technicianAvatar: {
    width: 52,
    height: 52,
    borderRadius: 17,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  technicianContent: { flex: 1 },
  technicianName: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  technicianMeta: {
    color: "#94A3B8",
    fontSize: 10,
    marginTop: 4,
  },
  technicianRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 6,
  },
  technicianSmallText: {
    color: "#64748B",
    fontSize: 9,
    flex: 1,
  },
  changeTechnicianButton: {
    minHeight: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#31547F",
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  changeTechnicianText: {
    color: "#60A5FA",
    fontSize: 10,
    fontWeight: "800",
  },
  selectTechnicianCard: {
    minHeight: 76,
    borderRadius: 16,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    marginBottom: 24,
  },
  selectTechnicianText: {
    color: "#60A5FA",
    fontSize: 12,
    fontWeight: "800",
  },
  categoryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 22,
  },
  categoryButton: {
    minHeight: 42,
    borderRadius: 11,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 11,
  },
  categoryButtonActive: {
    backgroundColor: "#2563EB",
    borderColor: "#2563EB",
  },
  categoryText: {
    color: "#CBD5E1",
    fontSize: 11,
    fontWeight: "700",
  },
  categoryTextActive: { color: "#FFFFFF" },
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
    marginBottom: 8,
  },
  input: {
    height: 54,
    borderRadius: 12,
    backgroundColor: "#091522",
    borderWidth: 1,
    borderColor: "#1E2D42",
    color: "#FFFFFF",
    fontSize: 13,
    paddingHorizontal: 13,
    marginBottom: 16,
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
  iconInput: {
    minHeight: 66,
    borderRadius: 12,
    backgroundColor: "#091522",
    borderWidth: 1,
    borderColor: "#1E2D42",
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 14,
    paddingTop: 14,
  },
  iconTextInput: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 13,
    marginLeft: 10,
    minHeight: 42,
  },
  twoColumnRow: { flexDirection: "row", gap: 10 },
  scheduleField: {
    marginBottom: 16,
  },
  halfField: {
    flex: 1,
    minHeight: 82,
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
  smallInput: {
    color: "#F8FAFC",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 8,
    padding: 0,
  },
  datePickerButton: {
    minHeight: 54,
    borderRadius: 12,
    backgroundColor: "#091522",
    borderWidth: 1,
    borderColor: "#1E2D42",
    justifyContent: "center",
    paddingHorizontal: 13,
    marginTop: 9,
  },
  datePickerText: {
    color: "#F8FAFC",
    fontSize: 13,
    fontWeight: "800",
  },
  datePickerPlaceholder: {
    color: "#64748B",
    fontWeight: "600",
  },
  timeSlotGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
  },
  timeSlot: {
    minWidth: "30%",
    minHeight: 40,
    borderRadius: 11,
    backgroundColor: "#091522",
    borderWidth: 1,
    borderColor: "#1E2D42",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  timeSlotActive: {
    backgroundColor: "#2563EB",
    borderColor: "#60A5FA",
  },
  timeSlotDisabled: {
    opacity: 0.38,
  },
  timeSlotText: {
    color: "#CBD5E1",
    fontSize: 11,
    fontWeight: "800",
  },
  timeSlotTextActive: {
    color: "#FFFFFF",
  },
  timeSlotTextDisabled: {
    color: "#64748B",
  },
  inlineValidationText: {
    color: "#FCA5A5",
    fontSize: 10,
    lineHeight: 16,
    marginTop: -4,
  },
  priorityRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 24,
  },
  priorityButton: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#243247",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#091522",
  },
  priorityText: {
    color: "#94A3B8",
    fontSize: 11,
    fontWeight: "700",
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
  submitButton: {
    height: 56,
    borderRadius: 12,
    backgroundColor: "#2563EB",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  submitButtonDisabled: { opacity: 0.42 },
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
