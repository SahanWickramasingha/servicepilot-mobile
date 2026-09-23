import { doc, serverTimestamp, setDoc } from "firebase/firestore";

import { db } from "@/src/firebase/config";

export interface UserProfileData {
  uid: string;
  fullName: string;
  email: string;
  phone: string;
  address: string;
  role: "customer" | "technician" | "dispatcher" | "admin";
}

export async function createUserProfile(
  data: UserProfileData
): Promise<void> {
  const userRef = doc(db, "users", data.uid);

  await setDoc(userRef, {
    uid: data.uid,
    fullName: data.fullName.trim(),
    email: data.email.trim().toLowerCase(),
    phone: data.phone.trim(),
    address: data.address.trim(),
    role: data.role,
    emailVerified: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}