import { Logger } from "@nestjs/common";
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import type { Server, Socket } from "socket.io";
import { WsAuthService } from "./ws-auth.service";
import type { AuthenticatedSocketUser } from "./interfaces/authenticated-socket-data.interface";
import type { RealtimeDomainEvent } from "./interfaces/realtime-domain-event.interface";

@WebSocketGateway()
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  private server!: Server;

  private readonly logger = new Logger(RealtimeGateway.name);
  private readonly disconnectTimers = new Map<string, NodeJS.Timeout>();

  constructor(private readonly wsAuthService: WsAuthService) {}

  async handleConnection(client: Socket) {
    try {
      const user = await this.wsAuthService.authenticate(client);
      client.data.user = user;
      await this.joinAudienceRooms(client, user);
      this.scheduleDisconnect(client, user);

      client.emit("ws.ready", {
        userId: user.sub,
        roles: user.roles,
        expiresAt: new Date(user.exp * 1000).toISOString(),
      });

      this.logger.log(`client connected: ${client.id} user=${user.sub}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unauthorized";
      this.logger.warn(`socket auth failed: ${message}`);
      client.emit("ws.error", {
        message,
      });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    this.clearDisconnectTimer(client.id);
    const user = client.data.user as AuthenticatedSocketUser | undefined;
    this.logger.log(`client disconnected: ${client.id} user=${user?.sub ?? "unknown"}`);
  }

  emitDomainEvent(event: RealtimeDomainEvent) {
    const rooms = [
      ...event.audience.userIds.map((userId) => this.userRoom(userId)),
      ...(event.audience.roles ?? []).map((role) => this.roleRoom(role)),
    ];
    const uniqueRooms = [...new Set(rooms)];

    if (uniqueRooms.length === 0) {
      return;
    }

    let operator = this.server.to(uniqueRooms[0]);
    for (const room of uniqueRooms.slice(1)) {
      operator = operator.to(room);
    }

    operator.emit("domain_event", event);
    this.logger.debug(`domain event emitted: ${event.name} entity=${event.entity.id}`);
  }

  @SubscribeMessage("realtime:ping")
  handlePing(@ConnectedSocket() client: Socket, @MessageBody() body: Record<string, unknown> = {}) {
    const user = client.data.user as AuthenticatedSocketUser | undefined;

    return {
      ok: true,
      userId: user?.sub ?? null,
      echo: body.echo ?? null,
      timestamp: new Date().toISOString(),
    };
  }

  private async joinAudienceRooms(client: Socket, user: AuthenticatedSocketUser) {
    await client.join(this.userRoom(user.sub));

    for (const role of user.roles) {
      await client.join(this.roleRoom(role));
    }
  }

  private scheduleDisconnect(client: Socket, user: AuthenticatedSocketUser) {
    this.clearDisconnectTimer(client.id);
    const ttlMs = user.exp * 1000 - Date.now();

    if (ttlMs <= 0) {
      client.disconnect(true);
      return;
    }

    const timer = setTimeout(() => {
      client.emit("ws.expired", {
        message: "Access token expired",
      });
      client.disconnect(true);
    }, ttlMs);

    this.disconnectTimers.set(client.id, timer);
  }

  private clearDisconnectTimer(clientId: string) {
    const timer = this.disconnectTimers.get(clientId);
    if (timer) {
      clearTimeout(timer);
      this.disconnectTimers.delete(clientId);
    }
  }

  private userRoom(userId: string) {
    return `user:${userId}`;
  }

  private roleRoom(role: string) {
    return `role:${role}`;
  }
}
