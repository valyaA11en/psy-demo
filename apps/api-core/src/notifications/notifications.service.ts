import { createHash, randomBytes } from "node:crypto";
import { NotificationChannel, NotificationStatus, Prisma } from "prisma-client-generated";
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request } from "express";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { ConsumeTelegramLinkDto } from "./dto/consume-telegram-link.dto";
import { ListNotificationsQueryDto } from "./dto/list-notifications-query.dto";
import { UpdateNotificationPreferencesDto } from "./dto/update-notification-preferences.dto";
import { CreateNotificationInput } from "./interfaces/create-notification-input.interface";
import { NotificationQueueService } from "./notification-queue.service";

const notificationListSelect = {
  id: true,
  userId: true,
  channel: true,
  type: true,
  title: true,
  body: true,
  payloadJson: true,
  status: true,
  attempts: true,
  queuedAt: true,
  sentAt: true,
  failedAt: true,
  readAt: true,
  createdAt: true,
  updatedAt: true,
  lastErrorCode: true,
  lastErrorMessage: true,
} satisfies Prisma.NotificationSelect;

const notificationPreferenceSelect = {
  userId: true,
  inAppEnabled: true,
  emailEnabled: true,
  telegramEnabled: true,
  bookingUpdatesEnabled: true,
  paymentUpdatesEnabled: true,
  sessionUpdatesEnabled: true,
  systemUpdatesEnabled: true,
  telegramChatId: true,
  telegramLinkedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.NotificationPreferenceSelect;

const telegramLinkTokenSelect = {
  id: true,
  userId: true,
  tokenHash: true,
  expiresAt: true,
  usedAt: true,
  revokedAt: true,
  telegramChatId: true,
  telegramUserId: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.TelegramLinkTokenSelect;

type NotificationRecord = Prisma.NotificationGetPayload<{
  select: typeof notificationListSelect;
}>;

type NotificationPreferenceRecord = Prisma.NotificationPreferenceGetPayload<{
  select: typeof notificationPreferenceSelect;
}>;

type TelegramLinkTokenRecord = Prisma.TelegramLinkTokenGetPayload<{
  select: typeof telegramLinkTokenSelect;
}>;

type EffectivePreferenceState = {
  userId: string;
  inAppEnabled: boolean;
  emailEnabled: boolean;
  telegramEnabled: boolean;
  bookingUpdatesEnabled: boolean;
  paymentUpdatesEnabled: boolean;
  sessionUpdatesEnabled: boolean;
  systemUpdatesEnabled: boolean;
  telegramChatId: string | null;
  telegramLinkedAt: Date | null;
  createdAt: Date | null;
  updatedAt: Date | null;
};

type NotificationCategory = "booking" | "payment" | "session" | "system";

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly notificationQueueService: NotificationQueueService,
    private readonly configService: ConfigService,
  ) {}

  async listMyNotifications(userId: string, query: ListNotificationsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;
    const where: Prisma.NotificationWhereInput = {
      userId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.unreadOnly ? { readAt: null } : {}),
    };

    const [items, total, unreadCount] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        select: notificationListSelect,
        orderBy: {
          createdAt: "desc",
        },
        skip,
        take: limit,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({
        where: {
          userId,
          readAt: null,
        },
      }),
    ]);

    return {
      items: items.map((item) => this.serialize(item)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
      filters: {
        status: query.status ?? null,
        unreadOnly: query.unreadOnly ?? false,
      },
      unreadCount,
    };
  }

  async getMyPreferences(userId: string) {
    const preference = await this.getOrCreatePreference(userId);
    return this.serializePreferences(preference);
  }

  async updateMyPreferences(
    userId: string,
    dto: UpdateNotificationPreferencesDto,
    request: Request,
  ) {
    const existing = await this.getOrCreatePreference(userId);
    const nextTelegramChatId = this.resolveTelegramChatId(existing.telegramChatId, dto);
    const nextTelegramEnabled = dto.unlinkTelegram
      ? false
      : dto.telegramEnabled ?? existing.telegramEnabled;

    if (nextTelegramEnabled && !nextTelegramChatId) {
      throw new BadRequestException(
        "Чтобы включить Telegram-уведомления, сначала укажите telegramChatId",
      );
    }

    const updated = await this.prisma.notificationPreference.update({
      where: {
        userId,
      },
      data: {
        inAppEnabled: dto.inAppEnabled,
        emailEnabled: dto.emailEnabled,
        telegramEnabled: dto.unlinkTelegram ? false : dto.telegramEnabled,
        bookingUpdatesEnabled: dto.bookingUpdatesEnabled,
        paymentUpdatesEnabled: dto.paymentUpdatesEnabled,
        sessionUpdatesEnabled: dto.sessionUpdatesEnabled,
        systemUpdatesEnabled: dto.systemUpdatesEnabled,
        telegramChatId: this.resolveTelegramChatIdUpdate(dto),
        telegramLinkedAt: this.resolveTelegramLinkedAtUpdate(existing.telegramChatId, dto),
      },
      select: notificationPreferenceSelect,
    });

    await this.auditService.log({
      actorUserId: userId,
      actorRole: null,
      action: "notifications.update_preferences",
      entityType: "notification_preference",
      entityId: userId,
      requestId: (request as any).requestId ?? null,
      ip: request.ip,
      userAgent: request.headers["user-agent"] ?? null,
      metadataJson: {
        fields: Object.keys(dto),
        telegramLinked: Boolean(updated.telegramChatId),
        telegramEnabled: updated.telegramEnabled,
      },
    });

    return this.serializePreferences(updated);
  }

  async createTelegramLink(userId: string, request: Request) {
    const botUsername = this.getTelegramBotUsername();
    if (!botUsername) {
      throw new BadRequestException("Telegram linking недоступен: bot username не настроен");
    }

    await this.getOrCreatePreference(userId);

    await this.prisma.telegramLinkToken.updateMany({
      where: {
        userId,
        usedAt: null,
        revokedAt: null,
        expiresAt: {
          gt: new Date(),
        },
      },
      data: {
        revokedAt: new Date(),
      },
    });

    const rawToken = this.generateTelegramLinkToken();
    const expiresAt = new Date(Date.now() + this.getTelegramLinkTokenTtlMs());

    await this.prisma.telegramLinkToken.create({
      data: {
        userId,
        tokenHash: this.hashTelegramLinkToken(rawToken),
        expiresAt,
      },
      select: {
        id: true,
      },
    });

    await this.auditService.log({
      actorUserId: userId,
      actorRole: null,
      action: "notifications.telegram_link.create",
      entityType: "telegram_link_token",
      entityId: userId,
      requestId: (request as any).requestId ?? null,
      ip: request.ip,
      userAgent: request.headers["user-agent"] ?? null,
      metadataJson: {
        expiresAt: expiresAt.toISOString(),
      },
    });

    return {
      botUsername,
      deepLink: `https://t.me/${botUsername}?start=${rawToken}`,
      tokenExpiresAt: expiresAt.toISOString(),
      expiresInSec: Math.floor((expiresAt.getTime() - Date.now()) / 1000),
    };
  }

  async consumeTelegramLink(dto: ConsumeTelegramLinkDto, request: Request) {
    const tokenHash = this.hashTelegramLinkToken(dto.token);
    const token = await this.prisma.telegramLinkToken.findUnique({
      where: {
        tokenHash,
      },
      select: telegramLinkTokenSelect,
    });

    if (!token) {
      throw new NotFoundException("Telegram link token не найден");
    }

    if (token.revokedAt) {
      throw new BadRequestException("Telegram link token уже отозван");
    }

    if (token.expiresAt <= new Date()) {
      throw new BadRequestException("Telegram link token истёк");
    }

    if (token.usedAt) {
      if (token.telegramChatId === dto.chatId) {
        return {
          linked: true,
          alreadyLinked: true,
        };
      }

      throw new BadRequestException("Telegram link token уже использован");
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.notificationPreference.upsert({
        where: {
          userId: token.userId,
        },
        update: {
          telegramChatId: dto.chatId,
          telegramEnabled: true,
          telegramLinkedAt: new Date(),
        },
        create: {
          userId: token.userId,
          telegramChatId: dto.chatId,
          telegramEnabled: true,
          telegramLinkedAt: new Date(),
        },
      });

      await tx.telegramLinkToken.update({
        where: {
          id: token.id,
        },
        data: {
          usedAt: new Date(),
          telegramChatId: dto.chatId,
          telegramUserId: dto.telegramUserId?.trim() || null,
        },
      });

      await tx.telegramLinkToken.updateMany({
        where: {
          userId: token.userId,
          id: {
            not: token.id,
          },
          usedAt: null,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      });
    });

    await this.auditService.log({
      actorUserId: token.userId,
      actorRole: "system",
      action: "notifications.telegram_link.consume",
      entityType: "telegram_link_token",
      entityId: token.id,
      requestId: (request as any).requestId ?? null,
      ip: request.ip,
      userAgent: request.headers["user-agent"] ?? null,
      metadataJson: {
        chatId: dto.chatId,
        telegramUserId: dto.telegramUserId?.trim() || null,
        username: dto.username?.trim() || null,
      },
    });

    await this.createQueuedNotifications([
      {
        userId: token.userId,
        channel: NotificationChannel.in_app,
        type: "system.telegram_linked",
        title: "Telegram подключён",
        body: "Привязка Telegram завершена. Теперь уведомления можно получать через бота.",
        dedupKey: `system.telegram_linked:${token.id}`,
        payloadJson: {
          channel: "telegram",
          linkedAt: new Date().toISOString(),
        },
      },
    ]);

    return {
      linked: true,
      alreadyLinked: false,
    };
  }

  async markRead(notificationId: string, userId: string) {
    const notification = await this.prisma.notification.findUnique({
      where: {
        id: notificationId,
      },
      select: notificationListSelect,
    });

    if (!notification) {
      throw new NotFoundException("Уведомление не найдено");
    }

    if (notification.userId !== userId) {
      throw new ForbiddenException("У вас нет доступа к этому уведомлению");
    }

    if (notification.readAt) {
      return this.serialize(notification);
    }

    const updated = await this.prisma.notification.update({
      where: {
        id: notificationId,
      },
      data: {
        readAt: new Date(),
      },
      select: notificationListSelect,
    });

    return this.serialize(updated);
  }

  async markAllRead(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: {
        userId,
        readAt: null,
      },
      data: {
        readAt: new Date(),
      },
    });

    return {
      updatedCount: result.count,
    };
  }

  async createQueuedNotifications(inputs: CreateNotificationInput[]) {
    const createdIds: string[] = [];
    const userIds = [...new Set(inputs.map((input) => input.userId))];
    const storedPreferences = userIds.length
      ? await this.prisma.notificationPreference.findMany({
          where: {
            userId: {
              in: userIds,
            },
          },
          select: notificationPreferenceSelect,
        })
      : [];

    const preferenceMap = new Map(
      storedPreferences.map((preference) => [preference.userId, this.toEffectivePreferenceState(preference)]),
    );

    const eligibleInputs: Array<CreateNotificationInput & { channel: NotificationChannel }> = [];
    const batchDedupKeys = new Set<string>();

    for (const input of inputs) {
      const channel = input.channel ?? NotificationChannel.in_app;
      const preference =
        preferenceMap.get(input.userId) ?? this.createDefaultPreferenceState(input.userId);

      if (!this.canCreateNotification(preference, channel, input.type)) {
        continue;
      }

      const key = this.notificationBatchKey(input.userId, channel, input.dedupKey);
      if (batchDedupKeys.has(key)) {
        continue;
      }

      batchDedupKeys.add(key);
      eligibleInputs.push({
        ...input,
        channel,
      });
    }

    if (eligibleInputs.length === 0) {
      await this.notificationQueueService.enqueueMany([]);
      return [];
    }

    const existingNotifications = await this.prisma.notification.findMany({
      where: {
        OR: eligibleInputs.map((input) => ({
          userId: input.userId,
          channel: input.channel,
          dedupKey: input.dedupKey,
        })),
      },
      select: {
        id: true,
        userId: true,
        channel: true,
        dedupKey: true,
      },
    });

    const existingKeys = new Set(
      existingNotifications.map((item) =>
        this.notificationBatchKey(item.userId, item.channel, item.dedupKey),
      ),
    );

    const toCreate = eligibleInputs.filter(
      (input) => !existingKeys.has(this.notificationBatchKey(input.userId, input.channel, input.dedupKey)),
    );

    for (const batch of this.chunk(toCreate, 25)) {
      const createdBatch = await Promise.all(
        batch.map((input) =>
          this.prisma.notification
            .create({
              data: {
                userId: input.userId,
                channel: input.channel,
                type: input.type,
                title: input.title,
                body: input.body,
                dedupKey: input.dedupKey,
                payloadJson:
                  input.payloadJson === undefined
                    ? undefined
                    : input.payloadJson === null
                      ? Prisma.JsonNull
                      : input.payloadJson,
                status: NotificationStatus.queued,
              },
              select: {
                id: true,
              },
            })
            .catch((error: unknown) => {
              if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
                return null;
              }

              throw error;
            }),
        ),
      );

      for (const created of createdBatch) {
        if (created) {
          createdIds.push(created.id);
        }
      }
    }

    await this.notificationQueueService.enqueueMany(createdIds);
    return createdIds;
  }

  private notificationBatchKey(userId: string, channel: NotificationChannel, dedupKey: string) {
    return `${userId}:${channel}:${dedupKey}`;
  }

  private chunk<T>(items: T[], size: number) {
    const result: T[][] = [];

    for (let index = 0; index < items.length; index += size) {
      result.push(items.slice(index, index + size));
    }

    return result;
  }

  private async getOrCreatePreference(userId: string) {
    return this.prisma.notificationPreference.upsert({
      where: {
        userId,
      },
      update: {},
      create: {
        userId,
      },
      select: notificationPreferenceSelect,
    });
  }

  private resolveTelegramChatId(currentValue: string | null, dto: UpdateNotificationPreferencesDto) {
    if (dto.unlinkTelegram || dto.telegramChatId === null) {
      return null;
    }

    if (dto.telegramChatId !== undefined) {
      return dto.telegramChatId.trim();
    }

    return currentValue;
  }

  private resolveTelegramChatIdUpdate(dto: UpdateNotificationPreferencesDto) {
    if (dto.unlinkTelegram || dto.telegramChatId === null) {
      return null;
    }

    if (dto.telegramChatId !== undefined) {
      return dto.telegramChatId.trim();
    }

    return undefined;
  }

  private resolveTelegramLinkedAtUpdate(
    currentValue: string | null,
    dto: UpdateNotificationPreferencesDto,
  ) {
    if (dto.unlinkTelegram || dto.telegramChatId === null) {
      return null;
    }

    if (dto.telegramChatId !== undefined) {
      return currentValue === dto.telegramChatId.trim() ? undefined : new Date();
    }

    return undefined;
  }

  private canCreateNotification(
    preference: EffectivePreferenceState,
    channel: NotificationChannel,
    type: string,
  ) {
    if (!this.isChannelEnabled(preference, channel)) {
      return false;
    }

    if (!this.isCategoryEnabled(preference, this.resolveCategory(type))) {
      return false;
    }

    if (channel === NotificationChannel.telegram && !preference.telegramChatId) {
      return false;
    }

    return true;
  }

  private isChannelEnabled(
    preference: EffectivePreferenceState,
    channel: NotificationChannel,
  ) {
    switch (channel) {
      case NotificationChannel.in_app:
        return preference.inAppEnabled;
      case NotificationChannel.email:
        return preference.emailEnabled;
      case NotificationChannel.telegram:
        return preference.telegramEnabled;
      default:
        return false;
    }
  }

  private isCategoryEnabled(
    preference: EffectivePreferenceState,
    category: NotificationCategory,
  ) {
    switch (category) {
      case "booking":
        return preference.bookingUpdatesEnabled;
      case "payment":
        return preference.paymentUpdatesEnabled;
      case "session":
        return preference.sessionUpdatesEnabled;
      case "system":
      default:
        return preference.systemUpdatesEnabled;
    }
  }

  private resolveCategory(type: string): NotificationCategory {
    if (type.startsWith("booking.")) {
      return "booking";
    }

    if (type.startsWith("payment.")) {
      return "payment";
    }

    if (type.startsWith("video.")) {
      return "session";
    }

    return "system";
  }

  private createDefaultPreferenceState(userId: string): EffectivePreferenceState {
    return {
      userId,
      inAppEnabled: true,
      emailEnabled: true,
      telegramEnabled: false,
      bookingUpdatesEnabled: true,
      paymentUpdatesEnabled: true,
      sessionUpdatesEnabled: true,
      systemUpdatesEnabled: true,
      telegramChatId: null,
      telegramLinkedAt: null,
      createdAt: null,
      updatedAt: null,
    };
  }

  private toEffectivePreferenceState(
    preference: NotificationPreferenceRecord,
  ): EffectivePreferenceState {
    return {
      userId: preference.userId,
      inAppEnabled: preference.inAppEnabled,
      emailEnabled: preference.emailEnabled,
      telegramEnabled: preference.telegramEnabled,
      bookingUpdatesEnabled: preference.bookingUpdatesEnabled,
      paymentUpdatesEnabled: preference.paymentUpdatesEnabled,
      sessionUpdatesEnabled: preference.sessionUpdatesEnabled,
      systemUpdatesEnabled: preference.systemUpdatesEnabled,
      telegramChatId: preference.telegramChatId ?? null,
      telegramLinkedAt: preference.telegramLinkedAt ?? null,
      createdAt: preference.createdAt,
      updatedAt: preference.updatedAt,
    };
  }

  private getTelegramBotUsername() {
    const value = this.configService.get<string>("TELEGRAM_BOT_USERNAME");
    return value?.trim() || null;
  }

  private getTelegramLinkTokenTtlMs() {
    const ttlMin = this.configService.get<number>("TELEGRAM_LINK_TOKEN_TTL_MIN", 15);
    return Math.max(1, ttlMin) * 60 * 1000;
  }

  private generateTelegramLinkToken() {
    return randomBytes(24).toString("base64url");
  }

  private hashTelegramLinkToken(value: string) {
    return createHash("sha256").update(value).digest("hex");
  }

  private serialize(notification: NotificationRecord) {
    return {
      id: notification.id,
      channel: notification.channel,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      payload: notification.payloadJson,
      status: notification.status,
      attempts: notification.attempts,
      queuedAt: notification.queuedAt.toISOString(),
      sentAt: notification.sentAt ? notification.sentAt.toISOString() : null,
      failedAt: notification.failedAt ? notification.failedAt.toISOString() : null,
      readAt: notification.readAt ? notification.readAt.toISOString() : null,
      lastErrorCode: notification.lastErrorCode,
      lastErrorMessage: notification.lastErrorMessage,
      createdAt: notification.createdAt.toISOString(),
      updatedAt: notification.updatedAt.toISOString(),
    };
  }

  private serializePreferences(preference: NotificationPreferenceRecord) {
    return {
      userId: preference.userId,
      inAppEnabled: preference.inAppEnabled,
      emailEnabled: preference.emailEnabled,
      telegramEnabled: preference.telegramEnabled,
      bookingUpdatesEnabled: preference.bookingUpdatesEnabled,
      paymentUpdatesEnabled: preference.paymentUpdatesEnabled,
      sessionUpdatesEnabled: preference.sessionUpdatesEnabled,
      systemUpdatesEnabled: preference.systemUpdatesEnabled,
      telegramLinked: Boolean(preference.telegramChatId),
      telegramChatIdMasked: this.maskTelegramChatId(preference.telegramChatId),
      telegramLinkedAt: preference.telegramLinkedAt ? preference.telegramLinkedAt.toISOString() : null,
      telegramBotUsername: this.getTelegramBotUsername(),
      telegramLinkingAvailable: Boolean(this.getTelegramBotUsername()),
      createdAt: preference.createdAt.toISOString(),
      updatedAt: preference.updatedAt.toISOString(),
    };
  }

  private maskTelegramChatId(value: string | null) {
    if (!value) {
      return null;
    }

    const normalized = value.trim();
    if (normalized.length <= 4) {
      return "*".repeat(normalized.length);
    }

    return `${"*".repeat(Math.max(4, normalized.length - 4))}${normalized.slice(-4)}`;
  }
}
