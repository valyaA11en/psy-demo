import { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { Test, TestingModule } from "@nestjs/testing";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import request from "supertest";
import { createThrottlerOptions } from "../common/throttle/throttle.config";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";

describe("AuthController throttling", () => {
  let app: INestApplication;

  const mockAuthService = {
    register: jest.fn(),
    login: jest.fn().mockResolvedValue({
      accessToken: "access-token",
      user: {
        id: "user-1",
      },
    }),
    refresh: jest.fn(),
    logout: jest.fn(),
    logoutAll: jest.fn(),
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
          return 2;
        case "WEBHOOK_THROTTLE_TTL":
          return 60;
        case "WEBHOOK_THROTTLE_LIMIT":
          return 100;
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
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: mockAuthService,
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

  it("limits repeated login attempts with auth throttler", async () => {
    const payload = {
      email: "client@example.com",
      password: "Client12345!",
    };

    await request(app.getHttpServer()).post("/auth/login").send(payload).expect(200);
    await request(app.getHttpServer()).post("/auth/login").send(payload).expect(200);
    await request(app.getHttpServer()).post("/auth/login").send(payload).expect(429);

    expect(mockAuthService.login).toHaveBeenCalledTimes(2);
  });
});
