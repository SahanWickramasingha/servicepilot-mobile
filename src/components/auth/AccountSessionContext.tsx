import { createContext, useContext } from "react";
import type { User } from "firebase/auth";
import type { UserProfile } from "@/src/services/user.service";

export type AccountSessionState = {
  phase: "checking" | "signed-out" | "awaiting-verification" | "profile-setup" | "approval-pending" | "ready" | "denied" | "error";
  user?: User;
  profile?: UserProfile;
  message?: string;
};
export const AccountSessionContext = createContext<{ state: AccountSessionState; retry: () => void }>({ state: { phase: "checking" }, retry() {} });
export const useAccountSession = () => useContext(AccountSessionContext);
