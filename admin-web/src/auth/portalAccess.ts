export type PortalRole = "super_admin" | "dispatcher";

export function assertRequestedPortalRole(actual: string | undefined, requested?: PortalRole): void {
  if (!requested || actual === requested) return;
  const label = actual === "dispatcher" ? "Dispatcher" : actual === "super_admin" ? "Super Admin" : "another";
  throw Object.assign(new Error(`This account uses the ${label} portal. Switch your selection and sign in again.`), {
    code: "auth/portal-mismatch", actualRole: actual,
  });
}

export function portalDestination(role: PortalRole, from: string): string {
  const prefix = role === "super_admin" ? "/admin/" : "/dispatcher/";
  try {
    const url = new URL(from, "https://portal.invalid");
    if (url.origin === "https://portal.invalid" && url.pathname.startsWith(prefix) && !from.includes("\\")) return url.pathname + url.search + url.hash;
  } catch { /* Invalid destinations return to the selected portal home. */ }
  return prefix + "dashboard";
}
