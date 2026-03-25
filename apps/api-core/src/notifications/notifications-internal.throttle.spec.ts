import { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { Test, TestingModule } from "@nestjs/testing";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import request from "supertest";
import { createThrottlerOptions } from "../common/throttle/throttle.config";
import { NotificationsInternalController } from "./notifications-internal.controller";
import { NotificationsService } from "./notifications.service";

describe("NotificationsInternalController throttling", () => {
  let app: INestApplication;

  const mockNotificationsService = {
    consumeTelegramLink: jest.fn().mockResolvedValue({
      linked: true,
      alreadyLinked: false,
    }),
  };

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: unknown) => {
      switch (key) {
        case "THROTTLE_TTL":
          return 60;
        case "THROTTLE_LIMIT":
          return 100;
        case "AUTH_THROTTLE_TTL":
          return 60;
        case "AUTH_THROTTLE_LIMIT":
          return 100;
        case "WEBHOOK_THROTTLE_TTL":
          return 60;
        case "WEBHOOK_THROTTLE_LIMIT":
          return 2;
        case "WEBHOOK_SIGNING_SECRET":
          return "test-webhook-secret";
        default:
          return defaultValue;
      }
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot(createThrottlerOptions(mockConfigService as unknown as ConfigService)),
      ],
      controllers: [NotificationsInternalController],
      providers: [
        {
          provide: NotificationsService,
          useValue: mockNotificationsService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: APP_GUARD,
          useClass: ThrottlerGuard,
        },
      ],
    }).compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it("limits repeated webhook consume requests with webhook throttler", async () => {
    const payload = {
      token: "raw-token",
      chatId: "123456789",
    };

    await request(app.getHttpServer())
      .post("/internal/telegram-link/consume")
      .set("x-webhook-secret", "test-webhook-secret")
      .send(payload)
      .expect(201);

    await request(app.getHttpServer())
      .post("/internal/telegram-link/consume")
      .set("x-webhook-secret", "test-webhook-secret")
      .send(payload)
      .expect(201);

    await request(app.getHttpServer())
      .post("/internal/telegram-link/consume")
      .set("x-webhook-secret", "test-webhook-secret")
      .send(payload)
      .expect(429);

    expect(mockNotificationsService.consumeTelegramLink).toHaveBeenCalledTimes(2);
  });
});
