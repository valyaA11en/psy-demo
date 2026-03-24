export interface AuthenticatedSocketUser {
  sub: string;
  email: string;
  roles: string[];
  sessionId: string;
  exp: number;
}
