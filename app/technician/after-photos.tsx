import { router, useLocalSearchParams } from "expo-router";
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  ImagePlus,
  Images,
  Sparkles,
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

export default function AfterServicePhotosScreen() {
  const params = useLocalSearchParams<{ id?: string }>();

  const jobId = params.id ?? "REQ-2026-0012";

  const [photos, setPhotos] = useState<PhotoItem[]>([
    { id: 1, added: false },
    { id: 2, added: false },
    { id: 3, added: false },
  ]);

  const photoCount = photos.filter(
    (photo) => photo.added
  ).length;

  const addMockPhoto = () => {
    const emptyPhoto = photos.find(
      (photo) => !photo.added
    );

    if (!emptyPhoto) {
      Alert.alert(
        "Photo Limit",
        "You can add up to 3 after-service photos."
      );

      return;
    }

    setPhotos((current) =>
      current.map((photo) =>
        photo.id === emptyPhoto.id
          ? {
              ...photo,
              added: true,
            }
          : photo
      )
    );
  };

  const removePhoto = (id: number) => {
    setPhotos((current) =>
      current.map((photo) =>
        photo.id === id
          ? {
              ...photo,
              added: false,
            }
          : photo
      )
    );
  };

  const handleSave = () => {
    if (photoCount === 0) {
      Alert.alert(
        "Photo Required",
        "Please add at least one after-service photo."
      );

      return;
    }

    /*
      Backend / Firebase later:

      uploadAfterServicePhotos({
        jobId,
        photos
      })
    */

    Alert.alert(
      "Photos Saved",
      "After-service evidence has been saved successfully.",
      [
        {
          text: "Continue",
          onPress: () => router.back(),
        },
      ]
    );
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

          <View style={styles.headerContent}>
            <Text style={styles.title}>
              After Service Photos
            </Text>

            <Text style={styles.requestId}>
              {jobId}
            </Text>
          </View>
        </View>

        {/* Information */}

        <View style={styles.infoCard}>
          <View style={styles.infoIcon}>
            <Sparkles
              size={24}
              color="#22C55E"
            />
          </View>

          <View style={styles.infoContent}>
            <Text style={styles.infoTitle}>
              Capture Completed Work
            </Text>

            <Text style={styles.infoText}>
              Take clear photos showing the final condition after the
              service or repair has been completed.
            </Text>
          </View>
        </View>

        {/* Status */}

        <View style={styles.statusCard}>
          <CheckCircle2
            size={20}
            color="#22C55E"
          />

          <View style={styles.statusContent}>
            <Text style={styles.statusTitle}>
              Service Work Completed
            </Text>

            <Text style={styles.statusText}>
              Add final evidence before requesting customer approval.
            </Text>
          </View>
        </View>

        {/* Photos Header */}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            Final Service Evidence
          </Text>

          <Text style={styles.photoCounter}>
            {photoCount}/3 Photos
          </Text>
        </View>

        {/* Photo Slots */}

        <View style={styles.photoGrid}>
          {photos.map((photo) => (
            <View
              key={photo.id}
              style={styles.photoSlot}
            >
              {photo.added ? (
                <>
                  <View style={styles.mockPhoto}>
                    <Images
                      size={33}
                      color="#22C55E"
                    />

                    <Text style={styles.photoText}>
                      After Photo {photo.id}
                    </Text>
                  </View>

                  <View style={styles.addedBadge}>
                    <CheckCircle2
                      size={13}
                      color="#22C55E"
                    />

                    <Text style={styles.addedText}>
                      Added
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={styles.deleteButton}
                    activeOpacity={0.8}
                    onPress={() =>
                      removePhoto(photo.id)
                    }
                  >
                    <Trash2
                      size={15}
                      color="#EF4444"
                    />
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <ImagePlus
                    size={29}
                    color="#475569"
                  />

                  <Text style={styles.emptyText}>
                    Photo {photo.id}
                  </Text>
                </>
              )}
            </View>
          ))}
        </View>

        {/* Camera buttons */}

        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.cameraButton}
            activeOpacity={0.85}
            onPress={addMockPhoto}
          >
            <Camera
              size={19}
              color="#FFFFFF"
            />

            <Text style={styles.cameraButtonText}>
              Take Photo
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.galleryButton}
            activeOpacity={0.85}
            onPress={addMockPhoto}
          >
            <Images
              size={19}
              color="#22C55E"
            />

            <Text style={styles.galleryButtonText}>
              Gallery
            </Text>
          </TouchableOpacity>
        </View>

        {/* Comparison */}

        <Text style={styles.sectionTitle}>
          Evidence Checklist
        </Text>

        <View style={styles.checklistCard}>
          <ChecklistItem
            label="Show completed repair clearly"
          />

          <View style={styles.divider} />

          <ChecklistItem
            label="Capture the full serviced area"
          />

          <View style={styles.divider} />

          <ChecklistItem
            label="Document replaced or repaired parts"
          />

          <View style={styles.divider} />

          <ChecklistItem
            label="Avoid blurry or dark photos"
          />
        </View>

        {/* Guidelines */}

        <View style={styles.guideCard}>
          <Text style={styles.guideTitle}>
            Why are after-service photos required?
          </Text>

          <Text style={styles.guideText}>
            These photos provide proof of completed work and help the
            customer, dispatcher and administrator verify the final
            service condition.
          </Text>
        </View>

        {/* Completion */}

        <View style={styles.completionCard}>
          <View
            style={[
              styles.completionIcon,
              photoCount > 0 &&
                styles.completionIconActive,
            ]}
          >
            {photoCount > 0 ? (
              <CheckCircle2
                size={19}
                color="#FFFFFF"
              />
            ) : (
              <Camera
                size={19}
                color="#64748B"
              />
            )}
          </View>

          <View style={styles.completionContent}>
            <Text style={styles.completionTitle}>
              After-Service Evidence
            </Text>

            <Text style={styles.completionText}>
              {photoCount > 0
                ? `${photoCount} final photo${
                    photoCount > 1 ? "s" : ""
                  } ready`
                : "At least one photo is required"}
            </Text>
          </View>
        </View>

        {/* Save */}

        <TouchableOpacity
          style={[
            styles.saveButton,
            photoCount === 0 &&
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
            Save After Photos
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function ChecklistItem({
  label,
}: {
  label: string;
}) {
  return (
    <View style={styles.checklistItem}>
      <View style={styles.checkDot}>
        <CheckCircle2
          size={15}
          color="#22C55E"
        />
      </View>

      <Text style={styles.checkText}>
        {label}
      </Text>
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
    fontSize: 23,
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
    marginBottom: 14,
  },

  infoIcon: {
    width: 52,
    height: 52,
    borderRadius: 15,
    backgroundColor: "rgba(34,197,94,0.07)",
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

  statusCard: {
    minHeight: 70,
    borderRadius: 14,
    backgroundColor: "rgba(34,197,94,0.05)",
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.15)",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    marginBottom: 24,
  },

  statusContent: {
    flex: 1,
    marginLeft: 10,
  },

  statusTitle: {
    color: "#22C55E",
    fontSize: 10,
    fontWeight: "700",
  },

  statusText: {
    color: "#64748B",
    fontSize: 8,
    marginTop: 3,
  },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 11,
  },

  sectionTitle: {
    color: "#F8FAFC",
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 11,
  },

  photoCounter: {
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

  photoText: {
    color: "#94A3B8",
    fontSize: 8,
    marginTop: 7,
  },

  emptyText: {
    color: "#64748B",
    fontSize: 9,
    marginTop: 8,
  },

  addedBadge: {
    position: "absolute",
    left: 7,
    bottom: 7,
    minHeight: 24,
    borderRadius: 8,
    backgroundColor: "#091522",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 6,
  },

  addedText: {
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

  actions: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 25,
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
    color: "#22C55E",
    fontSize: 10,
    fontWeight: "700",
  },

  checklistCard: {
    borderRadius: 16,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    paddingHorizontal: 14,
    marginBottom: 18,
  },

  checklistItem: {
    minHeight: 57,
    flexDirection: "row",
    alignItems: "center",
  },

  checkDot: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: "rgba(34,197,94,0.06)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },

  checkText: {
    color: "#94A3B8",
    fontSize: 9,
    flex: 1,
  },

  divider: {
    height: 1,
    backgroundColor: "#17263A",
    marginLeft: 40,
  },

  guideCard: {
    borderRadius: 15,
    backgroundColor: "rgba(59,130,246,0.04)",
    borderWidth: 1,
    borderColor: "rgba(59,130,246,0.14)",
    padding: 14,
    marginBottom: 18,
  },

  guideTitle: {
    color: "#CBD5E1",
    fontSize: 10,
    fontWeight: "700",
  },

  guideText: {
    color: "#64748B",
    fontSize: 9,
    lineHeight: 15,
    marginTop: 6,
  },

  completionCard: {
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

  completionIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#101F30",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 11,
  },

  completionIconActive: {
    backgroundColor: "#15803D",
  },

  completionContent: {
    flex: 1,
  },

  completionTitle: {
    color: "#E2E8F0",
    fontSize: 10,
    fontWeight: "700",
  },

  completionText: {
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