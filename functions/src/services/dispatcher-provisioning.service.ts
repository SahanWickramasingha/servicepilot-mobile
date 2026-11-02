import { FieldValue } from "firebase-admin/firestore";
import { createDispatcherProvisioner as core } from "../domain/adminProvisioning";
export { normalizeDispatcher } from "../domain/adminProvisioning";
export type { EmailDelivery } from "../domain/adminProvisioning";
export { TrustedRequestError as ProvisioningError } from "./trusted-auth";

// Node runtime supplies its native timestamp sentinel; the Worker supplies REST transforms.
export function createDispatcherProvisioner(dependencies: Omit<Parameters<typeof core>[0], "serverTimestamp">) {
  return core({ ...dependencies, serverTimestamp: () => FieldValue.serverTimestamp() });
}
