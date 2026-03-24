import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";

@Injectable()
export class NotificationQueueService implements OnModuleDestroy {
  private readonly logger = new Logger(NotificationQueueService.name);
  private readonly queueKey: string;
  private readonly publisher: Redis | null;

  constructor(private readonly configService: ConfigService) {
    this.queueKey = this.configService.get<string>(
      "NOTIFICATION_QUEUE_KEY",
      "consultations.notifications.v1",
    );

    const redisUrl = this.configService.get<string>("REDIS_URL");
    if (!redisUrl) {
      this.publisher = null;
      this.logger.warn("REDIS_URL is missing; notification queue publishing is disabled");
      return;
    }

    this.publisher = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
    });
    this.publisher.on("error", (error) => {
      this.logger.error(`notification queue publish error: ${error.message}`);
    });
  }

  async enqueueMany(notificationIds: string[]) {
    if (!this.publisher || notificationIds.length === 0) {
      return false;
    }

    try {
      await this.publisher.lpush(this.queueKey, ...notificationIds);
      return true;
    } catch (error) {
      const nextError = error instanceof Error ? error.message : "unknown queue publish error";
      this.logger.warn(`failed to enqueue notifications: ${nextError}`);
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
