import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, CheckCircle2, ImagePlus, Star, UserRound } from "lucide-react-native";
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { auth } from "@/src/firebase/config";
import { getCustomerReviewContext, type ReviewContext, type ServiceReview } from "@/src/services/review.service";
import { pickReviewPhotos, type SelectedReviewPhoto } from "@/src/services/reviewPhotos.service";
import { submitReviewWithPhotos } from "@/src/services/reviewSubmission.service";
import { ReviewPhotos } from "@/src/components/reviews/ReviewPhotos";
import { REVIEW_COMMENT_MAX, validateReview } from "@/src/utils/reviewValidation";

export default function ReviewTechnicianScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const requestId = typeof params.id === "string" ? params.id : "";
  const [context, setContext] = useState<ReviewContext | null>(null);
  const [rating, setRating] = useState(0), [comment, setComment] = useState("");
  const [photos, setPhotos] = useState<SelectedReviewPhoto[]>([]);
  const [loading, setLoading] = useState(true), [submitting, setSubmitting] = useState(false), [picking, setPicking] = useState(false);
  const [saved, setSaved] = useState<ServiceReview | null>(null), [justSubmitted, setJustSubmitted] = useState(false);
  const [error, setError] = useState(""), [warning, setWarning] = useState(""), [progress, setProgress] = useState("");
  const [retry, setRetry] = useState(0);
  const busy = useRef(false), photoBusy = useRef(false), version = useRef(0), controller = useRef<AbortController | null>(null);

  useEffect(() => {
    let active = true;
    const stop = auth.onAuthStateChanged((user) => {
      const generation = ++version.current;
      controller.current?.abort(); busy.current = false; photoBusy.current = false;
      setContext(null); setSaved(null); setJustSubmitted(false); setRating(0); setComment(""); setPhotos([]);
      setSubmitting(false); setPicking(false); setWarning(""); setError(""); setLoading(true);
      const current = () => active && version.current === generation && auth.currentUser?.uid === user?.uid;
      if (!user || !requestId) { setError("Please sign in and open a completed request."); setLoading(false); return; }
      void getCustomerReviewContext(requestId).then((next) => {
        if (!current()) return;
        setContext(next); setSaved(next.existingReview);
      }).catch((failure: unknown) => {
        if (current()) setError(failure instanceof Error ? failure.message : "Unable to load review details. Please retry.");
      }).finally(() => { if (current()) setLoading(false); });
    });
    // This ref is an async-operation generation, rather than a rendered node.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => { active = false; version.current++; controller.current?.abort(); stop(); };
  }, [requestId, retry]);

  const validContext = context?.requestId === requestId && context.customerId === auth.currentUser?.uid;
  const canSubmit = validContext && !saved && !submitting && !picking && !validateReview(rating, comment);
  const addPhotos = async () => {
    if (photoBusy.current || busy.current || photos.length >= 5) return;
    photoBusy.current = true; setPicking(true); setError("");
    const generation = version.current;
    try {
      const selected = await pickReviewPhotos(5 - photos.length);
      if (generation === version.current) setPhotos((previous) => [...previous, ...selected].slice(0, 5));
    } catch (failure) {
      if (generation === version.current) setError(`${failure instanceof Error ? failure.message : "Photo access was unavailable or denied."} You can retry or submit without photos after removing them.`);
    } finally { if (generation === version.current) { photoBusy.current = false; setPicking(false); } }
  };
  const submit = async () => {
    if (!canSubmit || busy.current || photoBusy.current || !context) return;
    busy.current = true; setSubmitting(true); setError(""); setWarning(""); setProgress("Checking your completed request…");
    const generation = version.current;
    const nextController = new AbortController(); controller.current = nextController;
    try {
      const result = await submitReviewWithPhotos({ requestId, rating, comment, photos, signal: nextController.signal,
        onProgress: (message) => { if (generation === version.current) setProgress(message); } });
      if (generation !== version.current || auth.currentUser?.uid !== context.customerId) return;
      setSaved(result.review); setJustSubmitted(result.created); setWarning(result.warning ?? ""); setPhotos([]);
    } catch (failure) {
      if (generation === version.current) setError(failure instanceof Error ? failure.message : "Unable to submit your review. Please retry.");
    } finally { if (generation === version.current) { busy.current = false; setSubmitting(false); setProgress(""); } }
  };
  if (loading) return <View style={styles.centerScreen}><ActivityIndicator color="#3B82F6" /><Text style={styles.hint}>Loading review details…</Text></View>;

  return <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
    <StatusBar barStyle="light-content" backgroundColor="#06101D" />
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back to request" style={styles.backButton} onPress={() => router.back()}><ArrowLeft color="white" size={20} /></TouchableOpacity>
        <Text style={styles.title}>{saved && validContext ? justSubmitted ? "Thank You" : "Your Review" : "Review Technician"}</Text>
      </View>
      {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      {!validContext && <TouchableOpacity accessibilityRole="button" style={styles.button} onPress={() => setRetry((value) => value + 1)}><Text style={styles.buttonText}>Retry loading review</Text></TouchableOpacity>}
      {validContext && context && <>
        <View style={styles.card}>
          <UserRound color="#60A5FA" size={42} /><Text style={styles.name}>{context.technicianName}</Text>
          <Text style={styles.serviceTitle}>{context.title}</Text>
          <View style={styles.completed}><CheckCircle2 color="#22C55E" size={16} /><Text style={styles.completedText}>Service Completed</Text></View>
        </View>
        {saved ? <>
          <Text style={styles.hint}>{justSubmitted ? "Your feedback has been saved for this completed request." : "This completed request already has your review."}</Text>
          <View style={styles.card}>
            <View style={styles.stars} accessible accessibilityLabel={`${saved.rating} out of 5 stars`}>
              {[1, 2, 3, 4, 5].map((star) => <Star key={star} size={30} color="#F59E0B" fill={star <= saved.rating ? "#F59E0B" : "transparent"} />)}
            </View>
            <Text style={styles.serviceTitle}>{saved.rating}/5</Text>
            {!!saved.comment && <Text style={styles.feedback}>{saved.comment}</Text>}
            <ReviewPhotos paths={saved.photoPaths} customerId={saved.customerId} />
          </View>
          {!!warning && <Text accessibilityRole="alert" style={styles.hint}>{warning}</Text>}
          <TouchableOpacity accessibilityRole="button" style={styles.button} onPress={() => router.replace("/bookings")}><Text style={styles.buttonText}>Back to Requests</Text></TouchableOpacity>
        </> : <>
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>How was your service experience?</Text>
            <Text style={styles.hint}>Choose 1–5 stars. Positive and negative feedback are equally welcome.</Text>
            <View style={styles.stars} accessibilityRole="radiogroup" accessibilityLabel="Service rating">
              {[1, 2, 3, 4, 5].map((star) => <TouchableOpacity key={star} style={styles.starButton} accessibilityRole="radio"
                accessibilityLabel={`${star} out of 5 stars`} accessibilityState={{ checked: rating === star, disabled: submitting }} disabled={submitting} onPress={() => setRating(star)}>
                <Star size={38} color={star <= rating ? "#F59E0B" : "#475569"} fill={star <= rating ? "#F59E0B" : "transparent"} />
              </TouchableOpacity>)}
            </View>
            <Text style={styles.hint}>{rating ? `${rating} out of 5 stars selected` : "Tap a star to rate"}</Text>
          </View>
          <Text style={styles.sectionTitle}>Your honest feedback</Text>
          <View style={styles.card}>
            <TextInput accessibilityLabel="Your honest feedback" value={comment} onChangeText={setComment} editable={!submitting}
              placeholder="Share your experience in your own words (optional)" placeholderTextColor="#64748B" multiline textAlignVertical="top" style={styles.input} />
            <Text style={comment.length > REVIEW_COMMENT_MAX ? styles.error : styles.hint}>{comment.length}/{REVIEW_COMMENT_MAX} characters · optional</Text>
          </View>
          <Text style={styles.sectionTitle}>Review photos (optional, up to 5)</Text>
          <Text style={styles.hint}>JPEG, PNG or WebP, up to 15 MB each. Photos are resized to 1600 px and saved as JPEG (max 5 MB). Photos are visible to eligible review viewers. Avoid private addresses and personal information.</Text>
          <View style={styles.photoRow}>{photos.map((photo, index) => <View key={`${photo.uri}/${index}`}>
            <Image source={{ uri: photo.uri }} style={styles.preview} accessibilityLabel={`Selected review photo ${index + 1}`} />
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Remove photo ${index + 1}`} disabled={submitting || picking} style={styles.remove}
              onPress={() => setPhotos((previous) => previous.filter((_, at) => at !== index))}><Text style={styles.buttonText}>Remove</Text></TouchableOpacity>
          </View>)}</View>
          {photos.length < 5 && <TouchableOpacity accessibilityRole="button" accessibilityLabel="Add review photos" disabled={submitting || picking} style={styles.secondaryButton} onPress={addPhotos}>
            {picking ? <ActivityIndicator color="#60A5FA" /> : <ImagePlus color="#60A5FA" size={22} />}<Text style={styles.buttonText}>{picking ? "Preparing photos…" : "Add Photos"}</Text>
          </TouchableOpacity>}
          {!!progress && <Text accessibilityLiveRegion="polite" style={styles.hint}>{progress}</Text>}
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Submit review" accessibilityState={{ disabled: !canSubmit, busy: submitting }} disabled={!canSubmit}
            style={[styles.button, !canSubmit && styles.disabled]} onPress={submit}>
            {submitting ? <ActivityIndicator color="white" /> : <Text style={styles.buttonText}>Submit Review</Text>}
          </TouchableOpacity>
        </>}
      </>}
    </ScrollView>
  </KeyboardAvoidingView>;
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#06101D" }, centerScreen: { flex: 1, backgroundColor: "#06101D", alignItems: "center", justifyContent: "center" },
  content: { width: "100%", maxWidth: 520, alignSelf: "center", paddingHorizontal: 18, paddingTop: 54, paddingBottom: 120 },
  header: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 28 },
  title: { fontSize: 24, fontWeight: "800", color: "white", flex: 1 },
  backButton: { width: 44, height: 44, borderRadius: 13, backgroundColor: "#0D1B2A", alignItems: "center", justifyContent: "center" },
  card: { borderRadius: 18, backgroundColor: "#0D1B2A", borderColor: "#17263A", borderWidth: 1, padding: 18, marginBottom: 20 },
  name: { color: "white", fontSize: 20, fontWeight: "800", marginTop: 12 },
  serviceTitle: { color: "#CBD5E1", fontSize: 14, marginTop: 8 },
  completed: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 }, completedText: { color: "#22C55E", fontSize: 12 },
  sectionTitle: { color: "white", fontSize: 16, fontWeight: "700", marginBottom: 10 },
  hint: { color: "#94A3B8", fontSize: 12, lineHeight: 18, marginVertical: 8 },
  error: { color: "#FCA5A5", fontSize: 13, lineHeight: 20, marginBottom: 14 },
  stars: { flexDirection: "row", justifyContent: "center", flexWrap: "wrap" }, starButton: { minWidth: 44, minHeight: 48, padding: 4, justifyContent: "center", alignItems: "center" },
  input: { color: "white", fontSize: 14, lineHeight: 21, minHeight: 130, backgroundColor: "#091522", borderRadius: 12, padding: 12 },
  feedback: { color: "#CBD5E1", fontSize: 14, lineHeight: 21, marginTop: 14 },
  photoRow: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 12 }, preview: { width: 90, height: 90, borderRadius: 10 },
  remove: { minHeight: 44, alignItems: "center", justifyContent: "center", backgroundColor: "#17263A", borderRadius: 10 },
  button: { minHeight: 56, backgroundColor: "#2563EB", borderRadius: 12, padding: 12, justifyContent: "center", alignItems: "center", marginTop: 18 },
  secondaryButton: { minHeight: 48, borderWidth: 1, borderColor: "#17263A", borderRadius: 12, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center" },
  buttonText: { color: "white", fontSize: 14, fontWeight: "700" }, disabled: { opacity: 0.4 },
});
