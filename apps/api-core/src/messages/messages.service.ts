import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, NotificationChannel } from "prisma-client-generated";
import type { Request } from "express";
import { AuditService } from "../audit/audit.service";
import type { CreateNotificationInput } from "../notifications/interfaces/create-notification-input.interface";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { RealtimeService } from "../realtime/realtime.service";
import { ListThreadQueryDto } from "./dto/list-thread-query.dto";
import { SendMessageDto } from "./dto/send-message.dto";

const messageInclude = {
  sender: {
    select: {
      id: true,
      clientProfile: {
        select: {
          displayName: true,
        },
      },
      psychologistProfile: {
        select: {
          publicSlug: true,
          firstName: true,
          lastName: true,
          publicTitle: true,
        },
      },
    },
  },
} satisfies Prisma.ChatMessageInclude;

type MessageRecord = Prisma.ChatMessageGetPayload<{
  include: typeof messageInclude;
}>;

type ConversationContext = {
  actorRole: "client" | "psychologist";
  clientUserId: string;
  psychologistUserId: string;
  counterpart: {
    userId: string;
    displayName: string;
    publicTitle: string | null;
    timezone: string | null;
  };
};

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly realtimeService: RealtimeService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async getThread(actorUserId: string, roles: string[], counterpartUserId: string, query: ListThreadQueryDto) {
    const context = await this.resolveConversationContext(actorUserId, roles, counterpartUserId);
    const limit = query.limit ?? 40;
    const before = this.parseOptionalDateTime(query.before);

    const [items, unreadCount] = await this.prisma.$transaction([
      this.prisma.chatMessage.findMany({
        where: {
          clientUserId: context.clientUserId,
          psychologistUserId: context.psychologistUserId,
          ...(before
            ? {
                createdAt: {
                  lt: before,
                },
              }
            : {}),
        },
        include: messageInclude,
        orderBy: {
          createdAt: "desc",
        },
        take: limit,
      }),
      this.prisma.chatMessage.count({
        where: {
          clientUserId: context.clientUserId,
          psychologistUserId: context.psychologistUserId,
          senderUserId: {
            not: actorUserId,
          },
          readAt: null,
        },
      }),
    ]);

    return {
      conversation: {
        counterpart: context.counterpart,
        actorRole: context.actorRole,
      },
      items: [...items].reverse().map((item) => this.serializeMessage(item, actorUserId)),
      unreadCount,
      filters: {
        limit,
        before: query.before ?? null,
      },
    };
  }

  async sendMessage(actorUserId: string, roles: string[], dto: SendMessageDto, request: Request) {
    const context = await this.resolveConversationContext(actorUserId, roles, dto.counterpartUserId);
    const body = this.normalizeBody(dto.body);
    const recipientUserId =
      context.actorRole === "client" ? context.psychologistUserId : context.clientUserId;

    const message = await this.prisma.chatMessage.create({
      data: {
        clientUserId: context.clientUserId,
        psychologistUserId: context.psychologistUserId,
        senderUserId: actorUserId,
        body,
      },
      include: messageInclude,
    });

    await this.auditService.log({
      actorUserId,
      actorRole: context.actorRole,
      action: "messages.create",
      entityType: "message",
      entityId: message.id,
      requestId: (request as any).requestId ?? null,
      ip: request.ip,
      userAgent: request.headers["user-agent"] ?? null,
      metadataJson: {
        counterpartUserId: dto.counterpartUserId,
      },
    });

    await this.realtimeService.publishSafe({
      name: "chat.message.created",
      entity: {
        type: "message",
        id: message.id,
      },
      audience: {
        userIds: [context.clientUserId, context.psychologistUserId],
      },
      payload: {
        messageId: message.id,
        counterpartUserId: dto.counterpartUserId,
      },
    });

    await this.notificationsService.createQueuedNotifications(
      this.notificationVariants({
        userId: recipientUserId,
        type: "chat.message.created",
        title:
          context.actorRole === "client"
            ? "Новое сообщение от клиента"
            : "Новое сообщение от психолога",
        body: this.buildNotificationBody(body),
        dedupKey: `chat.message.created:${message.id}`,
        payloadJson: {
          messageId: message.id,
          counterpartUserId: actorUserId,
        },
      }),
    );

    return this.serializeMessage(message, actorUserId);
  }

  async markThreadRead(actorUserId: string, roles: string[], counterpartUserId: string, request: Request) {
    const context = await this.resolveConversationContext(actorUserId, roles, counterpartUserId);

    const result = await this.prisma.chatMessage.updateMany({
      where: {
        clientUserId: context.clientUserId,
        psychologistUserId: context.psychologistUserId,
        senderUserId: {
          not: actorUserId,
        },
        readAt: null,
      },
      data: {
        readAt: new Date(),
      },
    });

    await this.auditService.log({
      actorUserId,
      actorRole: context.actorRole,
      action: "messages.read",
      entityType: "conversation",
      entityId: counterpartUserId,
      requestId: (request as any).requestId ?? null,
      ip: request.ip,
      userAgent: request.headers["user-agent"] ?? null,
      metadataJson: {
        updatedCount: result.count,
      },
    });

    return {
      updatedCount: result.count,
    };
  }

  private async resolveConversationContext(actorUserId: string, roles: string[], counterpartUserId: string) {
    if (actorUserId === counterpartUserId) {
      throw new BadRequestException("Нельзя отправлять сообщения самому себе");
    }

    const or: Prisma.ConsultationWhereInput[] = [];

    if (roles.includes("client")) {
      or.push({
        clientUserId: actorUserId,
        psychologistUserId: counterpartUserId,
      });
    }

    if (roles.includes("psychologist")) {
      or.push({
        clientUserId: counterpartUserId,
        psychologistUserId: actorUserId,
      });
    }

    const relationship = await this.prisma.consultation.findFirst({
      where: {
        OR: or,
      },
      orderBy: {
        scheduledAt: "desc",
      },
      select: {
        clientUserId: true,
        psychologistUserId: true,
        client: {
          select: {
            id: true,
            clientProfile: {
              select: {
                displayName: true,
                timezone: true,
              },
            },
          },
        },
        psychologist: {
          select: {
            id: true,
            psychologistProfile: {
              select: {
                firstName: true,
                lastName: true,
                publicTitle: true,
              },
            },
          },
        },
      },
    });

    if (!relationship) {
      throw new NotFoundException("Диалог недоступен");
    }

    if (relationship.clientUserId === actorUserId) {
      return {
        actorRole: "client" as const,
        clientUserId: relationship.clientUserId,
        psychologistUserId: relationship.psychologistUserId,
        counterpart: {
          userId: relationship.psychologist.id,
          displayName: relationship.psychologist.psychologistProfile
            ? `${relationship.psychologist.psychologistProfile.firstName} ${relationship.psychologist.psychologistProfile.lastName}`.trim()
            : `Психолог ${relationship.psychologist.id.slice(0, 6)}`,
          publicTitle: relationship.psychologist.psychologistProfile?.publicTitle ?? null,
          timezone: null,
        },
      };
    }

    return {
      actorRole: "psychologist" as const,
      clientUserId: relationship.clientUserId,
      psychologistUserId: relationship.psychologistUserId,
      counterpart: {
        userId: relationship.client.id,
        displayName:
          relationship.client.clientProfile?.displayName?.trim() || `Клиент ${relationship.client.id.slice(0, 6)}`,
        publicTitle: null,
        timezone: relationship.client.clientProfile?.timezone ?? null,
      },
    };
  }

  private serializeMessage(item: MessageRecord, actorUserId: string) {
    const senderDisplayName = item.sender.psychologistProfile
      ? `${item.sender.psychologistProfile.firstName} ${item.sender.psychologistProfile.lastName}`.trim()
      : item.sender.clientProfile?.displayName ?? `Пользователь ${item.sender.id.slice(0, 6)}`;

    return {
      id: item.id,
      body: item.body,
      createdAt: item.createdAt.toISOString(),
      readAt: item.readAt?.toISOString() ?? null,
      senderUserId: item.senderUserId,
      senderDisplayName,
      isMine: item.senderUserId === actorUserId,
    };
  }

  private normalizeBody(value: string) {
    const normalized = value.replace(/\s+/g, " ").trim();

    if (!normalized) {
      throw new BadRequestException("Сообщение не может быть пустым");
    }

    return normalized;
  }

  private parseOptionalDateTime(value: string | undefined) {
    if (!value) {
      return null;
    }

    const parsed = new Date(value);

    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException("Некорректный курсор before");
    }

    return parsed;
  }

  private buildNotificationBody(body: string) {
    return body.length > 140 ? `${body.slice(0, 137)}...` : body;
  }

  private notificationVariants(input: Omit<CreateNotificationInput, "channel">) {
    return [
      {
        ...input,
        channel: NotificationChannel.in_app,
      },
      {
        ...input,
        channel: NotificationChannel.email,
      },
      {
        ...input,
        channel: NotificationChannel.telegram,
      },
    ];
  }
}
