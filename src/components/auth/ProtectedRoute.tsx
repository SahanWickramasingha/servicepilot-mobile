import type { ReactNode } from "react";
import type { UserRole } from "@/src/services/user.service";
import { useMobileSessionAccess } from "@/src/hooks/useMobileSessionAccess";
import { SessionAccessFeedback } from "./SessionAccessFeedback";

type ProtectedRouteProps = {
  children: ReactNode;
  allowedRoles?: UserRole[];
};

export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const access = useMobileSessionAccess(allowedRoles?.join("|") ?? "");
  if (access.checking || access.errorMessage) {
    return <SessionAccessFeedback errorMessage={access.errorMessage} onRetry={access.retry} />;
  }
  if (!access.allowed) return null;
  return <>{children}</>;
}
