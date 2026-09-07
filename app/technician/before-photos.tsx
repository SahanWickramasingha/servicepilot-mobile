import { router, useLocalSearchParams } from "expo-router";
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  ImagePlus,
  Images,
  Trash2,
} from "lucide-react-native";
import { useState } from "react";
import {
  Alert,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

type PhotoItem = {
  id: number;
  added: boolean;
};

export default function BeforeServicePhotosScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const jobId = params.id ?? "REQ-2026-0012";

  const [photos, setPhotos] = useState<PhotoItem[]>([
    { id: 1, added: false },
    { id: 2, added: false },
    { id: 3, added: false },
  ]);

  const photoCount = photos.filter((photo) => photo.added).length;

  const addMockPhoto = () => {
    const firstEmpty = photos.find((photo) => !photo.added);

    if (!firstEmpty) {
      Alert.alert("Photo Limit", "You can add up to 3 photos for now.");
      return;
    }

    setPhotos((current) =>
      current.map((photo) =>
        photo.id === firstEmpty.id
          ? { ...photo, added: true }
          : photo
      )
    );
  };

  const removePhoto = (id: number) => {
    setPhotos((current) =>
      current.map((photo) =>
        photo.id === id
          ? { ...photo, added: false }
          : photo
      )
    );
  };

  const handleContinue = () => {
    if (photoCount === 0) {
      Alert.alert(
        "Photo Required",
        "Please add at least one before-service photo."
      );
      return;
    }

    router.back();
  };

  return (
    <View style={styles.container}>
      <StatusBar
        barStyle="light-content"
        backgroundColor="#06101D"
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
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

          <View style={styles.headerContent}>
            <Text style={styles.title}>Before Service Photos</Text>

            <Text style={styles.requestId}>{jobId}</Text>
          </View>
        </View>

        <View style={styles.infoCard}>
          <View style={styles.infoIcon}>
            <Camera size={23} color="#60A5FA" />
          </View>

          <View style={styles.infoContent}>
            <Text style={styles.infoTitle}>Capture Initial Condition</Text>

            <Text style={styles.infoText}>
              Take clear photos of the equipment or service area before
              starting any repair work.
            </Text>
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Service Evidence</Text>

          <Text style={styles.photoCount}>{photoCount}/3 Photos</Text>
        </View>

        <View style={styles.photoGrid}>
          {photos.map((photo) => (
            <View key={photo.id} style={styles.photoSlot}>
              {photo.added ? (
                <>
                  <View style={styles.mockPhoto}>
                    <Images size={32} color="#60A5FA" />

                    <Text style={styles.photoAddedText}>
                      Photo {photo.id}
                    </Text>
                  </View>

                  <View style={styles.photoAddedBadge}>
                    <CheckCircle2 size={14} color="#22C55E" />

                    <Text style={styles.photoAddedBadgeText}>Added</Text>
                  </View>

                  <TouchableOpacity
                    style={styles.deleteButton}
                    activeOpacity={0.8}
                    onPress={() => removePhoto(photo.id)}
                  >
                    <Trash2 size={15} color="#EF4444" />
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <ImagePlus size={28} color="#475569" />

                  <Text style={styles.emptyPhotoText}>
                    Photo {photo.id}
                  </Text>
                </>
              )}
            </View>
          ))}
        </View>

        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.cameraButton}
            activeOpacity={0.85}
            onPress={addMockPhoto}
          >
            <Camera size={19} color="#FFFFFF" />

            <Text style={styles.cameraButtonText}>Take Photo</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.galleryButton}
            activeOpacity={0.85}
            onPress={addMockPhoto}
          >
            <Images size={19} color="#60A5FA" />

            <Text style={styles.galleryButtonText}>Gallery</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.tipsCard}>
          <Text style={styles.tipsTitle}>Photo Guidelines</Text>

          <Text style={styles.tipText}>
            • Capture the full equipment or service area.
          </Text>

          <Text style={styles.tipText}>
            • Include any visible damage or existing issues.
          </Text>

          <Text style={styles.tipText}>
            • Make sure photos are clear and well lit.
          </Text>

          <Text style={styles.tipText}>
            • Avoid blurry or duplicate photos.
          </Text>
        </View>

        <View style={styles.statusCard}>
          <View
            style={[
              styles.statusIndicator,
              photoCount > 0 && styles.statusIndicatorDone,
            ]}
          >
            {photoCount > 0 && <CheckCircle2 size={17} color="#FFFFFF" />}
          </View>

          <View style={styles.statusContent}>
            <Text style={styles.statusTitle}>Before-Service Evidence</Text>

            <Text style={styles.statusText}>
              {photoCount > 0
                ? `${photoCount} photo${photoCount > 1 ? "s" : ""} ready to save`
                : "At least one photo is required"}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={[
            styles.saveButton,
            photoCount === 0 && styles.saveButtonDisabled,
          ]}
          activeOpacity={0.85}
          onPress={handleContinue}
        >
          <CheckCircle2 size={19} color="#FFFFFF" />

          <Text style={styles.saveButtonText}>Save & Continue</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
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
    paddingBottom: 60,
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
    fontSize: 23,
    fontWeight: "800",
  },

  requestId: {
    color: "#64748B",
    fontSize: 9,
    marginTop: 3,
  },

  infoCard: {
    minHeight: 100,
    borderRadius: 17,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    marginBottom: 24,
  },

  infoIcon: {
    width: 51,
    height: 51,
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
    color: "#F8FAFC",
    fontSize: 12,
    fontWeight: "700",
  },

  infoText: {
    color: "#64748B",
    fontSize: 9,
    lineHeight: 15,
    marginTop: 5,
  },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },

  sectionTitle: {
    color: "#F8FAFC",
    fontSize: 14,
    fontWeight: "800",
  },

  photoCount: {
    color: "#64748B",
    fontSize: 9,
  },

  photoGrid: {
    flexDirection: "row",
    gap: 9,
    marginBottom: 14,
  },

  photoSlot: {
    flex: 1,
    aspectRatio: 0.9,
    borderRadius: 15,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#223249",
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },

  mockPhoto: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#101F30",
    alignItems: "center",
    justifyContent: "center",
  },

  photoAddedText: {
    color: "#94A3B8",
    fontSize: 9,
    marginTop: 7,
  },

  photoAddedBadge: {
    position: "absolute",
    left: 7,
    bottom: 7,
    minHeight: 24,
    borderRadius: 8,
    backgroundColor: "#091522",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
    gap: 4,
  },

  photoAddedBadgeText: {
    color: "#22C55E",
    fontSize: 7,
    fontWeight: "700",
  },

  deleteButton: {
    position: "absolute",
    right: 6,
    top: 6,
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: "#091522",
    alignItems: "center",
    justifyContent: "center",
  },

  emptyPhotoText: {
    color: "#64748B",
    fontSize: 9,
    marginTop: 8,
  },

  actionRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 24,
  },

  cameraButton: {
    flex: 1,
    height: 49,
    borderRadius: 12,
    backgroundColor: "#15803D",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },

  cameraButtonText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "700",
  },

  galleryButton: {
    flex: 1,
    height: 49,
    borderRadius: 12,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#26364D",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },

  galleryButtonText: {
    color: "#60A5FA",
    fontSize: 10,
    fontWeight: "700",
  },

  tipsCard: {
    borderRadius: 16,
    backgroundColor: "rgba(59,130,246,0.05)",
    borderWidth: 1,
    borderColor: "rgba(59,130,246,0.15)",
    padding: 14,
    marginBottom: 20,
  },

  tipsTitle: {
    color: "#CBD5E1",
    fontSize: 10,
    fontWeight: "700",
    marginBottom: 8,
  },

  tipText: {
    color: "#64748B",
    fontSize: 9,
    lineHeight: 17,
  },

  statusCard: {
    minHeight: 76,
    borderRadius: 15,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    marginBottom: 18,
  },

  statusIndicator: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "#101F30",
    borderWidth: 1,
    borderColor: "#334155",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 11,
  },

  statusIndicatorDone: {
    backgroundColor: "#15803D",
    borderColor: "#22C55E",
  },

  statusContent: {
    flex: 1,
  },

  statusTitle: {
    color: "#E2E8F0",
    fontSize: 10,
    fontWeight: "700",
  },

  statusText: {
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