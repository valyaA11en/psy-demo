import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { VideoSessionsController } from "./video-sessions.controller";
import { VideoSessionsService } from "./video-sessions.service";

@Module({
  imports: [JwtModule.register({})],
  controllers: [VideoSessionsController],
  providers: [VideoSessionsService],
})
export class VideoSessionsModule {}
