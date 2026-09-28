import {
  getPriorityColor,
  getPriorityLabel,
  getRequestStatusColor,
  getRequestStatusLabel,
  normalizeRequestStatus,
  RequestStatus,
} from "@/src/constants/serviceRequests";
import { ServiceRequest } from "@/src/services/request.service";

export function getRequestDisplayTitle(
  request: ServiceRequest
): string {
  return (
    request.title.trim() ||
    request.serviceCategory ||
    "Service Request"
  );
}

export function getRequestTimeLabel(
  request: ServiceRequest
): string {
  return request.preferredTime.trim() || "Time not set";
}

export function getRequestDateLabel(
  request: ServiceRequest
): string {
  return request.preferredDate.trim() || "Date not set";
}

export function isRequestScheduledToday(
  request: ServiceRequest
): boolean {
  const today = new Date().toISOString().slice(0, 10);
  return request.preferredDate.trim() === today;
}

export function isFutureRequest(
  request: ServiceRequest
): boolean {
  const requestDate = request.preferredDate.trim();

  if (!requestDate) {
    return true;
  }

  const today = new Date().toISOString().slice(0, 10);
  return requestDate >= today;
}

export function sortRequestsBySchedule(
  requests: ServiceRequest[]
): ServiceRequest[] {
  return [...requests].sort((first, second) => {
    const firstKey = `${first.preferredDate} ${first.preferredTime}`;
    const secondKey = `${second.preferredDate} ${second.preferredTime}`;
    return firstKey.localeCompare(secondKey);
  });
}

export function getActiveTechnicianRequests(
  requests: ServiceRequest[]
): ServiceRequest[] {
  return sortRequestsBySchedule(
    requests.filter((request) =>
      ["requested", "pending", "accepted", "assigned", "in_progress"].includes(
        request.status
      )
    )
  );
}

export function getUpcomingTechnicianRequests(
  requests: ServiceRequest[]
): ServiceRequest[] {
  return sortRequestsBySchedule(
    requests.filter((request) => {
      const status = normalizeRequestStatus(request.status);
      return (
        ["requested", "accepted"].includes(status) &&
        isFutureRequest(request)
      );
    })
  );
}

export function getCompletedTechnicianRequests(
  requests: ServiceRequest[]
): ServiceRequest[] {
  return requests.filter(
    (request) => normalizeRequestStatus(request.status) === "completed"
  );
}

export function getHistoryTechnicianRequests(
  requests: ServiceRequest[]
): ServiceRequest[] {
  return requests.filter((request) =>
    ["completed", "rejected", "cancelled"].includes(
      normalizeRequestStatus(request.status)
    )
  );
}

export function getStatusUi(status: RequestStatus) {
  return {
    label: getRequestStatusLabel(status),
    color: getRequestStatusColor(status),
  };
}

export function getPriorityUi(priority: ServiceRequest["priority"]) {
  return {
    label: getPriorityLabel(priority),
    color: getPriorityColor(priority),
  };
}

export function getRatingLabel(
  averageRating?: number,
  reviewCount?: number
): string {
  if (!averageRating || averageRating <= 0 || !reviewCount) {
    return "No ratings yet";
  }

  return `${averageRating.toFixed(1)} (${reviewCount} review${
    reviewCount === 1 ? "" : "s"
  })`;
}
