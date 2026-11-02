import { FieldValue } from "firebase-admin/firestore";
import { createAccountLifecycleService as core } from "../domain/adminLifecycle";

export function createAccountLifecycleService(dependencies: Omit<Parameters<typeof core>[0], "serverTimestamp">) {
  return core({ ...dependencies, serverTimestamp: () => FieldValue.serverTimestamp() });
}
