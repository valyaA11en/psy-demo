export interface RefreshTokenPayload {
  sub: string;
  sessionId: string;
  tokenType: "refresh";
}
