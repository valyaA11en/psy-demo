export interface JwtUser {
  sub: string;
  email: string;
  roles: string[];
  sessionId: string;
}
