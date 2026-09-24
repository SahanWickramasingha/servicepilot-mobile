import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signOut,
  User,
  UserCredential,
} from "firebase/auth";

import { auth } from "@/src/firebase/config";

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
): Promise<void> {
  await sendEmailVerification(user);
}

export async function logoutUser(): Promise<void> {
  await signOut(auth);
}
