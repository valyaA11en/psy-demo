import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { PrismaModule } from "../prisma/prisma.module";
import { PsychologistsController } from "./psychologists.controller";
import { PsychologistsService } from "./psychologists.service";

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [PsychologistsController],
  providers: [PsychologistsService],
})
export class PsychologistsModule {}
