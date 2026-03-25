import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";

interface BookingSlotJob {
  profileId: string;
  rebuildOpenGeneratedSlots?: boolean;
  reason?: string;
  requestedByUserId?: string | null;
}

@Injectable()
export class BookingSlotQueueService implements OnModuleDestroy {
  private readonly logger = new Logger(BookingSlotQueueService.name);
  private readonly queueKey: string;
  private readonly publisher: Redis | null;

  constructor(private readonly configService: ConfigService) {
    this.queueKey = this.configService.get<string>(
      "BOOKING_SLOT_QUEUE_KEY",
      "consultations.booking-slots.v1",
    );

    const redisUrl = this.configService.get<string>("REDIS_URL");
    if (!redisUrl) {
      this.publisher = null;
      this.logger.warn("REDIS_URL is missing; booking slot queue publishing is disabled");
      return;
    }

    this.publisher = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
    });
    this.publisher.on("error", (error) => {
      this.logger.error(`booking slot queue publish error: ${error.message}`);
    });
  }

  async enqueueRebuild(profileId: string, input: Omit<BookingSlotJob, "profileId"> = {}) {
    return this.enqueueMany([
      {
        profileId,
        rebuildOpenGeneratedSlots: input.rebuildOpenGeneratedSlots ?? true,
        reason: input.reason,
        requestedByUserId: input.requestedByUserId ?? undefined,
      },
    ]);
  }

  private async enqueueMany(jobs: BookingSlotJob[]) {
    if (!this.publisher || jobs.length === 0) {
      return false;
    }

    try {
      const payloads = jobs.map((job) => JSON.stringify(job));
      await this.publisher.lpush(this.queueKey, ...payloads);
      return true;
    } catch (error) {
      const nextError = error instanceof Error ? error.message : "unknown queue publish error";
      this.logger.warn(`failed to enqueue booking slot jobs: ${nextError}`);
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
