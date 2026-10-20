import { SessionAccessFeedback } from "@/src/components/auth/SessionAccessFeedback";
import { useMobileSessionAccess } from "@/src/hooks/useMobileSessionAccess";

export default function Index() {
  const access = useMobileSessionAccess("", true);
  return <SessionAccessFeedback errorMessage={access.errorMessage} onRetry={access.retry} />;
}
