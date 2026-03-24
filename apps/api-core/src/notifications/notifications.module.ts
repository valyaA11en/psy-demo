import { Module } from "@nestjs/common";
import { NotificationsInternalController } from "./notifications-internal.controller";
import { NotificationsController } from "./notifications.controller";
import { NotificationQueueService } from "./notification-queue.service";
import { NotificationsService } from "./notifications.service";

@Module({
  controllers: [NotificationsController, NotificationsInternalController],
  providers: [NotificationsService, NotificationQueueService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
