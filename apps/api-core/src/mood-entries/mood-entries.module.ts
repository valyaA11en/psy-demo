import { Module } from "@nestjs/common";
import { MoodEntriesController } from "./mood-entries.controller";
import { MoodEntriesService } from "./mood-entries.service";

@Module({
  controllers: [MoodEntriesController],
  providers: [MoodEntriesService],
})
export class MoodEntriesModule {}
