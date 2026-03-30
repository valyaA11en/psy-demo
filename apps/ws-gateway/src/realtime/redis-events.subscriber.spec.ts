jest.mock("ioredis");

import { RedisEventsSubscriber } from "./redis-events.subscriber";

const emitRedisEvent = (event: string, ...args: any[]) =>
  (jest.requireMock("ioredis") as any).__emitRedisEvent(event, ...args);
const getRedisMock = () => (jest.requireMock("ioredis") as any).__getRedisMock();
const resetRedisMock = () => (jest.requireMock("ioredis") as any).__resetRedisMock();

describe("RedisEventsSubscriber", () => {
  const createConfigService = (redisUrl = "redis://localhost:6379") =>
    ({
      get: jest.fn((key: string, fallback?: unknown) => {
        const values: Record<string, unknown> = {
          REDIS_URL: redisUrl,
          REALTIME_REDIS_CHANNEL: "consultations.realtime.v1",
        };
        return values[key] ?? fallback;
      }),
    }) as any;

  beforeEach(() => {
    jest.clearAllMocks();
    resetRedisMock();
  });

  it("subscribes to the configured redis channel and forwards matching messages", async () => {
    const gateway = {
      emitDomainEvent: jest.fn(),
    } as any;
    const subscriber = new RedisEventsSubscriber(createConfigService(), gateway);

    await subscriber.onModuleInit();

    expect(getRedisMock().subscribe).toHaveBeenCalledWith("consultations.realtime.v1");

    emitRedisEvent(
      "message",
      "consultations.realtime.v1",
      JSON.stringify({
        id: "event-1",
        version: 1,
        name: "booking.created",
        occurredAt: new Date().toISOString(),
        entity: { type: "consultation", id: "consultation-1" },
        audience: { userIds: ["user-1"] },
        payload: { consultationId: "consultation-1", requiresRefetch: true, source: "api-core" },
      }),
    );

    expect(gateway.emitDomainEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "event-1",
        name: "booking.created",
      }),
    );
  });

  it("ignores malformed redis messages", async () => {
    const gateway = {
      emitDomainEvent: jest.fn(),
    } as any;
    const subscriber = new RedisEventsSubscriber(createConfigService(), gateway);

    await subscriber.onModuleInit();
    emitRedisEvent("message", "consultations.realtime.v1", "{bad-json");

    expect(gateway.emitDomainEvent).not.toHaveBeenCalled();
  });

  it("does nothing when redis is disabled", async () => {
    const gateway = {
      emitDomainEvent: jest.fn(),
    } as any;
    const subscriber = new RedisEventsSubscriber(createConfigService(""), gateway);

    await subscriber.onModuleInit();

    expect(getRedisMock().subscribe).not.toHaveBeenCalled();
    await subscriber.onModuleDestroy();
    expect(getRedisMock().quit).not.toHaveBeenCalled();
  });
});
