import { LEGAL_CONTENT } from "@/functions/src/domain/legalPolicy";
export function deletionEmailURL(): string {
  return `mailto:${LEGAL_CONTENT.email}?subject=${encodeURIComponent("ServicePilot Account Deletion Request")}&body=${encodeURIComponent("I request deletion of my ServicePilot account and associated data.\nAccount role: \nI will send this from my registered email where possible. Please explain verification, deletion scope and any justified retention.\nI will not include passwords, tokens, private keys or unnecessary ID documents.")}`;
}
export async function openContactLink(url: string, open: (url: string) => Promise<unknown>): Promise<boolean> {
  try { await open(url); return true; } catch { return false; }
}
