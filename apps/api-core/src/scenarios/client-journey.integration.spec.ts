import { JwtService } from "@nestjs/jwt";
import { AppointmentSlotStatus, ConsultationStatus, PaymentEventType, PaymentStatus, UserStatus } from "prisma-client-generated";
import { AuthService } from "../auth/auth.service";
import { SessionRevocationService } from "../auth/session-revocation.service";
import { TwoFactorService } from "../auth/two-factor.service";
import { TwoFactorStateService } from "../auth/two-factor-state.service";
import { BookingsService } from "../bookings/bookings.service";
import { PaymentsService } from "../payments/payments.service";
import { VideoSessionsService } from "../video-sessions/video-sessions.service";
import {
  CLIENT_JOURNEY_IDS,
  createClientJourneyConfig,
  createClientJourneyPrisma,
  createClientJourneyState,
  extractToken,
  makeRequest,
  makeResponse,
} from "./testing/client-journey.fixture";

describe("Client journey integration", () => {
  it("covers register, verify, login, book, pay and join flow", async () => {
    const prisma = createClientJourneyPrisma(createClientJourneyState());
    const jwt = new JwtService({});
    const config = createClientJourneyConfig();
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const notifications = { createQueuedNotifications: jest.fn().mockResolvedValue([]) };
    const realtime = { publishSafe: jest.fn().mockResolvedValue(undefined) };
    const revoke = { revokeMany: jest.fn().mockResolvedValue(true) };
    const auth = new AuthService(
      prisma,
      jwt,
      config as any,
      audit as any,
      notifications as any,
      revoke as unknown as SessionRevocationService,
      {} as TwoFactorService,
      {} as TwoFactorStateService,
    );
    const bookings = new BookingsService(prisma, audit as any, realtime as any, notifications as any);
    const payments = new PaymentsService(prisma, audit as any, realtime as any, notifications as any);
    const video = new VideoSessionsService(prisma, jwt, config as any, audit as any);
    const request = makeRequest();

    const registration: any = await auth.register(
      {
        email: "client@example.com",
        password: "Password123",
        accountType: "client",
        displayName: "Тестовый клиент",
      } as any,
      request,
    );

    expect(registration.requiresEmailVerification).toBe(true);

    const verified: any = await auth.verifyEmail(
      { token: extractToken(String(registration.debugVerificationLink)) } as any,
      request,
      makeResponse() as any,
    );

    expect(verified.user.email).toBe("client@example.com");
    expect(verified.user.status).toBe(UserStatus.active);

    const login: any = await auth.login(
      { email: "client@example.com", password: "Password123" } as any,
      request,
      makeResponse() as any,
    );

    expect(login.accessToken).toBeTruthy();
    expect(login.user.twoFactorEnabled).toBe(false);

    const booking: any = await bookings.createBooking(
      verified.user.id,
      { slotId: CLIENT_JOURNEY_IDS.slot, clientMessage: "Нужна первая консультация" } as any,
      "journey-booking-001",
      request,
    );

    expect(booking.status).toBe(ConsultationStatus.scheduled);
    expect(booking.slot.status).toBe(AppointmentSlotStatus.booked);

    const sessionBeforePayment: any = await video.getSession(booking.id, verified.user.id, ["client"]);
    expect(sessionBeforePayment.paymentStatus).toBe("payment_required");
    expect(sessionBeforePayment.canRequestAccess).toBe(false);

    const payment: any = await payments.createPayment(
      verified.user.id,
      { consultationId: booking.id } as any,
      "journey-payment-001",
      request,
    );

    expect(payment.status).toBe(PaymentStatus.pending);
    expect(payment.amount).toBe(3200);

    const confirmed: any = await payments.confirmMockPayment(
      payment.id,
      verified.user.id,
      ["client"],
      request,
    );

    expect(confirmed.status).toBe(PaymentStatus.succeeded);
    expect(confirmed.events.map((item: any) => item.eventType)).toEqual([
      PaymentEventType.created,
      PaymentEventType.succeeded,
    ]);

    const sessionReady: any = await video.getSession(booking.id, verified.user.id, ["client"]);
    expect(sessionReady.paymentStatus).toBe("paid");
    expect(sessionReady.canRequestAccess).toBe(true);

    const access: any = await video.issueAccess(booking.id, verified.user.id, ["client"], request);
    expect(access.accessToken).toBeTruthy();
    expect(access.joinUrl).toBe(`http://localhost:3000/session/${booking.id}`);

    expect(audit.log).toHaveBeenCalled();
    expect(notifications.createQueuedNotifications).toHaveBeenCalled();
    expect(realtime.publishSafe).toHaveBeenCalled();
  });
});
