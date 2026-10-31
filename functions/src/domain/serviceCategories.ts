/** Product catalogue. Account roles are deliberately not service categories.
 * Aliases are exact (case/whitespace normalized), never substring guesses.
 * "Electric Item" is ambiguous between wiring and appliances: no automatic alias.
 */
export const SERVICE_CATEGORY_DEFINITIONS = [
  { id: "electrical", label: "Electrical", aliases: ["electrician", "electrical installation"] },
  { id: "plumbing", label: "Plumbing", aliases: ["plumber", "plumbing services"] },
  { id: "air-conditioning", label: "Air Conditioning", aliases: ["ac", "a/c", "ac technician", "ac repair", "ac services"] },
  { id: "appliance-repair", label: "Appliance Repair", aliases: ["washing machine repair", "tv repair", "refrigerator repair"] },
  { id: "it-computer-support", label: "IT / Computer Support", aliases: ["computer repair", "it support"] },
  { id: "general-maintenance", label: "General Maintenance", aliases: [] },
  { id: "other", label: "Other", aliases: [] },
] as const;
export type ServiceCategoryId = typeof SERVICE_CATEGORY_DEFINITIONS[number]["id"];
export type ServiceCategoryLabel = typeof SERVICE_CATEGORY_DEFINITIONS[number]["label"];
export const SERVICE_CATEGORY_LABELS = SERVICE_CATEGORY_DEFINITIONS.map(category => category.label);
type CategoryFields = { serviceCategoryId?: unknown; serviceCategory?: unknown; specialization?: unknown };
const normalized = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");
export function resolveServiceCategory(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const key = normalized(value);
  return SERVICE_CATEGORY_DEFINITIONS.find(category =>
    [category.id, category.label, ...category.aliases].some(alias => normalized(alias) === key));
}
export function technicianCategory(profile: CategoryFields) {
  if (profile.serviceCategoryId !== undefined && profile.serviceCategoryId !== "") {
    // A malformed explicit ID must not be hidden by a legacy fallback.
    return SERVICE_CATEGORY_DEFINITIONS.find(category => category.id === profile.serviceCategoryId);
  }
  const explicit = resolveServiceCategory(profile.serviceCategory), legacy = resolveServiceCategory(profile.specialization);
  if (profile.specialization !== undefined &&
    (typeof profile.specialization !== "string" || profile.specialization.trim() !== "") && !legacy) return undefined;
  if (explicit && legacy && explicit.id !== legacy.id) return undefined;
  return explicit ?? legacy;
}
export function technicianCategoryLabel(profile: CategoryFields): string {
  return technicianCategory(profile)?.label ?? "Category needs review";
}
export function selectedTechnicianCategory(value: unknown): { serviceCategoryId: ServiceCategoryId; specialization: ServiceCategoryLabel } {
  const category = SERVICE_CATEGORY_DEFINITIONS.find(item => item.id === value);
  if (!category) throw new Error("Select a service category.");
  return { serviceCategoryId: category.id, specialization: category.label };
}
export function categoryFilterFromParam(value: string | string[] | undefined): ServiceCategoryId | "All" {
  return resolveServiceCategory(Array.isArray(value) ? value[0] : value)?.id ?? "All";
}
export function categoryDirectoryRoute(value: ServiceCategoryId | "All") {
  return { pathname: "/technicians" as const, params: { category: value, division: "All", search: "" } };
}
/** Read compatibility for valid old projections whose derived category is empty.
 * Keep the existing bounded page, and filter candidates using the shared resolver.
 */
export function categoryProjectionLabels(value: string): string[] {
  const category = resolveServiceCategory(value);
  if (!category) throw new Error("Select a valid service category.");
  return [category.label, ""];
}
