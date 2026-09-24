export const SERVICE_CATEGORIES = [
  "Electrical",
  "Plumbing",
  "Air Conditioning",
  "Appliance Repair",
  "IT / Computer Support",
  "General Maintenance",
  "Other",
] as const;

export const REQUEST_STATUSES = [
  "requested",
  "accepted",
  "rejected",
  "in_progress",
  "completed",
  "cancelled",
] as const;

export const LEGACY_REQUEST_STATUSES = [
  "pending",
  "assigned",
] as const;

export const REQUEST_PRIORITIES = [
  "normal",
  "urgent",
] as const;

export type ServiceCategory =
  (typeof SERVICE_CATEGORIES)[number];

export type RequestStatus =
  | (typeof REQUEST_STATUSES)[number]
  | (typeof LEGACY_REQUEST_STATUSES)[number];

export type RequestPriority =
  (typeof REQUEST_PRIORITIES)[number];

export const ACTIVE_REQUEST_STATUSES: RequestStatus[] = [
  "requested",
  "accepted",
  "pending",
  "assigned",
  "in_progress",
];

export function normalizeRequestStatus(
  status: RequestStatus
): Exclude<RequestStatus, "pending" | "assigned"> {
  if (status === "pending") {
    return "requested";
  }

  if (status === "assigned") {
    return "accepted";
  }

  return status;
}

export function getRequestStatusLabel(
  status: RequestStatus
): string {
  switch (normalizeRequestStatus(status)) {
    case "requested":
      return "Requested";
    case "accepted":
      return "Accepted";
    case "rejected":
      return "Rejected";
    case "in_progress":
      return "In Progress";
    case "completed":
      return "Completed";
    case "cancelled":
      return "Cancelled";
  }
}

export function getRequestStatusColor(
  status: RequestStatus
): string {
  switch (normalizeRequestStatus(status)) {
    case "requested":
      return "#F59E0B";
    case "accepted":
      return "#3B82F6";
    case "rejected":
      return "#EF4444";
    case "in_progress":
      return "#22C55E";
    case "completed":
      return "#22C55E";
    case "cancelled":
      return "#EF4444";
  }
}

export function getPriorityLabel(
  priority: RequestPriority
): string {
  return priority === "urgent" ? "Urgent" : "Normal";
}

export function getPriorityColor(
  priority: RequestPriority
): string {
  return priority === "urgent" ? "#F97316" : "#22C55E";
}
