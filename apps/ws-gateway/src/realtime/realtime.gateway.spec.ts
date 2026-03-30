import { UnauthorizedException } from "@nestjs/common";
import type { RealtimeDomainEvent } from "./interfaces/realtime-domain-event.interface";
import { RealtimeGateway } from "./realtime.gateway";

describe("RealtimeGateway", () => {
  const createSocket = (id = "socket-1") =>
    ({
      id,
      data: {},
      join: jest.fn().mockResolvedValue(undefined),
      emit: jest.fn(),
      disconnect: jest.fn(),
    }) as any;

  beforeEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it("authenticates a client, joins rooms and sends ready event", async () => {
    const wsAuthService = {
      authenticate: jest.fn().mockResolvedValue({
        sub: "user-1",
        email: "client@example.com",
        roles: ["client", "member"],
        sessionId: "session-1",
        exp: Math.floor(Date.now() / 1000) + 60,
      }),
    } as any;
    const gateway = new RealtimeGateway(wsAuthService);
    const client = createSocket();

    await gateway.handleConnection(client);
    gateway.handleDisconnect(client);

    expect(client.data.user).toEqual(
      expect.objectContaining({
        sub: "user-1",
        sessionId: "session-1",
      }),
    );
    expect(client.join).toHaveBeenCalledWith("user:user-1");
    expect(client.join).toHaveBeenCalledWith("role:client");
    expect(client.join).toHaveBeenCalledWith("role:member");
    expect(client.emit).toHaveBeenCalledWith(
      "ws.ready",
      expect.objectContaining({
        userId: "user-1",
        roles: ["client", "member"],
      }),
    );
  });

  it("rejects unauthorized connection attempts", async () => {
    const wsAuthService = {
      authenticate: jest.fn().mockRejectedValue(new UnauthorizedException("Invalid token")),
    } as any;
    const gateway = new RealtimeGateway(wsAuthService);
    const client = createSocket();

    await gateway.handleConnection(client);

    expect(client.emit).toHaveBeenCalledWith("ws.error", {
      message: "Invalid token",
    });
    expect(client.disconnect).toHaveBeenCalledWith(true);
  });

  it("disconnects the client when the access token expires", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-03-28T10:00:00.000Z"));

    const wsAuthService = {
      authenticate: jest.fn().mockResolvedValue({
        sub: "user-1",
        email: "client@example.com",
        roles: ["client"],
        sessionId: "session-expiring",
        exp: Math.floor(Date.now() / 1000) + 1,
      }),
    } as any;
    const gateway = new RealtimeGateway(wsAuthService);
    const client = createSocket();

    await gateway.handleConnection(client);
    await jest.advanceTimersByTimeAsync(1_100);

    expect(client.emit).toHaveBeenCalledWith("ws.expired", {
      message: "Access token expired",
    });
    expect(client.disconnect).toHaveBeenCalledWith(true);
  });

  it("disconnects all sockets bound to a revoked session", () => {
    const gateway = new RealtimeGateway({ authenticate: jest.fn() } as any);
    const matchingClient = createSocket("socket-a");
    matchingClient.data.user = { sub: "user-1", sessionId: "session-1" };
    const otherClient = createSocket("socket-b");
    otherClient.data.user = { sub: "user-2", sessionId: "session-2" };

    (gateway as any).server = {
      sockets: {
        sockets: new Map([
          [matchingClient.id, matchingClient],
          [otherClient.id, otherClient],
        ]),
      },
    };

    gateway.disconnectRevokedSession("session-1");

    expect(matchingClient.emit).toHaveBeenCalledWith("ws.revoked", {
      message: "Session has been revoked",
    });
    expect(matchingClient.disconnect).toHaveBeenCalledWith(true);
    expect(otherClient.disconnect).not.toHaveBeenCalled();
  });

  it("emits domain events to unique user and role rooms", () => {
    const gateway = new RealtimeGateway({ authenticate: jest.fn() } as any);
    const operator = {
      to: jest.fn().mockReturnThis(),
      emit: jest.fn(),
    };
    const server = {
      to: jest.fn().mockReturnValue(operator),
    };
    const event: RealtimeDomainEvent = {
      id: "event-1",
      version: 1,
      name: "payment.updated",
      occurredAt: new Date().toISOString(),
      entity: {
        type: "payment",
        id: "payment-1",
      },
      audience: {
        userIds: ["user-1", "user-1"],
        roles: ["client", "client"],
      },
      payload: {
        paymentId: "payment-1",
        status: "succeeded",
        requiresRefetch: true,
        source: "api-core",
      },
    };

    (gateway as any).server = server;
    gateway.emitDomainEvent(event);

    expect(server.to).toHaveBeenCalledWith("user:user-1");
    expect(operator.to).toHaveBeenCalledWith("role:client");
    expect(operator.emit).toHaveBeenCalledWith("domain_event", event);
  });

  it("returns pong payload with current user context", () => {
    const gateway = new RealtimeGateway({ authenticate: jest.fn() } as any);
    const client = createSocket();
    client.data.user = { sub: "user-9" };

    const result = gateway.handlePing(client, { echo: "ok" });

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        userId: "user-9",
        echo: "ok",
      }),
    );
  });
});
