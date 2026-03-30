import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { ConsultationStatus, HomeworkTaskStatus, NotificationChannel } from "prisma-client-generated";
import { AuditService } from "../audit/audit.service";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { HomeworkTasksService } from "./homework-tasks.service";

const mockPrisma = {
  consultation: {
    findUnique: jest.fn(),
  },
  homeworkTask: {
    create: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
  $transaction: jest.fn(),
};

const mockAudit = {
  log: jest.fn().mockResolvedValue(undefined),
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

const makeConsultation = (overrides: Partial<any> = {}) => ({
  id: "consultation-1",
  clientUserId: "client-1",
  psychologistUserId: "psychologist-1",
  status: ConsultationStatus.completed,
  scheduledAt: new Date("2026-03-20T10:00:00.000Z"),
  ...overrides,
});

const makeTask = (overrides: Partial<any> = {}) => ({
  id: "task-1",
  consultationId: "consultation-1",
  clientUserId: "client-1",
  psychologistUserId: "psychologist-1",
  title: "Практика наблюдения за эмоциями",
  description: "Каждый вечер коротко записывать, что вы чувствовали и что помогло.",
  dueAt: new Date("2026-03-28T18:00:00.000Z"),
  status: HomeworkTaskStatus.assigned,
  clientNote: null,
  completedAt: null,
  createdAt: new Date("2026-03-21T09:00:00.000Z"),
  updatedAt: new Date("2026-03-21T09:00:00.000Z"),
  consultation: {
    id: "consultation-1",
    status: ConsultationStatus.completed,
    scheduledAt: new Date("2026-03-20T10:00:00.000Z"),
    slot: {
      startsAt: new Date("2026-03-20T10:00:00.000Z"),
      endsAt: new Date("2026-03-20T10:50:00.000Z"),
    },
  },
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
      publicSlug: "anna-kovaleva",
      firstName: "Anna",
      lastName: "Kovaleva",
      publicTitle: "Психолог, КПТ",
    },
  },
  ...overrides,
});

describe("HomeworkTasksService", () => {
  let service: HomeworkTasksService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HomeworkTasksService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
        { provide: NotificationsService, useValue: mockNotifications },
      ],
    }).compile();

    service = module.get<HomeworkTasksService>(HomeworkTasksService);
  });

  it("creates a homework task for completed psychologist consultation", async () => {
    mockPrisma.consultation.findUnique.mockResolvedValue(makeConsultation());
    mockPrisma.homeworkTask.create.mockResolvedValue(makeTask());

    const result = await service.createPsychologistTask(
      "psychologist-1",
      {
        consultationId: "consultation-1",
        title: "Практика наблюдения за эмоциями",
        description: "Каждый вечер коротко записывать, что вы чувствовали и что помогло.",
        dueAt: "2026-03-28T18:00:00.000Z",
      },
      makeRequest(),
    );

    expect(result).toEqual(expect.objectContaining({ id: "task-1", status: HomeworkTaskStatus.assigned }));
    expect(mockNotifications.createQueuedNotifications).toHaveBeenCalledWith([
      expect.objectContaining({
        channel: NotificationChannel.in_app,
        type: "homework.assigned",
      }),
      expect.objectContaining({ channel: NotificationChannel.email }),
      expect.objectContaining({ channel: NotificationChannel.telegram }),
    ]);
  });

  it("rejects task creation for non-completed consultation", async () => {
    mockPrisma.consultation.findUnique.mockResolvedValue(
      makeConsultation({
        status: ConsultationStatus.scheduled,
      }),
    );

    await expect(
      service.createPsychologistTask(
        "psychologist-1",
        {
          consultationId: "consultation-1",
          title: "Тест",
        },
        makeRequest(),
      ),
    ).rejects.toThrow(ConflictException);
  });

  it("marks task completed from client side and notifies psychologist", async () => {
    mockPrisma.homeworkTask.findFirst.mockResolvedValue(makeTask());
    mockPrisma.homeworkTask.update.mockResolvedValue(
      makeTask({
        status: HomeworkTaskStatus.completed,
        clientNote: "Получилось сделать это три раза за неделю.",
        completedAt: new Date("2026-03-25T12:00:00.000Z"),
        updatedAt: new Date("2026-03-25T12:00:00.000Z"),
      }),
    );

    const result = await service.updateClientTask(
      "client-1",
      "task-1",
      {
        status: HomeworkTaskStatus.completed,
        clientNote: "Получилось сделать это три раза за неделю.",
      },
      makeRequest(),
    );

    expect(result.status).toBe(HomeworkTaskStatus.completed);
    expect(mockNotifications.createQueuedNotifications).toHaveBeenCalledWith([
      expect.objectContaining({
        channel: NotificationChannel.in_app,
        type: "homework.completed",
      }),
      expect.objectContaining({ channel: NotificationChannel.email }),
      expect.objectContaining({ channel: NotificationChannel.telegram }),
    ]);
  });

  it("blocks client updates for cancelled task", async () => {
    mockPrisma.homeworkTask.findFirst.mockResolvedValue(
      makeTask({
        status: HomeworkTaskStatus.cancelled,
      }),
    );

    await expect(
      service.updateClientTask(
        "client-1",
        "task-1",
        {
          status: HomeworkTaskStatus.completed,
        },
        makeRequest(),
      ),
    ).rejects.toThrow(ConflictException);
  });

  it("rejects invalid due date before consultation date", async () => {
    mockPrisma.consultation.findUnique.mockResolvedValue(makeConsultation());

    await expect(
      service.createPsychologistTask(
        "psychologist-1",
        {
          consultationId: "consultation-1",
          title: "Тест",
          dueAt: "2026-03-18T18:00:00.000Z",
        },
        makeRequest(),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it("hides task from unrelated client", async () => {
    mockPrisma.homeworkTask.findFirst.mockResolvedValue(null);

    await expect(
      service.updateClientTask(
        "client-1",
        "task-1",
        {
          status: HomeworkTaskStatus.completed,
        },
        makeRequest(),
      ),
    ).rejects.toThrow(NotFoundException);
  });
});
