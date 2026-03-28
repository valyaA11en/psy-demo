import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { AuditModule } from "../audit/audit.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { PrismaModule } from "../prisma/prisma.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { SessionRevocationService } from "./session-revocation.service";
import { TwoFactorService } from "./two-factor.service";
import { TwoFactorStateService } from "./two-factor-state.service";
import { JwtStrategy } from "./strategies/jwt.strategy";

@Module({
  imports: [PrismaModule, AuditModule, NotificationsModule, PassportModule, JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, SessionRevocationService, TwoFactorService, TwoFactorStateService],
  exports: [AuthService],
})
export class AuthModule {}
