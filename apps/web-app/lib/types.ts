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

export type PublicReview = {
  id: string;
  consultationId: string | null;
  rating: number;
  text: string | null;
  status: string;
  createdAt: string;
  authorName: string;
};

export type PublicReviewListResponse = {
  psychologist: {
    id: string;
    slug: string;
    fullName: string;
    ratingAvg: number;
    reviewsCount: number;
  };
  items: PublicReview[];
  pagination: Pagination;
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

export type AvailabilityRule = {
  id: string;
  weekday: string;
  startTime: string;
  endTime: string;
  slotDurationMin: number;
  bufferMin: number;
  timezone: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AvailabilityException = {
  id: string;
  startsAt: string;
  endsAt: string;
  reason: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PrivateFileRecord = {
  id: string;
  purpose: string;
  originalFilename: string | null;
  mimeType: string;
  sizeBytes: number;
  status: string;
  visibility: string;
  createdAt: string;
  uploadedAt: string | null;
  deletedAt: string | null;
  canDownload: boolean;
};

export type FilesListResponse = {
  items: PrivateFileRecord[];
  pagination: Pagination;
  filters: {
    purpose: string | null;
    status: string | null;
  };
};

export type FileUploadSession = {
  file: PrivateFileRecord;
  upload: {
    method: "PUT";
    url: string;
    headers: Record<string, string>;
    expiresAt: string;
    expiresInSec: number;
  };
};

export type FileDownloadSession = {
  url: string;
  expiresAt: string;
  expiresInSec: number;
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

export type MyAvailabilitySlotsResponse = {
  items: AvailabilitySlot[];
  filters: {
    dateFrom: string | null;
    dateTo: string | null;
    timezone: string;
    status: string | null;
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

export type RegisterResult = {
  success: true;
  requiresEmailVerification: true;
  email: string;
  verificationExpiresAt: string;
  debugVerificationLink?: string;
};

export type ResendVerificationResult = {
  success: true;
  message: string;
  debugVerificationLink?: string;
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

export type BookingReview = {
  id: string;
  consultationId: string | null;
  rating: number;
  text: string | null;
  status: string;
  createdAt: string;
  authorName?: string | null;
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
  review: BookingReview | null;
  canLeaveReview: boolean;
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

export type NotificationRecord = {
  id: string;
  channel: string;
  type: string;
  title: string;
  body: string;
  payload?: Record<string, unknown> | null;
  status: string;
  attempts: number;
  queuedAt: string;
  sentAt: string | null;
  failedAt: string | null;
  readAt: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

export type NotificationPreferences = {
  userId: string;
  inAppEnabled: boolean;
  emailEnabled: boolean;
  telegramEnabled: boolean;
  bookingUpdatesEnabled: boolean;
  paymentUpdatesEnabled: boolean;
  sessionUpdatesEnabled: boolean;
  systemUpdatesEnabled: boolean;
  telegramLinked: boolean;
  telegramChatIdMasked: string | null;
  telegramLinkedAt: string | null;
  telegramBotUsername: string | null;
  telegramLinkingAvailable: boolean;
  createdAt: string;
  updatedAt: string;
};

export type TelegramLinkSession = {
  botUsername: string;
  deepLink: string;
  tokenExpiresAt: string;
  expiresInSec: number;
};

export type NotificationListResponse = {
  items: NotificationRecord[];
  pagination: Pagination;
  filters: {
    status: string | null;
    unreadOnly: boolean;
  };
  unreadCount: number;
};

export type ComplaintRecord = {
  id: string;
  consultationId: string | null;
  type: string;
  text: string;
  status: string;
  resolutionNote: string | null;
  createdAt: string;
  authorUserId: string;
  target: {
    userId: string;
    displayName: string | null;
    publicTitle: string | null;
  } | null;
  consultation: {
    id: string;
    scheduledAt: string;
    status: string;
  } | null;
};

export type ComplaintListResponse = {
  items: ComplaintRecord[];
  pagination: Pagination;
  filters: {
    status: string | null;
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

export type RealtimeDomainEvent = {
  id: string;
  version: 1;
  name:
    | "booking.created"
    | "booking.cancelled"
    | "booking.completed"
    | "payment.created"
    | "payment.updated"
    | "video.session_ready";
  occurredAt: string;
  entity: {
    type: "consultation" | "payment" | "video_session";
    id: string;
  };
  audience: {
    userIds: string[];
    roles?: string[];
  };
  payload: {
    consultationId?: string;
    paymentId?: string;
    status?: string;
    reasonCode?: string;
    requiresRefetch: true;
    source: "api-core";
  };
};
