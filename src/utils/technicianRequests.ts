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

export function getRequestScheduleDate(
  request: ServiceRequest
): Date | null {
  if (
    request.scheduledAt &&
    typeof request.scheduledAt.toDate === "function"
  ) {
    return request.scheduledAt.toDate();
  }

  const dateText = request.preferredDate.trim();

  if (!dateText) {
    return null;
  }

  const dateParts = dateText.split("-").map(Number);

  if (
    dateParts.length !== 3 ||
    dateParts.some((part) => Number.isNaN(part))
  ) {
    const fallbackDate = new Date(
      `${dateText} ${request.preferredTime.trim()}`
    );
    return Number.isNaN(fallbackDate.getTime()) ? null : fallbackDate;
  }

  const [year, month, day] = dateParts;
  const { hours, minutes } = parsePreferredTime(request.preferredTime);

  return new Date(year, month - 1, day, hours, minutes);
}

function parsePreferredTime(timeText: string): {
  hours: number;
  minutes: number;
} {
  const trimmedTime = timeText.trim();

  if (!trimmedTime) {
    return { hours: 0, minutes: 0 };
  }

  const match = trimmedTime.match(
    /^(\d{1,2}):(\d{2})\s*([AP]M)?$/i
  );

  if (!match) {
    return { hours: 0, minutes: 0 };
  }

  const rawHours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[3]?.toUpperCase();
  let hours = rawHours;

  if (meridiem === "PM" && rawHours < 12) {
    hours += 12;
  }

  if (meridiem === "AM" && rawHours === 12) {
    hours = 0;
  }

  return { hours, minutes };
}

function isSameLocalCalendarDay(first: Date, second: Date) {
  return (
    first.getFullYear() === second.getFullYear() &&
    first.getMonth() === second.getMonth() &&
    first.getDate() === second.getDate()
  );
}

function getLocalStartOfToday() {
  const today = new Date();
  return new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  );
}

export function isRequestScheduledToday(
  request: ServiceRequest
): boolean {
  const scheduleDate = getRequestScheduleDate(request);

  if (!scheduleDate) {
    return false;
  }

  return isSameLocalCalendarDay(scheduleDate, new Date());
}

export function isFutureRequest(
  request: ServiceRequest
): boolean {
  const scheduleDate = getRequestScheduleDate(request);

  if (!scheduleDate) {
    return false;
  }

  return scheduleDate.getTime() >= Date.now();
}

export function isCurrentOrFutureRequest(
  request: ServiceRequest
): boolean {
  const scheduleDate = getRequestScheduleDate(request);

  if (!scheduleDate) {
    return false;
  }

  return scheduleDate.getTime() >= getLocalStartOfToday().getTime();
}

export function sortRequestsBySchedule(
  requests: ServiceRequest[]
): ServiceRequest[] {
  return [...requests].sort((first, second) => {
    const firstDate = getRequestScheduleDate(first);
    const secondDate = getRequestScheduleDate(second);

    if (firstDate && secondDate) {
      return firstDate.getTime() - secondDate.getTime();
    }

    if (firstDate) {
      return -1;
    }

    if (secondDate) {
      return 1;
    }

    return (
      (first.createdAt?.toMillis() ?? 0) -
      (second.createdAt?.toMillis() ?? 0)
    );
  });
}

export function getActiveTechnicianRequests(
  requests: ServiceRequest[]
): ServiceRequest[] {
  return sortRequestsBySchedule(
    requests.filter((request) => {
      const status = normalizeRequestStatus(request.status);
      return ["requested", "accepted", "in_progress"].includes(status);
    })
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
