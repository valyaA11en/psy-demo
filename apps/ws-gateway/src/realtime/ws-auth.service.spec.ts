jest.mock("ioredis");

import { UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import Redis from "ioredis";
import { WsAuthService } from "./ws-auth.service";

const getRedisMock = () => (jest.requireMock("ioredis") as any).__getRedisMock();
const resetRedisMock = () => (jest.requireMock("ioredis") as any).__resetRedisMock();

describe("WsAuthService", () => {
  const jwtService = {
    verifyAsync: jest.fn(),
  } as unknown as JwtService;

  const createConfigService = (redisUrl = "redis://localhost:6379") =>
    ({
      get: jest.fn((key: string, fallback?: unknown) => {
        const values: Record<string, unknown> = {
          REDIS_URL: redisUrl,
          SESSION_REVOCATION_KEY_PREFIX: "consultations:session-revoked:v1:",
        };
        return values[key] ?? fallback;
      }),
      getOrThrow: jest.fn((key: string) => {
        if (key === "JWT_ACCESS_SECRET") {
          return "access-secret";
        }

        throw new Error(`Unexpected config key: ${key}`);
      }),
    }) as any;

  beforeEach(() => {
    jest.clearAllMocks();
    resetRedisMock();
  });

  it("authenticates a socket using handshake auth token", async () => {
    const service = new WsAuthService(jwtService, createConfigService());
    const client: any = {
      handshake: {
        auth: { token: "access-token" },
        headers: {},
      },
    };

    (jwtService.verifyAsync as jest.Mock).mockResolvedValue({
      sub: "user-1",
      email: "client@example.com",
      roles: ["client"],
      sessionId: "session-1",
      exp: Math.floor(Date.now() / 1000) + 60,
    });

    const result = await service.authenticate(client);

    expect(result).toEqual({
      sub: "user-1",
      email: "client@example.com",
      roles: ["client"],
      sessionId: "session-1",
      exp: expect.any(Number),
    });
    expect(jwtService.verifyAsync).toHaveBeenCalledWith("access-token", {
      secret: "access-secret",
    });
    expect(getRedisMock().exists).toHaveBeenCalledWith(
      "consultations:session-revoked:v1:session-1",
    );
  });

  it("authenticates using bearer header when handshake token is absent", async () => {
    const service = new WsAuthService(jwtService, createConfigService());
    const client: any = {
      handshake: {
        auth: {},
        headers: {
          authorization: "Bearer header-token",
        },
      },
    };

    (jwtService.verifyAsync as jest.Mock).mockResolvedValue({
      sub: "user-2",
      email: "psy@example.com",
      roles: ["psychologist"],
      sessionId: "session-2",
      exp: Math.floor(Date.now() / 1000) + 60,
    });

    const result = await service.authenticate(client);

    expect(result.sub).toBe("user-2");
    expect(jwtService.verifyAsync).toHaveBeenCalledWith("header-token", {
      secret: "access-secret",
    });
  });

  it("throws when token is missing", async () => {
    const service = new WsAuthService(jwtService, createConfigService());
    const client: any = {
      handshake: {
        auth: {},
        headers: {},
      },
    };

    await expect(service.authenticate(client)).rejects.toThrow(UnauthorizedException);
    expect(jwtService.verifyAsync).not.toHaveBeenCalled();
  });

  it("throws when session has been revoked", async () => {
    const service = new WsAuthService(jwtService, createConfigService());
    const client: any = {
      handshake: {
        auth: { token: "revoked-token" },
        headers: {},
      },
    };

    (jwtService.verifyAsync as jest.Mock).mockResolvedValue({
      sub: "user-3",
      email: "client@example.com",
      roles: ["client"],
      sessionId: "session-revoked",
      exp: Math.floor(Date.now() / 1000) + 60,
    });
    getRedisMock().exists.mockResolvedValue(1);

    await expect(service.authenticate(client)).rejects.toThrow("Session has been revoked");
  });

  it("skips revocation check when redis is disabled", async () => {
    const service = new WsAuthService(jwtService, createConfigService(""));
    const client: any = {
      handshake: {
        auth: { token: "no-redis-token" },
        headers: {},
      },
    };

    (jwtService.verifyAsync as jest.Mock).mockResolvedValue({
      sub: "user-4",
      email: "client@example.com",
      roles: ["client"],
      sessionId: "session-no-redis",
      exp: Math.floor(Date.now() / 1000) + 60,
    });

    const result = await service.authenticate(client);

    expect(result.sessionId).toBe("session-no-redis");
    expect(Redis).not.toHaveBeenCalled();
  });
});
