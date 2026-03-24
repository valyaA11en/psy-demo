export interface VideoAccessTokenPayload {
  sub: string;
  consultationId: string;
  roomId: string;
  participantRole: "client" | "psychologist";
  tokenType: "video_access";
}
