import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Star,
  UserRound,
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

export default function ReviewTechnicianScreen() {
  const params = useLocalSearchParams<{
    id?: string;
  }>();

  const requestId = params.id ?? "REQ-2026-0010";

  const [rating, setRating] = useState(0);
  const [review, setReview] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const ratingLabel = useMemo(() => {
    switch (rating) {
      case 1:
        return "Poor";

      case 2:
        return "Fair";

      case 3:
        return "Good";

      case 4:
        return "Very Good";

      case 5:
        return "Excellent";

      default:
        return "Tap a star to rate";
    }
  }, [rating]);

  const canSubmit = rating > 0 && !submitted;

  const handleSubmit = () => {
    if (!canSubmit) {
      return;
    }

    /*
      Firebase integration later:

      1. Save rating
      2. Save optional review
      3. Link review to requestId
      4. Link review to technicianId
      5. Update technician average rating
      6. Mark request as reviewed
    */

    setSubmitted(true);
  };

  if (submitted) {
    return (
      <View style={styles.container}>
        <StatusBar
          barStyle="light-content"
          backgroundColor="#06101D"
        />

        <View style={styles.successContainer}>
          <View style={styles.successIcon}>
            <CheckCircle2
              size={58}
              color="#22C55E"
              strokeWidth={1.8}
            />
          </View>

          <Text style={styles.successTitle}>
            Thank You!
          </Text>

          <Text style={styles.successText}>
            Your feedback has been submitted successfully.
          </Text>

          <Text style={styles.successRequest}>
            {requestId}
          </Text>

          <TouchableOpacity
            style={styles.doneButton}
            activeOpacity={0.85}
            onPress={() => router.replace("/history")}
          >
            <Text style={styles.doneButtonText}>
              Back to Service History
            </Text>
          </TouchableOpacity>
        </View>
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
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            activeOpacity={0.8}
            onPress={() => router.back()}
          >
            <ArrowLeft
              size={20}
              color="#FFFFFF"
            />
          </TouchableOpacity>

          <View style={styles.headerText}>
            <Text style={styles.title}>
              Review Technician
            </Text>

            <Text style={styles.subtitle}>
              {requestId}
            </Text>
          </View>
        </View>

        {/* Technician */}
        <View style={styles.technicianCard}>
          <View style={styles.avatar}>
            <UserRound
              size={42}
              color="#FFFFFF"
              strokeWidth={1.8}
            />
          </View>

          <Text style={styles.technicianName}>
            Alex Smith
          </Text>

          <Text style={styles.technicianRole}>
            Service Technician
          </Text>

          <View style={styles.completedBadge}>
            <CheckCircle2
              size={14}
              color="#22C55E"
            />

            <Text style={styles.completedText}>
              Service Completed
            </Text>
          </View>
        </View>

        {/* Rating */}
        <View style={styles.ratingCard}>
          <Text style={styles.sectionTitle}>
            How was your service experience?
          </Text>

          <Text style={styles.ratingDescription}>
            Your feedback helps us maintain high service quality.
          </Text>

          <View style={styles.starsRow}>
            {[1, 2, 3, 4, 5].map((star) => (
              <TouchableOpacity
                key={star}
                style={styles.starButton}
                activeOpacity={0.75}
                onPress={() => setRating(star)}
              >
                <Star
                  size={40}
                  color={
                    star <= rating
                      ? "#F59E0B"
                      : "#475569"
                  }
                  fill={
                    star <= rating
                      ? "#F59E0B"
                      : "transparent"
                  }
                  strokeWidth={1.8}
                />
              </TouchableOpacity>
            ))}
          </View>

          <Text
            style={[
              styles.ratingLabel,
              rating > 0 && styles.ratingLabelActive,
            ]}
          >
            {ratingLabel}
          </Text>
        </View>

        {/* Review */}
        <Text style={styles.formTitle}>
          Write a Review
        </Text>

        <View style={styles.reviewCard}>
          <Text style={styles.reviewHint}>
            Optional
          </Text>

          <View style={styles.textArea}>
            <TextInput
              value={review}
              onChangeText={setReview}
              placeholder="Share your experience with this technician..."
              placeholderTextColor="#64748B"
              multiline
              textAlignVertical="top"
              maxLength={300}
              style={styles.reviewInput}
            />

            <Text style={styles.characterCount}>
              {review.length}/300
            </Text>
          </View>
        </View>

        {/* Tips */}
        <View style={styles.tipsCard}>
          <Text style={styles.tipsTitle}>
            Your review can include
          </Text>

          <Text style={styles.tipText}>
            • Service quality and professionalism
          </Text>

          <Text style={styles.tipText}>
            • Communication and punctuality
          </Text>

          <Text style={styles.tipText}>
            • Overall experience
          </Text>
        </View>

        {/* Submit */}
        <TouchableOpacity
          style={[
            styles.submitButton,
            !canSubmit && styles.submitButtonDisabled,
          ]}
          activeOpacity={0.85}
          disabled={!canSubmit}
          onPress={handleSubmit}
        >
          <Star
            size={19}
            color="#FFFFFF"
          />

          <Text style={styles.submitButtonText}>
            Submit Review
          </Text>
        </TouchableOpacity>

        {rating === 0 && (
          <Text style={styles.validationText}>
            Please select a star rating before submitting.
          </Text>
        )}
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
    paddingBottom: 120,
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
    fontSize: 11,
    marginTop: 4,
  },

  technicianCard: {
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    borderRadius: 20,
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 28,
    marginBottom: 22,
  },

  avatar: {
    width: 94,
    height: 94,
    borderRadius: 47,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 4,
    borderColor: "rgba(59,130,246,0.18)",
  },

  technicianName: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "800",
    marginTop: 15,
  },

  technicianRole: {
    color: "#64748B",
    fontSize: 11,
    marginTop: 4,
  },

  completedBadge: {
    height: 29,
    borderRadius: 10,
    backgroundColor: "rgba(34,197,94,0.08)",
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.20)",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 9,
    gap: 6,
    marginTop: 12,
  },

  completedText: {
    color: "#22C55E",
    fontSize: 9,
    fontWeight: "700",
  },

  ratingCard: {
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    borderRadius: 18,
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 25,
    marginBottom: 23,
  },

  sectionTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
    textAlign: "center",
  },

  ratingDescription: {
    color: "#64748B",
    fontSize: 10,
    lineHeight: 16,
    textAlign: "center",
    marginTop: 7,
  },

  starsRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 22,
  },

  starButton: {
    paddingHorizontal: 5,
    paddingVertical: 5,
  },

  ratingLabel: {
    color: "#64748B",
    fontSize: 11,
    fontWeight: "600",
    marginTop: 12,
  },

  ratingLabelActive: {
    color: "#F59E0B",
  },

  formTitle: {
    color: "#F8FAFC",
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 10,
    marginLeft: 2,
  },

  reviewCard: {
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    borderRadius: 17,
    padding: 15,
    marginBottom: 18,
  },

  reviewHint: {
    color: "#64748B",
    fontSize: 9,
    marginBottom: 9,
  },

  textArea: {
    minHeight: 155,
    borderRadius: 12,
    backgroundColor: "#091522",
    borderWidth: 1,
    borderColor: "#1E2D42",
    paddingHorizontal: 13,
    paddingTop: 12,
    paddingBottom: 28,
  },

  reviewInput: {
    color: "#FFFFFF",
    fontSize: 12,
    lineHeight: 18,
    minHeight: 105,
  },

  characterCount: {
    position: "absolute",
    right: 11,
    bottom: 9,
    color: "#475569",
    fontSize: 9,
  },

  tipsCard: {
    borderRadius: 14,
    backgroundColor: "rgba(37,99,235,0.05)",
    borderWidth: 1,
    borderColor: "rgba(37,99,235,0.15)",
    paddingHorizontal: 14,
    paddingVertical: 13,
    marginBottom: 20,
  },

  tipsTitle: {
    color: "#CBD5E1",
    fontSize: 10,
    fontWeight: "700",
    marginBottom: 7,
  },

  tipText: {
    color: "#64748B",
    fontSize: 9,
    lineHeight: 16,
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
    opacity: 0.4,
  },

  submitButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },

  validationText: {
    color: "#64748B",
    fontSize: 10,
    textAlign: "center",
    marginTop: 10,
  },

  successContainer: {
    flex: 1,
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },

  successIcon: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: "rgba(34,197,94,0.08)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 22,
  },

  successTitle: {
    color: "#FFFFFF",
    fontSize: 27,
    fontWeight: "800",
  },

  successText: {
    color: "#94A3B8",
    fontSize: 12,
    lineHeight: 19,
    textAlign: "center",
    marginTop: 9,
  },

  successRequest: {
    color: "#3B82F6",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 9,
  },

  doneButton: {
    width: "100%",
    height: 54,
    borderRadius: 12,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 28,
  },

  doneButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
});