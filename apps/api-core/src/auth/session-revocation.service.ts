import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";

type RevokedSession = {
  sessionId: string;
  userId: string;
  expiresAt: Date;
};

@Injectable()
export class SessionRevocationService implements OnModuleDestroy {
  private readonly logger = new Logger(SessionRevocationService.name);
  private readonly channel: string;
  private readonly keyPrefix: string;
  private readonly redis: Redis | null;

  constructor(private readonly configService: ConfigService) {
    this.channel = this.configService.get<string>(
      "SESSION_REVOCATION_CHANNEL",
      "consultations.session-revoked.v1",
    );
    this.keyPrefix = this.configService.get<string>(
      "SESSION_REVOCATION_KEY_PREFIX",
      "consultations:session-revoked:v1:",
    );

    const redisUrl = this.configService.get<string>("REDIS_URL");
    if (!redisUrl) {
      this.redis = null;
      this.logger.warn("REDIS_URL is missing; session revocation publishing is disabled");
      return;
    }

    this.redis = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
    });
    this.redis.on("error", (error) => {
      this.logger.error(`session revocation redis error: ${error.message}`);
    });
  }

  async revokeMany(sessions: RevokedSession[]) {
    if (!this.redis || sessions.length === 0) {
      return false;
    }

    const pipeline = this.redis.pipeline();
    const now = Date.now();

    for (const session of this.uniqueSessions(sessions)) {
      const ttlSec = Math.ceil((session.expiresAt.getTime() - now) / 1000);
      if (ttlSec <= 0) {
        continue;
      }

      const message = JSON.stringify({
        sessionId: session.sessionId,
        userId: session.userId,
        revokedAt: new Date().toISOString(),
      });

      pipeline.set(this.key(session.sessionId), message, "EX", ttlSec);
      pipeline.publish(this.channel, message);
    }

    try {
      await pipeline.exec();
      return true;
    } catch (error) {
      const nextError = error instanceof Error ? error.message : "unknown revocation error";
      this.logger.warn(`failed to publish session revocation: ${nextError}`);
      return false;
    }
  }

  async onModuleDestroy() {
    if (!this.redis) {
      return;
    }

    await this.redis.quit().catch(() => null);
  }

  private key(sessionId: string) {
    return `${this.keyPrefix}${sessionId}`;
  }

  private uniqueSessions(sessions: RevokedSession[]) {
    const map = new Map<string, RevokedSession>();

    for (const session of sessions) {
      map.set(session.sessionId, session);
    }

    return [...map.values()];
  }
}
