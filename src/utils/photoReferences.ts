/** Versioned stable provider reference. Firebase paths remain readable for history. */
export function isR2Photo(value: string): boolean { return /^r2:v1:[a-f0-9]{64}$/.test(value); }
export function r2PhotoId(value: string): string {
  if (!isR2Photo(value)) throw new Error("Invalid saved photo reference.");
  return value.slice(6);
}
