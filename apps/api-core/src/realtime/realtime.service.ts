import { randomUUID } from "node:crypto";
import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";
import type {
  RealtimeDomainEvent,
  RealtimeEventName,
} from "./interfaces/realtime-domain-event.interface";

type PublishInput = {
  name: RealtimeEventName;
  entity: RealtimeDomainEvent["entity"];
  audience: RealtimeDomainEvent["audience"];
  payload: Omit<RealtimeDomainEvent["payload"], "requiresRefetch" | "source"> &
    Partial<Pick<RealtimeDomainEvent["payload"], "requiresRefetch" | "source">>;
};

@Injectable()
export class RealtimeService implements OnModuleDestroy {
  private readonly logger = new Logger(RealtimeService.name);
  private readonly channel: string;
  private readonly publisher: Redis | null;

  constructor(private readonly configService: ConfigService) {
    this.channel = this.configService.get<string>(
      "REALTIME_REDIS_CHANNEL",
      "consultations.realtime.v1",
    );

    const redisUrl = this.configService.get<string>("REDIS_URL");
    if (!redisUrl) {
      this.publisher = null;
      this.logger.warn("REDIS_URL is missing; realtime publishing is disabled");
      return;
    }

    this.publisher = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
    });
    this.publisher.on("error", (error) => {
      this.logger.error(`redis publish error: ${error.message}`);
    });
  }

  async publishSafe(input: PublishInput) {
    if (!this.publisher) {
      return false;
    }

    const event: RealtimeDomainEvent = {
      id: randomUUID(),
      version: 1,
      name: input.name,
      occurredAt: new Date().toISOString(),
      entity: input.entity,
      audience: {
        userIds: [...new Set(input.audience.userIds)],
        roles: input.audience.roles?.length ? [...new Set(input.audience.roles)] : undefined,
      },
      payload: {
        requiresRefetch: input.payload.requiresRefetch ?? true,
        source: input.payload.source ?? "api-core",
        consultationId: input.payload.consultationId,
        messageId: input.payload.messageId,
        counterpartUserId: input.payload.counterpartUserId,
        paymentId: input.payload.paymentId,
        status: input.payload.status,
        reasonCode: input.payload.reasonCode,
      },
    };

    try {
      await this.publisher.publish(this.channel, JSON.stringify(event));
      return true;
    } catch (error) {
      const nextError = error instanceof Error ? error.message : "unknown publish error";
      this.logger.warn(`failed to publish realtime event ${input.name}: ${nextError}`);
      return false;
    }
  }

  async onModuleDestroy() {
    if (!this.publisher) {
      return;
    }

    await this.publisher.quit().catch(() => null);
  }
}
