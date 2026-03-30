import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import { HomeworkTasksController } from "./homework-tasks.controller";
import { HomeworkTasksService } from "./homework-tasks.service";

@Module({
  imports: [NotificationsModule],
  controllers: [HomeworkTasksController],
  providers: [HomeworkTasksService],
})
export class HomeworkTasksModule {}
