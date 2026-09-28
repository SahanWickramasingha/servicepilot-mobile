import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification,
  signOut,
  User,
  UserCredential,
} from "firebase/auth";

import { auth } from "@/src/firebase/config";
import {
  getFirebaseErrorCode,
  getFirebaseErrorMessage,
  logRegistrationDebug,
  logRegistrationError,
} from "@/src/utils/registrationDebug";

type VerificationEmailResponse = {
  success: boolean;
  alreadyVerified: boolean;
  message: string;
};

export async function registerUser(
  email: string,
  password: string
): Promise<UserCredential> {
  logRegistrationDebug({
    step: "createUserWithEmailAndPassword:start",
    uid: null,
    firebaseErrorCode: null,
    firebaseErrorMessage: null,
  });

  try {
    const userCredential = await createUserWithEmailAndPassword(
      auth,
      email.trim(),
      password
    );

    logRegistrationDebug({
      step: "createUserWithEmailAndPassword:success",
      uid: userCredential.user.uid,
      firebaseErrorCode: null,
      firebaseErrorMessage: null,
    });

    return userCredential;
  } catch (error) {
    logRegistrationError({
      step: "createUserWithEmailAndPassword:error",
      uid: null,
      firebaseErrorCode: getFirebaseErrorCode(error),
      firebaseErrorMessage: getFirebaseErrorMessage(error),
    });

    throw error;
  }
}

export async function loginUser(
  email: string,
  password: string
): Promise<UserCredential> {
  return await signInWithEmailAndPassword(
    auth,
    email.trim(),
    password
  );
}

export async function resetPassword(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email.trim());
}

export async function sendVerificationEmail(
  user: User
): Promise<VerificationEmailResponse> {
  logRegistrationDebug({
    step: "sendEmailVerification:reload-user:start",
    uid: user.uid,
    firebaseErrorCode: null,
    firebaseErrorMessage: null,
  });

  try {
    await user.reload();
  } catch (error) {
    logRegistrationError({
      step: "sendEmailVerification:reload-user:error",
      uid: user.uid,
      firebaseErrorCode: getFirebaseErrorCode(error),
      firebaseErrorMessage: getFirebaseErrorMessage(error),
    });

    throw error;
  }

  if (user.emailVerified) {
    logRegistrationDebug({
      step: "sendEmailVerification:already-verified",
      uid: user.uid,
      firebaseErrorCode: null,
      firebaseErrorMessage: null,
    });

    return {
      success: true,
      alreadyVerified: true,
      message: "Email is already verified.",
    };
  }

  logRegistrationDebug({
    step: "sendEmailVerification:start",
    uid: user.uid,
    firebaseErrorCode: null,
    firebaseErrorMessage: null,
  });

  try {
    await sendEmailVerification(user);
  } catch (error) {
    logRegistrationError({
      step: "sendEmailVerification:error",
      uid: user.uid,
      firebaseErrorCode: getFirebaseErrorCode(error),
      firebaseErrorMessage: getFirebaseErrorMessage(error),
    });

    throw error;
  }

  logRegistrationDebug({
    step: "sendEmailVerification:success",
    uid: user.uid,
    firebaseErrorCode: null,
    firebaseErrorMessage: null,
  });

  return {
    success: true,
    alreadyVerified: false,
    message: "Verification email sent.",
  };
}

export async function logoutUser(): Promise<void> {
  await signOut(auth);
}
