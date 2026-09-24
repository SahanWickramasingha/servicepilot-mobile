import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";

import {
  RequestPriority,
  RequestStatus,
  ServiceCategory,
} from "@/src/constants/serviceRequests";
import { auth, db } from "@/src/firebase/config";
import { UserProfile } from "@/src/services/user.service";
import {
  getApprovedTechnician,
  PublicTechnicianProfile,
} from "@/src/services/technician.service";

export interface ServiceRequest {
  id: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  technicianId: string;
  technicianName: string;
  serviceCategory: ServiceCategory;
  title: string;
  description: string;
  address: string;
  serviceArea: string;
  division: string;
  preferredDate: string;
  preferredTime: string;
  priority: RequestPriority;
  status: RequestStatus;
  assignedTechnicianId?: string | null;
  assignedTechnicianName?: string | null;
  assignedDispatcherId?: string | null;
  imageUrls: string[];
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  acceptedAt?: Timestamp;
  rejectedAt?: Timestamp;
  startedAt?: Timestamp;
  completedAt?: Timestamp;
  cancelledAt?: Timestamp;
  cancelledBy?: string;
}

export type CreateServiceRequestInput = {
  profile: UserProfile;
  technician: PublicTechnicianProfile;
  serviceCategory: ServiceCategory;
  title: string;
  description: string;
  address: string;
  division?: string;
  preferredDate: string;
  preferredTime?: string;
  priority: RequestPriority;
  imageUrls?: string[];
};

function mapServiceRequest(
  id: string,
  data: Record<string, unknown>
): ServiceRequest {
  return {
    id,
    customerId: String(data.customerId ?? ""),
    customerName: String(data.customerName ?? ""),
    customerEmail: String(data.customerEmail ?? ""),
    customerPhone: String(data.customerPhone ?? ""),
    technicianId: String(
      data.technicianId ??
        data.assignedTechnicianId ??
        ""
    ),
    technicianName: String(
      data.technicianName ??
        data.assignedTechnicianName ??
        ""
    ),
    serviceCategory:
      data.serviceCategory as ServiceCategory,
    title: String(data.title ?? ""),
    description: String(data.description ?? ""),
    address: String(data.address ?? ""),
    serviceArea: String(data.serviceArea ?? ""),
    division: String(
      data.division ?? data.serviceArea ?? ""
    ),
    preferredDate: String(data.preferredDate ?? ""),
    preferredTime: String(data.preferredTime ?? ""),
    priority: (data.priority ?? "normal") as RequestPriority,
    status: (data.status ?? "pending") as RequestStatus,
    assignedTechnicianId:
      (data.assignedTechnicianId as string | null | undefined) ??
      null,
    assignedTechnicianName:
      (data.assignedTechnicianName as string | null | undefined) ??
      null,
    assignedDispatcherId:
      (data.assignedDispatcherId as string | null | undefined) ??
      null,
    imageUrls: Array.isArray(data.imageUrls)
      ? (data.imageUrls as string[])
      : [],
    createdAt: data.createdAt as Timestamp | undefined,
    updatedAt: data.updatedAt as Timestamp | undefined,
    acceptedAt: data.acceptedAt as Timestamp | undefined,
    rejectedAt: data.rejectedAt as Timestamp | undefined,
    startedAt: data.startedAt as Timestamp | undefined,
    completedAt: data.completedAt as Timestamp | undefined,
    cancelledAt: data.cancelledAt as Timestamp | undefined,
    cancelledBy: data.cancelledBy as string | undefined,
  };
}

function sortByCreatedDesc(
  requests: ServiceRequest[]
): ServiceRequest[] {
  return [...requests].sort((first, second) => {
    const firstMillis = first.createdAt?.toMillis() ?? 0;
    const secondMillis = second.createdAt?.toMillis() ?? 0;
    return secondMillis - firstMillis;
  });
}

