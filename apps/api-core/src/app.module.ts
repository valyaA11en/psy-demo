import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { AuthModule } from "./auth/auth.module";
import { AvailabilityModule } from "./availability/availability.module";
import { AuditModule } from "./audit/audit.module";
import { BookingsModule } from "./bookings/bookings.module";
import { CatalogModule } from "./catalog/catalog.module";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter";
import { RolesGuard } from "./common/guards/roles.guard";
import { ResponseEnvelopeInterceptor } from "./common/interceptors/response-envelope.interceptor";
import { HealthModule } from "./health/health.module";
import { PaymentsModule } from "./payments/payments.module";
import { PsychologistsModule } from "./psychologists/psychologists.module";
import { PrismaModule } from "./prisma/prisma.module";
import { RealtimeModule } from "./realtime/realtime.module";
import { UsersModule } from "./users/users.module";
import { VideoSessionsModule } from "./video-sessions/video-sessions.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ".env",
      cache: true,
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => [
        {
          ttl: configService.get<number>("THROTTLE_TTL", 60) * 1000,
          limit: configService.get<number>("THROTTLE_LIMIT", 20),
        },
      ],
    }),
    PrismaModule,
    AuditModule,
    RealtimeModule,
    HealthModule,
    AuthModule,
    AvailabilityModule,
    BookingsModule,
    PaymentsModule,
    VideoSessionsModule,
    UsersModule,
    CatalogModule,
    PsychologistsModule,
  ],
  providers: [
    RolesGuard,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseEnvelopeInterceptor,
    },
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
  ],
})
export class AppModule {}
