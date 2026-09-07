import { router, useLocalSearchParams } from "expo-router";
import {
  ArrowLeft,
  CheckCircle2,
  Eraser,
  PenLine,
  ShieldCheck,
  Signature,
  UserRound,
} from "lucide-react-native";
import { useState } from "react";
import {
  Alert,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

export default function CustomerSignatureScreen() {
  const params = useLocalSearchParams<{
    id?: string;
  }>();

  const jobId = params.id ?? "REQ-2026-0012";

  const [customerName, setCustomerName] =
    useState("Emma Johnson");

  const [signed, setSigned] = useState(false);

  const [confirmed, setConfirmed] =
    useState(false);

  const handleAddSignature = () => {
    setSigned(true);
  };

  const handleClearSignature = () => {
    setSigned(false);
    setConfirmed(false);
  };

  const handleSave = () => {
    if (!customerName.trim()) {
      Alert.alert(
        "Customer Name Required",
        "Please enter the customer name."
      );

      return;
    }

    if (!signed) {
      Alert.alert(
        "Signature Required",
        "Please add the customer's signature."
      );

      return;
    }

    if (!confirmed) {
      Alert.alert(
        "Confirmation Required",
        "Please confirm that the customer has approved the completed service."
      );

      return;
    }

    /*
      Backend integration later:

      saveCustomerSignature({
        jobId,
        customerName,
        signature,
        confirmed,
        signedAt
      });
    */

    Alert.alert(
      "Signature Saved",
      "Customer approval has been recorded successfully.",
      [
        {
          text: "Continue",
          onPress: () => router.back(),
        },
      ]
    );
  };

  const canSave =
    customerName.trim().length > 0 &&
    signed &&
    confirmed;

  return (
    <View style={styles.container}>
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

          <View style={styles.headerContent}>
            <Text style={styles.title}>
              Customer Signature
            </Text>

            <Text style={styles.requestId}>
              {jobId}
            </Text>
          </View>
        </View>

        {/* Information */}

        <View style={styles.infoCard}>
          <View style={styles.infoIcon}>
            <Signature
              size={25}
              color="#F59E0B"
            />
          </View>

          <View style={styles.infoContent}>
            <Text style={styles.infoTitle}>
              Customer Approval
            </Text>

            <Text style={styles.infoText}>
              Ask the customer to review the completed
              service and provide their signature before
              closing the job.
            </Text>
          </View>
        </View>

        {/* Customer */}

        <Text style={styles.sectionTitle}>
          Customer Information
        </Text>

        <View style={styles.customerCard}>
          <View style={styles.customerIcon}>
            <UserRound
              size={22}
              color="#CBD5E1"
            />
          </View>

          <View style={styles.customerContent}>
            <Text style={styles.inputLabel}>
              Customer Name
            </Text>

            <TextInput
              value={customerName}
              onChangeText={setCustomerName}
              placeholder="Enter customer name"
              placeholderTextColor="#475569"
              style={styles.customerInput}
            />
          </View>
        </View>

        {/* Signature */}

        <View style={styles.signatureHeader}>
          <View>
            <Text style={styles.sectionTitleNoMargin}>
              Signature
            </Text>

            <Text style={styles.requiredText}>
              Required
            </Text>
          </View>

          {signed && (
            <View style={styles.signedBadge}>
              <CheckCircle2
                size={14}
                color="#22C55E"
              />

              <Text style={styles.signedBadgeText}>
                Signed
              </Text>
            </View>
          )}
        </View>

        <TouchableOpacity
          style={[
            styles.signaturePad,
            signed && styles.signaturePadSigned,
          ]}
          activeOpacity={0.9}
          onPress={handleAddSignature}
        >
          {signed ? (
            <>
              <View style={styles.signatureMock}>
                <Text style={styles.signatureText}>
                  Emma Johnson
                </Text>

                <View style={styles.signatureLine} />
              </View>

              <View style={styles.signatureDone}>
                <CheckCircle2
                  size={18}
                  color="#22C55E"
                />

                <Text style={styles.signatureDoneText}>
                  Customer signature captured
                </Text>
              </View>
            </>
          ) : (
            <>
              <View style={styles.penIcon}>
                <PenLine
                  size={28}
                  color="#64748B"
                />
              </View>

              <Text style={styles.signaturePlaceholderTitle}>
                Tap to Add Signature
              </Text>

              <Text style={styles.signaturePlaceholderText}>
                Customer signs inside this area
              </Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.clearButton,
            !signed && styles.clearButtonDisabled,
          ]}
          disabled={!signed}
          activeOpacity={0.8}
          onPress={handleClearSignature}
        >
          <Eraser
            size={17}
            color={
              signed
                ? "#EF4444"
                : "#475569"
            }
          />

          <Text
            style={[
              styles.clearButtonText,
              !signed &&
                styles.clearButtonTextDisabled,
            ]}
          >
            Clear Signature
          </Text>
        </TouchableOpacity>

        {/* Confirmation */}

        <Text style={styles.sectionTitle}>
          Service Confirmation
        </Text>

        <TouchableOpacity
          style={[
            styles.confirmationCard,
            confirmed &&
              styles.confirmationCardActive,
          ]}
          activeOpacity={0.85}
          onPress={() =>
            setConfirmed(
              (current) => !current
            )
          }
        >
          <View
            style={[
              styles.checkbox,
              confirmed &&
                styles.checkboxActive,
            ]}
          >
            {confirmed && (
              <CheckCircle2
                size={18}
                color="#FFFFFF"
              />
            )}
          </View>

          <View style={styles.confirmationContent}>
            <Text style={styles.confirmationTitle}>
              Customer Approval
            </Text>

            <Text style={styles.confirmationText}>
              The customer confirms that the service
              has been completed and the final
              condition has been reviewed.
            </Text>
          </View>
        </TouchableOpacity>

        {/* Notice */}

        <View style={styles.securityCard}>
          <ShieldCheck
            size={20}
            color="#60A5FA"
          />

          <View style={styles.securityContent}>
            <Text style={styles.securityTitle}>
              Digital Service Record
            </Text>

            <Text style={styles.securityText}>
              The signature will be linked with this
              service request, technician, completion
              time and service evidence.
            </Text>
          </View>
        </View>

        {/* Summary */}

        <View style={styles.summaryCard}>
          <SummaryRow
            label="Customer Name"
            completed={
              customerName.trim().length > 0
            }
          />

          <View style={styles.divider} />

          <SummaryRow
            label="Customer Signature"
            completed={signed}
          />

          <View style={styles.divider} />

          <SummaryRow
            label="Service Approval"
            completed={confirmed}
          />
        </View>

        {/* Save */}

        <TouchableOpacity
          style={[
            styles.saveButton,
            !canSave &&
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
            Save Customer Signature
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function SummaryRow({
  label,
  completed,
}: {
  label: string;
  completed: boolean;
}) {
  return (
    <View style={styles.summaryRow}>
      <View
        style={[
          styles.summaryStatus,
          completed &&
            styles.summaryStatusCompleted,
        ]}
      >
        {completed && (
          <CheckCircle2
            size={14}
            color="#FFFFFF"
          />
        )}
      </View>

      <Text style={styles.summaryLabel}>
        {label}
      </Text>

      <Text
        style={[
          styles.summaryValue,
          completed &&
            styles.summaryValueCompleted,
        ]}
      >
        {completed
          ? "Complete"
          : "Pending"}
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
    marginBottom: 25,
  },

  infoIcon: {
    width: 52,
    height: 52,
    borderRadius: 15,
    backgroundColor:
      "rgba(245,158,11,0.07)",
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

  sectionTitle: {
    color: "#F8FAFC",
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 10,
  },

  sectionTitleNoMargin: {
    color: "#F8FAFC",
    fontSize: 14,
    fontWeight: "800",
  },

  requiredText: {
    color: "#F59E0B",
    fontSize: 8,
    fontWeight: "700",
    marginTop: 3,
  },

  customerCard: {
    minHeight: 88,
    borderRadius: 16,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    flexDirection: "row",
    alignItems: "center",
    padding: 13,
    marginBottom: 25,
  },

  customerIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: "#101F30",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 11,
  },

  customerContent: {
    flex: 1,
  },

  inputLabel: {
    color: "#64748B",
    fontSize: 8,
    marginBottom: 5,
  },

  customerInput: {
    height: 38,
    borderRadius: 9,
    backgroundColor: "#091522",
    borderWidth: 1,
    borderColor: "#1E2D42",
    paddingHorizontal: 10,
    color: "#FFFFFF",
    fontSize: 10,
  },

  signatureHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },

  signedBadge: {
    minHeight: 28,
    borderRadius: 9,
    backgroundColor:
      "rgba(34,197,94,0.07)",
    borderWidth: 1,
    borderColor:
      "rgba(34,197,94,0.20)",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
  },

  signedBadgeText: {
    color: "#22C55E",
    fontSize: 8,
    fontWeight: "700",
  },

  signaturePad: {
    minHeight: 220,
    borderRadius: 18,
    backgroundColor: "#0D1B2A",
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "#334155",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
  },

  signaturePadSigned: {
    borderStyle: "solid",
    borderColor:
      "rgba(34,197,94,0.35)",
  },

  penIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#101F30",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 13,
  },

  signaturePlaceholderTitle: {
    color: "#CBD5E1",
    fontSize: 12,
    fontWeight: "700",
  },

  signaturePlaceholderText: {
    color: "#64748B",
    fontSize: 9,
    marginTop: 5,
  },

  signatureMock: {
    width: "85%",
    alignItems: "center",
    justifyContent: "center",
  },

  signatureText: {
    color: "#E2E8F0",
    fontSize: 32,
    fontStyle: "italic",
    fontWeight: "500",
    transform: [
      {
        rotate: "-5deg",
      },
    ],
  },

  signatureLine: {
    width: "90%",
    height: 1,
    backgroundColor: "#475569",
    marginTop: 12,
  },

  signatureDone: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 20,
  },

  signatureDoneText: {
    color: "#22C55E",
    fontSize: 9,
    fontWeight: "600",
  },

  clearButton: {
    alignSelf: "flex-end",
    minHeight: 39,
    borderRadius: 10,
    backgroundColor:
      "rgba(239,68,68,0.05)",
    borderWidth: 1,
    borderColor:
      "rgba(239,68,68,0.16)",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 11,
    gap: 6,
    marginTop: 9,
    marginBottom: 25,
  },

  clearButtonDisabled: {
    opacity: 0.4,
  },

  clearButtonText: {
    color: "#EF4444",
    fontSize: 9,
    fontWeight: "700",
  },

  clearButtonTextDisabled: {
    color: "#64748B",
  },

  confirmationCard: {
    minHeight: 105,
    borderRadius: 16,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 14,
    marginBottom: 17,
  },

  confirmationCardActive: {
    borderColor:
      "rgba(34,197,94,0.35)",
    backgroundColor:
      "rgba(34,197,94,0.035)",
  },

  checkbox: {
    width: 28,
    height: 28,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "#334155",
    backgroundColor: "#101F30",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 11,
  },

  checkboxActive: {
    backgroundColor: "#15803D",
    borderColor: "#22C55E",
  },

  confirmationContent: {
    flex: 1,
  },

  confirmationTitle: {
    color: "#E2E8F0",
    fontSize: 11,
    fontWeight: "700",
  },

  confirmationText: {
    color: "#64748B",
    fontSize: 9,
    lineHeight: 15,
    marginTop: 5,
  },

  securityCard: {
    minHeight: 87,
    borderRadius: 15,
    backgroundColor:
      "rgba(59,130,246,0.04)",
    borderWidth: 1,
    borderColor:
      "rgba(59,130,246,0.14)",
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 14,
    marginBottom: 18,
  },

  securityContent: {
    flex: 1,
    marginLeft: 10,
  },

  securityTitle: {
    color: "#CBD5E1",
    fontSize: 10,
    fontWeight: "700",
  },

  securityText: {
    color: "#64748B",
    fontSize: 8,
    lineHeight: 14,
    marginTop: 4,
  },

  summaryCard: {
    borderRadius: 16,
    backgroundColor: "#0D1B2A",
    borderWidth: 1,
    borderColor: "#17263A",
    paddingHorizontal: 14,
    marginBottom: 18,
  },

  summaryRow: {
    minHeight: 59,
    flexDirection: "row",
    alignItems: "center",
  },

  summaryStatus: {
    width: 25,
    height: 25,
    borderRadius: 8,
    backgroundColor: "#101F30",
    borderWidth: 1,
    borderColor: "#334155",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },

  summaryStatusCompleted: {
    backgroundColor: "#15803D",
    borderColor: "#22C55E",
  },

  summaryLabel: {
    color: "#94A3B8",
    fontSize: 9,
    flex: 1,
  },

  summaryValue: {
    color: "#F59E0B",
    fontSize: 8,
    fontWeight: "700",
  },

  summaryValueCompleted: {
    color: "#22C55E",
  },

  divider: {
    height: 1,
    backgroundColor: "#17263A",
    marginLeft: 35,
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