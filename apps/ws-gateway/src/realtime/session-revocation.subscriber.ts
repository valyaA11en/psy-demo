import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";
import { RealtimeGateway } from "./realtime.gateway";

type SessionRevocationEvent = {
  sessionId: string;
  userId: string;
  revokedAt: string;
};

@Injectable()
export class SessionRevocationSubscriber implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SessionRevocationSubscriber.name);
  private readonly channel: string;
  private readonly redisUrl: string | null;
  private subscriber: Redis | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly realtimeGateway: RealtimeGateway,
  ) {
    this.channel = this.configService.get<string>(
      "SESSION_REVOCATION_CHANNEL",
      "consultations.session-revoked.v1",
    );
    this.redisUrl = this.configService.get<string>("REDIS_URL") ?? null;
  }

  async onModuleInit() {
    if (!this.redisUrl) {
      this.logger.warn("REDIS_URL is missing; session revocation subscriber is disabled");
      return;
    }

    this.subscriber = new Redis(this.redisUrl, {
      maxRetriesPerRequest: null,
    });
    this.subscriber.on("error", (error) => {
      this.logger.error(`session revocation subscriber error: ${error.message}`);
    });
    this.subscriber.on("message", (channel, message) => {
      if (channel !== this.channel) {
        return;
      }

      this.forward(message);
    });

    await this.subscriber.subscribe(this.channel);
    this.logger.log(`subscribed to session revocation channel ${this.channel}`);
  }

  async onModuleDestroy() {
    if (!this.subscriber) {
      return;
    }

    await this.subscriber.quit().catch(() => null);
    this.subscriber = null;
  }

  private forward(message: string) {
    try {
      const event = JSON.parse(message) as SessionRevocationEvent;
      if (!event.sessionId) {
        return;
      }

      this.realtimeGateway.disconnectRevokedSession(event.sessionId);
    } catch (error) {
      const nextError = error instanceof Error ? error.message : "unknown parse error";
      this.logger.warn(`failed to parse session revocation event: ${nextError}`);
    }
  }
}
