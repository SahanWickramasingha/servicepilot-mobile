import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import {
  FieldValue,
  getFirestore,
  Timestamp,
} from "firebase-admin/firestore";

import { HttpsError, onCall } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";

import {
  buildVerificationEmailHtml,
  buildVerificationEmailText,
} from "./email/verification-template";
import {
  mailSecrets,
  sendVerificationEmailMessage,
} from "./services/mail.service";

initializeApp();

const db = getFirestore();
const adminAuth = getAuth();

setGlobalOptions({
  region: "asia-south1",
  maxInstances: 10,
});

const VERIFICATION_EMAIL_COOLDOWN_SECONDS = 60;

export const sendServicePilotVerificationEmail = onCall(
  {
    secrets: mailSecrets,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "You must be signed in."
      );
    }

    const uid = request.auth.uid;
    const user = await adminAuth.getUser(uid);

    if (!user.email) {
      throw new HttpsError(
        "failed-precondition",
        "No email address is associated with this account."
      );
    }

    if (user.emailVerified) {
      return {
        success: true,
        alreadyVerified: true,
        message: "Your email is already verified.",
      };
    }

    const sendRef = db
      .collection("emailVerificationSends")
      .doc(uid);
    const existingSend = await sendRef.get();

    if (existingSend.exists) {
      const lastSentAt = existingSend.data()
        ?.lastSentAt as Timestamp | undefined;

      if (lastSentAt) {
        const secondsSinceLastSend =
          (Date.now() - lastSentAt.toMillis()) / 1000;

        if (
          secondsSinceLastSend <
          VERIFICATION_EMAIL_COOLDOWN_SECONDS
        ) {
          throw new HttpsError(
            "resource-exhausted",
            "Please wait before requesting another verification email."
          );
        }
      }
    }

    let verificationUrl: string;

    try {
      verificationUrl =
        await adminAuth.generateEmailVerificationLink(user.email);
    } catch (error) {
      console.error(
        "ServicePilot verification link generation failed",
        {
          uid,
          error:
            error instanceof Error
              ? error.message
              : "Unknown Firebase Auth error",
        }
      );

      throw new HttpsError(
        "internal",
        "Unable to send verification email. Please try again."
      );
    }

    try {
      await sendVerificationEmailMessage({
        to: user.email,
        subject: "Verify your ServicePilot email",
        html: buildVerificationEmailHtml(verificationUrl),
        text: buildVerificationEmailText(verificationUrl),
      });
    } catch (error) {
      console.error(
        "ServicePilot verification email send failed",
        {
          uid,
          error:
            error instanceof Error
              ? error.message
              : "Unknown mail provider error",
        }
      );

      throw new HttpsError(
        "internal",
        "Unable to send verification email. Please try again."
      );
    }

    await sendRef.set(
      {
        uid,
        email: user.email,
        lastSentAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      {
        merge: true,
      }
    );

    return {
      success: true,
      alreadyVerified: false,
      message: "Verification email sent.",
    };
  }
);
