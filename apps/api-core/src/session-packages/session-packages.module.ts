import { Module } from "@nestjs/common";
import { SessionPackagesController } from "./session-packages.controller";
import { SessionPackagesService } from "./session-packages.service";

@Module({
  controllers: [SessionPackagesController],
  providers: [SessionPackagesService],
})
export class SessionPackagesModule {}
