jest.mock("ioredis");

import { SessionRevocationSubscriber } from "./session-revocation.subscriber";

const emitRedisEvent = (event: string, ...args: any[]) =>
  (jest.requireMock("ioredis") as any).__emitRedisEvent(event, ...args);
const getRedisMock = () => (jest.requireMock("ioredis") as any).__getRedisMock();
const resetRedisMock = () => (jest.requireMock("ioredis") as any).__resetRedisMock();

describe("SessionRevocationSubscriber", () => {
  const createConfigService = (redisUrl = "redis://localhost:6379") =>
    ({
      get: jest.fn((key: string, fallback?: unknown) => {
        const values: Record<string, unknown> = {
          REDIS_URL: redisUrl,
          SESSION_REVOCATION_CHANNEL: "consultations.session-revoked.v1",
        };
        return values[key] ?? fallback;
      }),
    }) as any;

  beforeEach(() => {
    jest.clearAllMocks();
    resetRedisMock();
  });

  it("subscribes to session revocation events and disconnects revoked sessions", async () => {
    const gateway = {
      disconnectRevokedSession: jest.fn(),
    } as any;
    const subscriber = new SessionRevocationSubscriber(createConfigService(), gateway);

    await subscriber.onModuleInit();

    expect(getRedisMock().subscribe).toHaveBeenCalledWith(
      "consultations.session-revoked.v1",
    );

    emitRedisEvent(
      "message",
      "consultations.session-revoked.v1",
      JSON.stringify({
        sessionId: "session-1",
        userId: "user-1",
        revokedAt: new Date().toISOString(),
      }),
    );

    expect(gateway.disconnectRevokedSession).toHaveBeenCalledWith("session-1");
  });

  it("ignores messages without session id", async () => {
    const gateway = {
      disconnectRevokedSession: jest.fn(),
    } as any;
    const subscriber = new SessionRevocationSubscriber(createConfigService(), gateway);

    await subscriber.onModuleInit();
    emitRedisEvent(
      "message",
      "consultations.session-revoked.v1",
      JSON.stringify({
        userId: "user-1",
        revokedAt: new Date().toISOString(),
      }),
    );

    expect(gateway.disconnectRevokedSession).not.toHaveBeenCalled();
  });

  it("does nothing when redis is disabled", async () => {
    const gateway = {
      disconnectRevokedSession: jest.fn(),
    } as any;
    const subscriber = new SessionRevocationSubscriber(createConfigService(""), gateway);

    await subscriber.onModuleInit();

    expect(getRedisMock().subscribe).not.toHaveBeenCalled();
    await subscriber.onModuleDestroy();
    expect(getRedisMock().quit).not.toHaveBeenCalled();
  });
});
