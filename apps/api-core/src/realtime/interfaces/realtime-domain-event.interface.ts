export type RealtimeEventName =
  | "booking.created"
  | "booking.cancelled"
  | "booking.completed"
  | "chat.message.created"
  | "payment.created"
  | "payment.updated"
  | "video.session_ready";

export interface RealtimeDomainEvent {
  id: string;
  version: 1;
  name: RealtimeEventName;
  occurredAt: string;
  entity: {
    type: "consultation" | "message" | "payment" | "video_session";
    id: string;
  };
  audience: {
    userIds: string[];
    roles?: string[];
  };
  payload: {
    consultationId?: string;
    messageId?: string;
    counterpartUserId?: string;
    paymentId?: string;
    status?: string;
    reasonCode?: string;
    requiresRefetch: true;
    source: "api-core";
  };
}
