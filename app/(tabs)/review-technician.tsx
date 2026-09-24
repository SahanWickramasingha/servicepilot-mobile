import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Star,
  UserRound,
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

import { auth } from "@/src/firebase/config";
import {
  getServiceRequest,
  ServiceRequest,
} from "@/src/services/request.service";
import {
  getReviewForRequest,
  submitServiceReview,
} from "@/src/services/review.service";

export default function ReviewTechnicianScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const requestId = String(params.id ?? "");
  const [request, setRequest] =
    useState<ServiceRequest | null>(null);
  const [rating, setRating] = useState(0);
  const [review, setReview] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const currentUser = auth.currentUser;

    if (!currentUser || !requestId) {
      setErrorMessage("Please sign in again.");
      setLoading(false);
      return;
    }

    const customerId = currentUser.uid;

    async function loadReviewContext() {
      try {
        const serviceRequest = await getServiceRequest(
          requestId
        );

        if (!serviceRequest) {
          setErrorMessage("Request not found.");
          return;
        }

        if (serviceRequest.customerId !== customerId) {
          setErrorMessage(
            "You do not have access to review this request."
          );
          return;
        }

        if (serviceRequest.status !== "completed") {
          setErrorMessage(
            "Only completed requests can be reviewed."
          );
          return;
        }

        if (!serviceRequest.assignedTechnicianId) {
          setErrorMessage(
            "This request has no assigned technician to review."
          );
          return;
        }

        const existingReview =
          await getReviewForRequest(
            requestId,
            customerId
          );

        if (existingReview) {
          setSubmitted(true);
        }

        setRequest(serviceRequest);
      } catch (error) {
        console.error("Review load error:", error);
        setErrorMessage("Unable to load review details.");
      } finally {
        setLoading(false);
      }
    }

    loadReviewContext();
  }, [requestId]);

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

  const canSubmit =
    rating > 0 &&
    !!request?.assignedTechnicianId &&
    !submitted &&
    !submitting;

  const handleSubmit = async () => {
    const currentUser = auth.currentUser;

    if (
      !currentUser ||
      !request ||
      !request.assignedTechnicianId ||
      !canSubmit
    ) {
      return;
    }

    try {
      setSubmitting(true);
      setErrorMessage("");

      await submitServiceReview({
        requestId: request.id,
        customerId: currentUser.uid,
        technicianId: request.assignedTechnicianId,
        rating,
        comment: review,
      });

      setSubmitted(true);
    } catch (error: any) {
      console.error("Review submit error:", error);
      setErrorMessage(
        error?.message || "Unable to submit review."
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centerScreen}>
        <ActivityIndicator color="#3B82F6" />
      </View>
    );
  }

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
            Thank You
          </Text>
          <Text style={styles.successText}>
            Your feedback has been submitted for this
            completed request.
          </Text>
          <Text style={styles.successRequest}>
            {requestId}
          </Text>
          <TouchableOpacity
            style={styles.doneButton}
            activeOpacity={0.85}
            onPress={() => router.replace("/bookings")}
          >
            <Text style={styles.doneButtonText}>
              Back to Requests
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
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            activeOpacity={0.8}
            onPress={() => router.back()}
          >
            <ArrowLeft size={20} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={styles.headerText}>
            <Text style={styles.title}>
              Review Technician
            </Text>
            <Text style={styles.subtitle}>{requestId}</Text>
          </View>
        </View>

        {!!errorMessage && (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>
              {errorMessage}
            </Text>
          </View>
        )}

        {request && !errorMessage && (
          <>
            <View style={styles.technicianCard}>
              <View style={styles.avatar}>
                <UserRound
                  size={42}
                  color="#FFFFFF"
                  strokeWidth={1.8}
                />
              </View>
              <Text style={styles.technicianName}>
                {request.assignedTechnicianName}
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

            <View style={styles.ratingCard}>
              <Text style={styles.sectionTitle}>
                How was your service experience?
              </Text>
              <Text style={styles.ratingDescription}>
                Your feedback helps maintain service quality.
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

            <Text style={styles.formTitle}>
              Write a Review
            </Text>
            <View style={styles.reviewCard}>
              <View style={styles.textArea}>
                <TextInput
                  value={review}
                  onChangeText={setReview}
                  placeholder="Share your experience..."
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

            <TouchableOpacity
              style={[
                styles.submitButton,
                !canSubmit && styles.submitButtonDisabled,
              ]}
              activeOpacity={0.85}
              disabled={!canSubmit}
              onPress={handleSubmit}
            >
              {submitting ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Star size={19} color="#FFFFFF" />
                  <Text style={styles.submitButtonText}>
                    Submit Review
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
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
  headerText: { flex: 1 },
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
  starButton: { paddingHorizontal: 5, paddingVertical: 5 },
  ratingLabel: {
    color: "#64748B",
    fontSize: 11,
    fontWeight: "600",
    marginTop: 12,
  },
  ratingLabelActive: { color: "#F59E0B" },
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
  submitButton: {
    height: 56,
    borderRadius: 12,
    backgroundColor: "#2563EB",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  submitButtonDisabled: { opacity: 0.4 },
  submitButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
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
