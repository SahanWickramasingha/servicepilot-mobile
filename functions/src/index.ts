import { randomInt, createHmac, timingSafeEqual } from "crypto";

import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import {
  FieldValue,
  getFirestore,
  Timestamp,
} from "firebase-admin/firestore";

import { defineSecret } from "firebase-functions/params";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";

import { Resend } from "resend";

initializeApp();

const db = getFirestore();
const adminAuth = getAuth();

setGlobalOptions({
  region: "asia-south1",
  maxInstances: 10,
});

const resendApiKey = defineSecret("RESEND_API_KEY");
const otpSecret = defineSecret("OTP_SECRET");

const OTP_EXPIRY_MINUTES = 10;
const OTP_RESEND_SECONDS = 60;
const MAX_ATTEMPTS = 5;

function hashOtp(uid: string, otp: string): string {
  return createHmac("sha256", otpSecret.value())
    .update(`${uid}:${otp}`)
    .digest("hex");
}

export const sendEmailOtp = onCall(
  {
    secrets: [resendApiKey, otpSecret],
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
      };
    }

    const otpRef = db.collection("emailOtps").doc(uid);

    const existingOtp = await otpRef.get();

    if (existingOtp.exists) {
      const data = existingOtp.data();

      const lastSentAt = data?.lastSentAt as Timestamp | undefined;

      if (lastSentAt) {
        const secondsSinceLastSend =
          (Date.now() - lastSentAt.toMillis()) / 1000;

        if (secondsSinceLastSend < OTP_RESEND_SECONDS) {
          throw new HttpsError(
            "resource-exhausted",
            "Please wait before requesting another OTP."
          );
        }
      }
    }

    const otp = randomInt(100000, 1000000).toString();

    const otpHash = hashOtp(uid, otp);

    const expiresAt = Timestamp.fromMillis(
      Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000
    );

    await otpRef.set({
      uid,
      email: user.email,
      otpHash,
      expiresAt,
      attempts: 0,
      lastSentAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    });

    const resend = new Resend(resendApiKey.value());

    const { error } = await resend.emails.send({
      from: "ServicePilot <onboarding@resend.dev>",
      to: [user.email],
      subject: "Your ServicePilot verification code",
      html: `
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;">
          <h2>Verify your ServicePilot account</h2>

          <p>Your verification code is:</p>

          <div style="
            font-size:32px;
            font-weight:700;
            letter-spacing:8px;
            margin:24px 0;
          ">
            ${otp}
          </div>

          <p>
            This code expires in ${OTP_EXPIRY_MINUTES} minutes.
          </p>

          <p>
            If you did not create this account, you can ignore this email.
          </p>
        </div>
      `,
    });

    if (error) {
      await otpRef.delete();

      console.error("Resend error:", error);

      throw new HttpsError(
        "internal",
        "Unable to send verification email."
      );
    }

    return {
      success: true,
      message: "OTP sent successfully.",
    };
  }
);

export const verifyEmailOtp = onCall(
  {
    secrets: [otpSecret],
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "You must be signed in."
      );
    }

    const uid = request.auth.uid;

    const otp =
      typeof request.data?.otp === "string"
        ? request.data.otp.trim()
        : "";

    if (!/^\d{6}$/.test(otp)) {
      throw new HttpsError(
        "invalid-argument",
        "Enter a valid 6-digit OTP."
      );
    }

    const otpRef = db.collection("emailOtps").doc(uid);

    const otpSnapshot = await otpRef.get();

    if (!otpSnapshot.exists) {
      throw new HttpsError(
        "not-found",
        "No verification code was found."
      );
    }

    const otpData = otpSnapshot.data();

    if (!otpData) {
      throw new HttpsError(
        "internal",
        "Unable to read verification data."
      );
    }

    const attempts = Number(otpData.attempts ?? 0);

    if (attempts >= MAX_ATTEMPTS) {
      await otpRef.delete();

      throw new HttpsError(
        "permission-denied",
        "Too many incorrect attempts. Request a new OTP."
      );
    }

    const expiresAt = otpData.expiresAt as Timestamp;

    if (!expiresAt || expiresAt.toMillis() < Date.now()) {
      await otpRef.delete();

      throw new HttpsError(
        "deadline-exceeded",
        "Your verification code has expired."
      );
    }

    const storedHash = String(otpData.otpHash ?? "");
    const submittedHash = hashOtp(uid, otp);

    const storedBuffer = Buffer.from(storedHash, "hex");
    const submittedBuffer = Buffer.from(submittedHash, "hex");

    const matches =
      storedBuffer.length === submittedBuffer.length &&
      timingSafeEqual(storedBuffer, submittedBuffer);

    if (!matches) {
      await otpRef.update({
        attempts: FieldValue.increment(1),
      });

      throw new HttpsError(
        "invalid-argument",
        "Incorrect verification code."
      );
    }

    await adminAuth.updateUser(uid, {
      emailVerified: true,
    });

    await db.collection("users").doc(uid).set(
      {
        emailVerified: true,
        updatedAt: FieldValue.serverTimestamp(),
      },
      {
        merge: true,
      }
    );

    await otpRef.delete();

    return {
      success: true,
      emailVerified: true,
    };
  }
);