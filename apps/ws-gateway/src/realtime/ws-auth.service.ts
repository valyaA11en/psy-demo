import { Injectable, Logger, OnModuleDestroy, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import Redis from "ioredis";
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
export class WsAuthService implements OnModuleDestroy {
  private readonly logger = new Logger(WsAuthService.name);
  private readonly keyPrefix: string;
  private readonly redis: Redis | null;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    this.keyPrefix = this.configService.get<string>(
      "SESSION_REVOCATION_KEY_PREFIX",
      "consultations:session-revoked:v1:",
    );

    const redisUrl = this.configService.get<string>("REDIS_URL");
    if (!redisUrl) {
      this.redis = null;
      this.logger.warn("REDIS_URL is missing; websocket session revocation checks are disabled");
      return;
    }

    this.redis = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
    });
    this.redis.on("error", (error) => {
      this.logger.error(`ws auth redis error: ${error.message}`);
    });
  }

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

    if (await this.isSessionRevoked(payload.sessionId)) {
      throw new UnauthorizedException("Session has been revoked");
    }

    return {
      sub: payload.sub,
      email: payload.email,
      roles: payload.roles,
      sessionId: payload.sessionId,
      exp: payload.exp,
    };
  }

  async onModuleDestroy() {
    if (!this.redis) {
      return;
    }

    await this.redis.quit().catch(() => null);
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

  private async isSessionRevoked(sessionId: string) {
    if (!this.redis) {
      return false;
    }

    const result = await this.redis.exists(`${this.keyPrefix}${sessionId}`);
    return result > 0;
  }
}
