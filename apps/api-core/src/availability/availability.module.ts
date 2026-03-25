import { Module } from "@nestjs/common";
import { AvailabilityController } from "./availability.controller";
import { BookingSlotQueueService } from "./booking-slot-queue.service";
import { AvailabilityService } from "./availability.service";

@Module({
  controllers: [AvailabilityController],
  providers: [AvailabilityService, BookingSlotQueueService],
})
export class AvailabilityModule {}
