import { createHash } from "node:crypto";
import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NotificationChannel } from "prisma-client-generated";
import type { Request } from "express";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationsService } from "./notifications.service";
import { NotificationQueueService } from "./notification-queue.service";

const makePreference = (overrides: Partial<any> = {}) => ({
  userId: "user-1",
  inAppEnabled: true,
  emailEnabled: true,
  telegramEnabled: false,
  bookingUpdatesEnabled: true,
  paymentUpdatesEnabled: true,
  sessionUpdatesEnabled: true,
  systemUpdatesEnabled: true,
  telegramChatId: null,
  telegramLinkedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const makeTelegramLinkToken = (overrides: Partial<any> = {}) => ({
  id: "link-token-1",
  userId: "user-1",
  tokenHash: createHash("sha256").update("raw-token").digest("hex"),
  expiresAt: new Date(Date.now() + 10 * 60 * 1000),
  usedAt: null,
  revokedAt: null,
  telegramChatId: null,
  telegramUserId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const makeRequest = (): Request =>
  ({
    ip: "127.0.0.1",
    headers: { "user-agent": "jest" },
    requestId: "req-1",
  }) as any;

const mockPrisma = {
  notification: {
    findMany: jest.fn(),
    count: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  notificationPreference: {
    upsert: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn(),
  },
  telegramLinkToken: {
    updateMany: jest.fn(),
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  $transaction: jest.fn(),
};

const mockAudit = {
  log: jest.fn().mockResolvedValue(undefined),
};

const mockQueue = {
  enqueueMany: jest.fn().mockResolvedValue(true),
};

const mockConfig = {
  get: jest.fn((key: string, defaultValue?: unknown) => {
    if (key === "TELEGRAM_BOT_USERNAME") {
      return "psy_demo_bot";
    }

    if (key === "TELEGRAM_LINK_TOKEN_TTL_MIN") {
      return 15;
    }

    return defaultValue;
  }),
};

describe("NotificationsService", () => {
  let service: NotificationsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
        { provide: NotificationQueueService, useValue: mockQueue },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
  });

  describe("getMyPreferences", () => {
    it("returns serialized preferences with masked telegram id", async () => {
      mockPrisma.notificationPreference.upsert.mockResolvedValue(
        makePreference({
          telegramEnabled: true,
          telegramChatId: "123456789",
          telegramLinkedAt: new Date(),
        }),
      );

      const result = await service.getMyPreferences("user-1");

      expect(result).toEqual(
        expect.objectContaining({
          userId: "user-1",
          telegramEnabled: true,
          telegramLinked: true,
          telegramChatIdMasked: "*****6789",
          telegramBotUsername: "psy_demo_bot",
          telegramLinkingAvailable: true,
        }),
      );
    });
  });

  describe("updateMyPreferences", () => {
    it("throws when telegram is enabled without linked chat", async () => {
      mockPrisma.notificationPreference.upsert.mockResolvedValue(makePreference());

      await expect(
        service.updateMyPreferences(
          "user-1",
          {
            telegramEnabled: true,
          },
          makeRequest(),
        ),
      ).rejects.toThrow(BadRequestException);

      expect(mockPrisma.notificationPreference.update).not.toHaveBeenCalled();
    });

    it("updates preferences and writes audit log", async () => {
      mockPrisma.notificationPreference.upsert.mockResolvedValue(
        makePreference({
          telegramEnabled: true,
          telegramChatId: "123456789",
          telegramLinkedAt: new Date(),
        }),
      );
      mockPrisma.notificationPreference.update.mockResolvedValue(
        makePreference({
          emailEnabled: false,
          telegramEnabled: true,
          telegramChatId: "123456789",
          telegramLinkedAt: new Date(),
        }),
      );

      const result = await service.updateMyPreferences(
        "user-1",
        {
          emailEnabled: false,
          telegramEnabled: true,
        },
        makeRequest(),
      );

      expect(result).toEqual(
        expect.objectContaining({
          emailEnabled: false,
          telegramEnabled: true,
          telegramLinked: true,
        }),
      );
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "notifications.update_preferences",
          entityId: "user-1",
        }),
      );
    });
  });

  describe("createQueuedNotifications", () => {
    it("filters notifications by channel and category preferences", async () => {
      mockPrisma.notificationPreference.findMany.mockResolvedValue([
        makePreference({
          userId: "user-1",
          emailEnabled: false,
          paymentUpdatesEnabled: false,
          telegramEnabled: true,
          telegramChatId: null,
        }),
      ]);
      mockPrisma.notification.findMany.mockResolvedValue([]);
      mockPrisma.notification.create.mockResolvedValue({ id: "notif-1" });

      const result = await service.createQueuedNotifications([
        {
          userId: "user-1",
          channel: NotificationChannel.email,
          type: "booking.created",
          title: "email",
          body: "email",
          dedupKey: "email-1",
        },
        {
          userId: "user-1",
          channel: NotificationChannel.in_app,
          type: "payment.pending",
          title: "payment",
          body: "payment",
          dedupKey: "payment-1",
        },
        {
          userId: "user-1",
          channel: NotificationChannel.telegram,
          type: "system.telegram_linked",
          title: "telegram",
          body: "telegram",
          dedupKey: "telegram-1",
        },
        {
          userId: "user-2",
          channel: NotificationChannel.in_app,
          type: "booking.created",
          title: "in app",
          body: "in app",
          dedupKey: "in-app-1",
        },
      ]);

      expect(result).toEqual(["notif-1"]);
      expect(mockPrisma.notification.findMany).toHaveBeenCalledTimes(1);
      expect(mockPrisma.notification.create).toHaveBeenCalledTimes(1);
      expect(mockQueue.enqueueMany).toHaveBeenCalledWith(["notif-1"]);
    });

    it("skips duplicate notifications by dedup key", async () => {
      mockPrisma.notificationPreference.findMany.mockResolvedValue([]);
      mockPrisma.notification.findMany.mockResolvedValue([
        {
          id: "existing-1",
          userId: "user-1",
          channel: NotificationChannel.in_app,
          dedupKey: "dup-1",
        },
      ]);

      const result = await service.createQueuedNotifications([
        {
          userId: "user-1",
          channel: NotificationChannel.in_app,
          type: "booking.created",
          title: "in app",
          body: "in app",
          dedupKey: "dup-1",
        },
      ]);

      expect(result).toEqual([]);
      expect(mockPrisma.notification.create).not.toHaveBeenCalled();
      expect(mockQueue.enqueueMany).toHaveBeenCalledWith([]);
    });
  });

  describe("createTelegramLink", () => {
    it("creates a new deep link and revokes previous tokens", async () => {
      mockPrisma.notificationPreference.upsert.mockResolvedValue(makePreference());
      mockPrisma.telegramLinkToken.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.telegramLinkToken.create.mockResolvedValue({ id: "token-1" });

      const result = await service.createTelegramLink("user-1", makeRequest());

      const rawToken = result.deepLink.split("?start=")[1];
      const createCall = mockPrisma.telegramLinkToken.create.mock.calls[0][0];

      expect(result.botUsername).toBe("psy_demo_bot");
      expect(result.deepLink).toMatch(/^https:\/\/t\.me\/psy_demo_bot\?start=/);
      expect(rawToken).toBeTruthy();
      expect(createCall.data.tokenHash).toHaveLength(64);
      expect(createCall.data.tokenHash).not.toBe(rawToken);
      expect(mockPrisma.telegramLinkToken.updateMany).toHaveBeenCalled();
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "notifications.telegram_link.create",
        }),
      );
    });
  });

  describe("consumeTelegramLink", () => {
    it("throws when token is missing", async () => {
      mockPrisma.telegramLinkToken.findUnique.mockResolvedValue(null);

      await expect(
        service.consumeTelegramLink(
          {
            token: "missing-token",
            chatId: "123456789",
          },
          makeRequest(),
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it("returns already linked when token was used by same chat", async () => {
      mockPrisma.telegramLinkToken.findUnique.mockResolvedValue(
        makeTelegramLinkToken({
          usedAt: new Date(),
          telegramChatId: "123456789",
        }),
      );

      const result = await service.consumeTelegramLink(
        {
          token: "raw-token",
          chatId: "123456789",
        },
        makeRequest(),
      );

      expect(result).toEqual({
        linked: true,
        alreadyLinked: true,
      });
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it("links telegram chat, revokes other tokens and emits notification", async () => {
      const tx = {
        notificationPreference: {
          upsert: jest.fn().mockResolvedValue(undefined),
        },
        telegramLinkToken: {
          update: jest.fn().mockResolvedValue(undefined),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      };

      mockPrisma.telegramLinkToken.findUnique.mockResolvedValue(makeTelegramLinkToken());
      mockPrisma.$transaction.mockImplementation(async (callback: (tx: any) => Promise<void>) => callback(tx));
      jest.spyOn(service, "createQueuedNotifications").mockResolvedValue(["notif-1"]);

      const result = await service.consumeTelegramLink(
        {
          token: "raw-token",
          chatId: "123456789",
          telegramUserId: "777",
          username: "psy_user",
        },
        makeRequest(),
      );

      expect(result).toEqual({
        linked: true,
        alreadyLinked: false,
      });
      expect(tx.notificationPreference.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: "user-1" },
          update: expect.objectContaining({
            telegramChatId: "123456789",
            telegramEnabled: true,
          }),
        }),
      );
      expect(tx.telegramLinkToken.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "link-token-1" },
        }),
      );
      expect(service.createQueuedNotifications).toHaveBeenCalledWith([
        expect.objectContaining({
          userId: "user-1",
          channel: NotificationChannel.in_app,
          type: "system.telegram_linked",
        }),
      ]);
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "notifications.telegram_link.consume",
          entityId: "link-token-1",
        }),
      );
    });
  });
});
