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

type VerificationEmailResponse = {
  success: boolean;
  alreadyVerified: boolean;
  message: string;
};

export async function registerUser(
  email: string,
  password: string
): Promise<UserCredential> {
  const userCredential = await createUserWithEmailAndPassword(
    auth,
    email.trim(),
    password
  );


  return userCredential;
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
  await user.reload();

  if (user.emailVerified) {
    return {
      success: true,
      alreadyVerified: true,
      message: "Email is already verified.",
    };
  }

  await sendEmailVerification(user);

  return {
    success: true,
    alreadyVerified: false,
    message: "Verification email sent.",
  };
}

export async function logoutUser(): Promise<void> {
  await signOut(auth);
}
