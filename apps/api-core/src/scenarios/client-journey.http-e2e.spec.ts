import { randomUUID } from "node:crypto";
import { ValidationPipe } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import request from "supertest";
import { AuthModule } from "../auth/auth.module";
import { SessionRevocationService } from "../auth/session-revocation.service";
import { AuditModule } from "../audit/audit.module";
import { AuditService } from "../audit/audit.service";
import { BookingsModule } from "../bookings/bookings.module";
import { ResponseEnvelopeInterceptor } from "../common/interceptors/response-envelope.interceptor";
import { HttpExceptionFilter } from "../common/filters/http-exception.filter";
import { NotificationsModule } from "../notifications/notifications.module";
import { NotificationsService } from "../notifications/notifications.service";
import { PaymentsModule } from "../payments/payments.module";
import { PrismaModule } from "../prisma/prisma.module";
import { PrismaService } from "../prisma/prisma.service";
import { RealtimeModule } from "../realtime/realtime.module";
import { RealtimeService } from "../realtime/realtime.service";
import { VideoSessionsModule } from "../video-sessions/video-sessions.module";
import {
  CLIENT_JOURNEY_IDS,
  createClientJourneyConfigValues,
  createClientJourneyPrisma,
  createClientJourneyState,
} from "./testing/client-journey.fixture";

describe("Client journey HTTP e2e", () => {
  let app: any;

  beforeAll(async () => {
    const prisma = createClientJourneyPrisma(createClientJourneyState());
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const notifications = { createQueuedNotifications: jest.fn().mockResolvedValue([]) };
    const realtime = { publishSafe: jest.fn().mockResolvedValue(undefined) };
    const revoke = { revokeMany: jest.fn().mockResolvedValue(true) };

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [createClientJourneyConfigValues],
        }),
        PrismaModule,
        AuditModule,
        RealtimeModule,
        NotificationsModule,
        AuthModule,
        BookingsModule,
        PaymentsModule,
        VideoSessionsModule,
      ],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(AuditService)
      .useValue(audit)
      .overrideProvider(NotificationsService)
      .useValue(notifications)
      .overrideProvider(RealtimeService)
      .useValue(realtime)
      .overrideProvider(SessionRevocationService)
      .useValue(revoke)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1");
    app.use(cookieParser());
    app.use((req: any, res: any, next: () => void) => {
      req.requestId = randomUUID();
      res.setHeader("x-request-id", String(req.requestId));
      next();
    });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    app.useGlobalInterceptors(new ResponseEnvelopeInterceptor());
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it("covers register, verify, login, book, pay and join via HTTP", async () => {
    const server = app.getHttpServer();

    const registerResponse = await request(server)
      .post("/api/v1/auth/register")
      .send({
        email: "client@example.com",
        password: "Password123",
        accountType: "client",
        displayName: "Тестовый клиент",
        acceptPrivacyPolicy: true,
        acceptPlatformTerms: true,
      })
      .expect(201);

    expect(registerResponse.body.data.requiresEmailVerification).toBe(true);
    expect(registerResponse.body.meta.requestId).toBeTruthy();

    const token = new URL(registerResponse.body.data.debugVerificationLink).searchParams.get("token");
    expect(token).toBeTruthy();

    const verifyResponse = await request(server)
      .post("/api/v1/auth/verify-email")
      .send({ token })
      .expect(200);

    expect(verifyResponse.body.data.user.email).toBe("client@example.com");
    expect(verifyResponse.headers["set-cookie"]?.[0]).toContain("refresh_token=");

    const loginResponse = await request(server)
      .post("/api/v1/auth/login")
      .send({
        email: "client@example.com",
        password: "Password123",
      })
      .expect(200);

    const accessToken = loginResponse.body.data.accessToken;
    expect(accessToken).toBeTruthy();
    expect(loginResponse.body.data.user.twoFactorEnabled).toBe(false);

    const bookingResponse = await request(server)
      .post("/api/v1/bookings")
      .set("authorization", `Bearer ${accessToken}`)
      .set("idempotency-key", "journey-booking-http-001")
      .send({
        slotId: CLIENT_JOURNEY_IDS.slot,
        clientMessage: "Нужна первая консультация",
      })
      .expect(201);

    const consultationId = bookingResponse.body.data.id;
    expect(bookingResponse.body.data.slot.status).toBe("booked");

    const sessionBeforePayment = await request(server)
      .get(`/api/v1/video-sessions/${consultationId}`)
      .set("authorization", `Bearer ${accessToken}`)
      .expect(200);

    expect(sessionBeforePayment.body.data.paymentStatus).toBe("payment_required");
    expect(sessionBeforePayment.body.data.canRequestAccess).toBe(false);

    const paymentResponse = await request(server)
      .post("/api/v1/payments")
      .set("authorization", `Bearer ${accessToken}`)
      .set("idempotency-key", "journey-payment-http-001")
      .send({ consultationId })
      .expect(201);

    const paymentId = paymentResponse.body.data.id;
    expect(paymentResponse.body.data.amount).toBe(3200);
    expect(paymentResponse.body.data.status).toBe("pending");

    const confirmResponse = await request(server)
      .post(`/api/v1/payments/${paymentId}/mock/confirm`)
      .set("authorization", `Bearer ${accessToken}`)
      .expect(201);

    expect(confirmResponse.body.data.status).toBe("succeeded");
    expect(confirmResponse.body.data.events.map((item: any) => item.eventType)).toEqual([
      "created",
      "succeeded",
    ]);

    const sessionReady = await request(server)
      .get(`/api/v1/video-sessions/${consultationId}`)
      .set("authorization", `Bearer ${accessToken}`)
      .expect(200);

    expect(sessionReady.body.data.paymentStatus).toBe("paid");
    expect(sessionReady.body.data.canRequestAccess).toBe(true);
    expect(sessionReady.body.data.provider).toBe("mock_video");

    const accessResponse = await request(server)
      .post(`/api/v1/video-sessions/${consultationId}/access`)
      .set("authorization", `Bearer ${accessToken}`)
      .expect(201);

    expect(accessResponse.body.data.accessToken).toBeTruthy();
    expect(accessResponse.body.data.joinUrl).toBe(
      `http://localhost:3000/session/${consultationId}`,
    );
  });
});
