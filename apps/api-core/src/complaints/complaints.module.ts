import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import { ComplaintsController } from "./complaints.controller";
import { ComplaintsService } from "./complaints.service";

@Module({
  imports: [NotificationsModule],
  controllers: [ComplaintsController],
  providers: [ComplaintsService],
})
export class ComplaintsModule {}
