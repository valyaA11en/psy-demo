export type ApiEnvelope<T> = {
  data: T;
  meta: {
    requestId: string | null;
  };
};

export type ApiErrorPayload = {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
};

export type Pagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type Specialization = {
  id: string;
  slug: string;
  name: string;
};

export type SlotPreview = {
  startsAt: string;
  endsAt: string;
};

export type PublicPsychologist = {
  id: string;
  slug: string;
  firstName: string;
  lastName: string;
  fullName: string;
  publicTitle?: string | null;
  bio?: string | null;
  experienceYears: number;
  priceFrom?: number | null;
  priceTo?: number | null;
  languages: string[];
  formats: string[];
  ratingAvg: number;
  reviewsCount: number;
  specializations: Specialization[];
  nextAvailableAt: string | null;
  upcomingSlots: SlotPreview[];
};

export type CatalogResponse = {
  items: PublicPsychologist[];
  pagination: Pagination;
  filters: {
    q: string | null;
    specialization: string | null;
    language: string | null;
    format: string | null;
    priceMin: number | null;
    priceMax: number | null;
    sort: string;
  };
};

export type AvailabilitySlot = {
  id: string;
  status: string;
  source: string;
  startsAt: string;
  endsAt: string;
  startsAtLocal: string;
  endsAtLocal: string;
  timezone: string;
  lockedUntil: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PublicSlotsResponse = {
  psychologist: {
    id: string;
    slug: string;
    fullName: string;
  };
  items: AvailabilitySlot[];
  filters: {
    dateFrom: string | null;
    dateTo: string | null;
    timezone: string;
    limit: number;
  };
};

export type AuthUser = {
  id: string;
  email: string;
  status: string;
  roles: string[];
  clientProfile?: {
    displayName?: string | null;
    timezone?: string | null;
  } | null;
  psychologistProfile?: {
    publicSlug?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    publicTitle?: string | null;
    approvalStatus?: string | null;
  } | null;
};

export type AuthSessionPayload = {
  accessToken: string;
  user: AuthUser;
};

export type LatestPayment = {
  id: string;
  provider: string;
  amount: number;
  currency: string;
  status: string;
  paidAt: string | null;
  createdAt: string;
};

export type DashboardBooking = {
  id: string;
  status: string;
  scheduledAt: string;
  cancelledAt: string | null;
  cancellationReasonCode: string | null;
  clientMessage?: string | null;
  createdAt: string;
  updatedAt: string;
  slot: {
    id: string;
    status: string;
    source: string;
    startsAt: string;
    endsAt: string;
  };
  psychologist?: {
    userId: string;
    slug: string | null;
    fullName: string | null;
    publicTitle: string | null;
  };
  client?: {
    userId: string;
    displayName: string;
    timezone: string | null;
  };
  latestPayment: LatestPayment | null;
  statusHistory?: Array<{
    id: string;
    fromStatus: string | null;
    toStatus: string;
    changedByRole: string | null;
    reasonCode: string | null;
    createdAt: string;
  }>;
};

export type BookingListResponse = {
  items: DashboardBooking[];
  pagination: Pagination;
  filters: {
    status: string | null;
    dateFrom: string | null;
    dateTo: string | null;
    timezone: string | null;
  };
};

export type PaymentRecord = {
  id: string;
  consultationId: string;
  provider: string;
  providerPaymentId?: string;
  amount: number;
  currency: string;
  status: string;
  paidAt: string | null;
  refundedAt: string | null;
  failureCode?: string | null;
  failureMessage?: string | null;
  createdAt: string;
  updatedAt: string;
  consultation: {
    id: string;
    scheduledAt: string;
    status: string;
  };
  psychologist?: {
    userId: string;
    slug: string | null;
    fullName: string | null;
    publicTitle: string | null;
  };
  client?: {
    userId: string;
    displayName: string;
    timezone: string | null;
  };
  mockCheckout?: {
    mode: string;
    confirmPath: string;
    failPath: string;
    cancelPath: string;
  };
  events?: Array<{
    id: string;
    eventType: string;
    createdAt: string;
  }>;
};

export type PaymentListResponse = {
  items: PaymentRecord[];
  pagination: Pagination;
  filters: {
    status: string | null;
    consultationId: string | null;
  };
};

export type SessionInfo = {
  consultationId: string;
  participantRole: "client" | "psychologist";
  consultationStatus: string;
  provider: string | null;
  roomId: string | null;
  scheduledAt: string;
  startsAt: string;
  endsAt: string;
  paymentStatus: string;
  joinUrl: string | null;
  accessWindow: {
    opensAt: string;
    closesAt: string;
  };
  accessPolicy: {
    participantsOnly: boolean;
    requiresSucceededPayment: boolean;
    opensBeforeStartMinutes: number;
    closesAfterEndMinutes: number;
  };
  canRequestAccess: boolean;
};

export type VideoAccessPayload = {
  consultationId: string;
  provider: string;
  roomId: string;
  participantRole: "client" | "psychologist";
  accessToken: string;
  issuedAt: string;
  expiresAt: string;
  expiresInSec: number;
  joinUrl: string;
};