export async function createServiceRequest(
  input: CreateServiceRequestInput
): Promise<string> {
  const currentUser = auth.currentUser;

  if (!currentUser) {
    throw new Error("Please sign in before creating a request.");
  }

  if (currentUser.uid !== input.profile.uid) {
    throw new Error("Unable to create request for this account.");
  }

  const approvedTechnician = await getApprovedTechnician(
    input.technician.uid
  );

  if (!approvedTechnician) {
    throw new Error(
      "Please select an approved technician before creating a request."
    );
  }

  const requestRef = await addDoc(
    collection(db, "service_requests"),
    {
      customerId: currentUser.uid,
      customerName: input.profile.fullName.trim(),
      customerEmail: input.profile.email.trim().toLowerCase(),
      customerPhone: input.profile.phone.trim(),
      technicianId: approvedTechnician.uid,
      technicianName: approvedTechnician.fullName,
      serviceCategory: input.serviceCategory,
      title: input.title.trim(),
      description: input.description.trim(),
      address: input.address.trim(),
      serviceArea:
        input.division?.trim() ||
        approvedTechnician.serviceDivision,
      division:
        input.division?.trim() ||
        approvedTechnician.serviceDivision,
      preferredDate: input.preferredDate.trim(),
      preferredTime: input.preferredTime?.trim() ?? "",
      priority: input.priority,
      status: "requested",
      imageUrls: input.imageUrls ?? [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }
  );

  return requestRef.id;
}

export function subscribeToTechnicianRequests(
  technicianId: string,
  onNext: (requests: ServiceRequest[]) => void,
  onError: (error: Error) => void
) {
  const requestsQuery = query(
    collection(db, "service_requests"),
    where("technicianId", "==", technicianId)
  );

  return onSnapshot(
    requestsQuery,
    (snapshot) => {
      onNext(
        sortByCreatedDesc(
          snapshot.docs.map((item) =>
            mapServiceRequest(item.id, item.data())
          )
        )
      );
    },
    onError
  );
}

export function subscribeToCustomerRequests(
  customerId: string,
  onNext: (requests: ServiceRequest[]) => void,
  onError: (error: Error) => void
) {
  const requestsQuery = query(
    collection(db, "service_requests"),
    where("customerId", "==", customerId)
  );

  return onSnapshot(
    requestsQuery,
    (snapshot) => {
      onNext(
        sortByCreatedDesc(
          snapshot.docs.map((item) =>
            mapServiceRequest(item.id, item.data())
          )
        )
      );
    },
    onError
  );
}

export function subscribeToServiceRequest(
  requestId: string,
  onNext: (request: ServiceRequest | null) => void,
  onError: (error: Error) => void
) {
  return onSnapshot(
    doc(db, "service_requests", requestId),
    (snapshot) => {
      if (!snapshot.exists()) {
        onNext(null);
        return;
      }

      onNext(
        mapServiceRequest(snapshot.id, snapshot.data())
      );
    },
    onError
  );
}

export async function getServiceRequest(
  requestId: string
): Promise<ServiceRequest | null> {
  const snapshot = await getDoc(
    doc(db, "service_requests", requestId)
  );

  if (!snapshot.exists()) {
    return null;
  }

  return mapServiceRequest(snapshot.id, snapshot.data());
}

export async function cancelServiceRequest(
  requestId: string,
  customerId: string
): Promise<void> {
  await updateDoc(doc(db, "service_requests", requestId), {
    status: "cancelled",
    cancelledAt: serverTimestamp(),
    cancelledBy: customerId,
    updatedAt: serverTimestamp(),
  });
}

export async function updateTechnicianRequestStatus(
  requestId: string,
  status: "accepted" | "rejected" | "in_progress" | "completed"
): Promise<void> {
  const timestampField =
    status === "accepted"
      ? "acceptedAt"
      : status === "rejected"
        ? "rejectedAt"
        : status === "in_progress"
          ? "startedAt"
          : "completedAt";

  await updateDoc(doc(db, "service_requests", requestId), {
    status,
    [timestampField]: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export function formatRequestDate(
  timestamp?: Timestamp
): string {
  if (!timestamp) {
    return "Not available";
  }

  return timestamp.toDate().toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
