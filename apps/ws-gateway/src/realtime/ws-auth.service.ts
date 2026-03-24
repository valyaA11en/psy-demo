import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import type { Socket } from "socket.io";
import type { AuthenticatedSocketUser } from "./interfaces/authenticated-socket-data.interface";

type AccessTokenPayload = {
  sub: string;
  email: string;
  roles: string[];
  sessionId: string;
  exp: number;
};

@Injectable()
export class WsAuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async authenticate(client: Socket): Promise<AuthenticatedSocketUser> {
    const token = this.extractToken(client);

    if (!token) {
      throw new UnauthorizedException("Access token is required");
    }

    const payload = await this.jwtService.verifyAsync<AccessTokenPayload>(token, {
      secret: this.configService.getOrThrow<string>("JWT_ACCESS_SECRET"),
    });

    if (!payload.sub || !payload.sessionId || !payload.email || !Array.isArray(payload.roles)) {
      throw new UnauthorizedException("Access token payload is invalid");
    }

    if (!payload.exp || payload.exp * 1000 <= Date.now()) {
      throw new UnauthorizedException("Access token has expired");
    }

    return {
      sub: payload.sub,
      email: payload.email,
      roles: payload.roles,
      sessionId: payload.sessionId,
      exp: payload.exp,
    };
  }

  private extractToken(client: Socket) {
    const authToken = client.handshake.auth?.token;
    if (typeof authToken === "string" && authToken.trim()) {
      return authToken.trim();
    }

    const authorization = client.handshake.headers.authorization;
    if (typeof authorization === "string" && authorization.startsWith("Bearer ")) {
      return authorization.slice("Bearer ".length).trim();
    }

    return null;
  }
}
