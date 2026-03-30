import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { NotificationChannel } from "prisma-client-generated";
import { AuditService } from "../audit/audit.service";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { RealtimeService } from "../realtime/realtime.service";
import { MessagesService } from "./messages.service";

const mockPrisma = {
  consultation: {
    findFirst: jest.fn(),
  },
  chatMessage: {
    create: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    updateMany: jest.fn(),
  },
  $transaction: jest.fn(),
};

const mockAudit = {
  log: jest.fn().mockResolvedValue(undefined),
};

const mockRealtime = {
  publishSafe: jest.fn().mockResolvedValue(true),
};

const mockNotifications = {
  createQueuedNotifications: jest.fn().mockResolvedValue(undefined),
};

const makeRequest = () =>
  ({
    ip: "127.0.0.1",
    headers: {
      "user-agent": "jest",
    },
    requestId: "req-1",
  }) as any;

const relationshipAsClient = {
  clientUserId: "client-1",
  psychologistUserId: "psychologist-1",
  client: {
    id: "client-1",
    clientProfile: {
      displayName: "Ирина",
      timezone: "Asia/Yekaterinburg",
    },
  },
  psychologist: {
    id: "psychologist-1",
    psychologistProfile: {
      firstName: "Anna",
      lastName: "Kovaleva",
      publicTitle: "Психолог, КПТ",
    },
  },
};

const makeMessage = (overrides: Partial<any> = {}) => ({
  id: "message-1",
  clientUserId: "client-1",
  psychologistUserId: "psychologist-1",
  senderUserId: "client-1",
  body: "Спасибо, я попробую выполнить упражнение до следующей встречи.",
  readAt: null,
  createdAt: new Date("2026-03-30T10:00:00.000Z"),
  updatedAt: new Date("2026-03-30T10:00:00.000Z"),
  sender: {
    id: "client-1",
    clientProfile: {
      displayName: "Ирина",
    },
    psychologistProfile: null,
  },
  ...overrides,
});

describe("MessagesService", () => {
  let service: MessagesService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessagesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
        { provide: RealtimeService, useValue: mockRealtime },
        { provide: NotificationsService, useValue: mockNotifications },
      ],
    }).compile();

    service = module.get<MessagesService>(MessagesService);
  });

  it("sends a message and publishes realtime event", async () => {
    mockPrisma.consultation.findFirst.mockResolvedValue(relationshipAsClient);
    mockPrisma.chatMessage.create.mockResolvedValue(makeMessage());

    const result = await service.sendMessage(
      "client-1",
      ["client"],
      {
        counterpartUserId: "psychologist-1",
        body: "  Спасибо, я попробую выполнить упражнение до следующей встречи.  ",
      },
      makeRequest(),
    );

    expect(result).toEqual(expect.objectContaining({ id: "message-1", isMine: true }));
    expect(mockRealtime.publishSafe).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "chat.message.created",
        entity: expect.objectContaining({
          type: "message",
        }),
      }),
    );
    expect(mockNotifications.createQueuedNotifications).toHaveBeenCalledWith([
      expect.objectContaining({
        channel: NotificationChannel.in_app,
        type: "chat.message.created",
      }),
      expect.objectContaining({ channel: NotificationChannel.email }),
      expect.objectContaining({ channel: NotificationChannel.telegram }),
    ]);
  });

  it("returns thread with unread count", async () => {
    mockPrisma.consultation.findFirst.mockResolvedValue(relationshipAsClient);
    mockPrisma.$transaction.mockResolvedValue([[makeMessage()], 1]);

    const result = await service.getThread("client-1", ["client"], "psychologist-1", {
      limit: 20,
    });

    expect(result.items).toHaveLength(1);
    expect(result.unreadCount).toBe(1);
    expect(result.conversation.counterpart.userId).toBe("psychologist-1");
  });

  it("marks incoming thread messages as read", async () => {
    mockPrisma.consultation.findFirst.mockResolvedValue(relationshipAsClient);
    mockPrisma.chatMessage.updateMany.mockResolvedValue({ count: 2 });

    const result = await service.markThreadRead(
      "client-1",
      ["client"],
      "psychologist-1",
      makeRequest(),
    );

    expect(result.updatedCount).toBe(2);
    expect(mockAudit.log).toHaveBeenCalledWith(expect.objectContaining({ action: "messages.read" }));
  });

  it("rejects sending empty message after normalization", async () => {
    mockPrisma.consultation.findFirst.mockResolvedValue(relationshipAsClient);

    await expect(
      service.sendMessage(
        "client-1",
        ["client"],
        {
          counterpartUserId: "psychologist-1",
          body: "    ",
        },
        makeRequest(),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it("hides thread from unrelated user", async () => {
    mockPrisma.consultation.findFirst.mockResolvedValue(null);

    await expect(
      service.getThread("client-1", ["client"], "psychologist-1", {}),
    ).rejects.toThrow(NotFoundException);
  });
});
