export type UserRole =
  | "customer"
  | "technician"
  | "dispatcher"
  | "super_admin"
  | "admin";

export type AccountStatus = "active" | "disabled" | "deleted" | string;

export type TechnicianApprovalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | string;

export type UserRecord = {
  id: string;
  uid?: string;
  fullName?: string;
  email?: string;
  phone?: string;
  address?: string;
  role?: UserRole;
  accountStatus?: AccountStatus;
  invitationStatus?: "pending" | "accepted" | string;
  dispatcherId?: string;
  emailVerified?: boolean;
  createdBy?: string;
  disabledAt?: unknown;
  disabledBy?: string;
  enabledAt?: unknown;
  enabledBy?: string;
  deletedAt?: unknown;
  deletedBy?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
  technicianApprovalStatus?: TechnicianApprovalStatus;
  reviewedBy?: string | null;
  reviewedAt?: unknown;
  rejectionReason?: string | null;
  specialization?: string;
  experience?: string;
  qualifications?: string;
  certifications?: string;
  serviceAreas?: string;
  serviceDivision?: string;
  averageRating?: number;
  reviewCount?: number;
  completedJobs?: number;
};

export type ServiceRequestRecord = {
  id: string;
  customerId?: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  technicianId?: string;
  technicianName?: string;
  serviceCategory?: string;
  title?: string;
  description?: string;
  address?: string;
  serviceArea?: string;
  division?: string;
  preferredDate?: string;
  preferredTime?: string;
  scheduledAt?: unknown;
  priority?: "normal" | "urgent" | string;
  status?: string;
  imageUrls?: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
  acceptedAt?: unknown;
  rejectedAt?: unknown;
  startedAt?: unknown;
  completedAt?: unknown;
  cancelledAt?: unknown;
  cancelledBy?: string;
  rejectionReason?: string;
  technicianCancellationReason?: string;
  customerCancellationReason?: string;
};

export type ServiceReviewRecord = {
  id: string;
  requestId?: string;
  customerId?: string;
  technicianId?: string;
  rating?: number;
  comment?: string;
  createdAt?: unknown;
};

export type AuditLogRecord = {
  id: string;
  action?: string;
  actorUid?: string;
  actorRole?: string;
  targetUid?: string;
  targetType?: string;
  metadata?: Record<string, unknown>;
  createdAt?: unknown;
};
