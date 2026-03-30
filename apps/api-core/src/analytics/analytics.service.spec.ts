import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { ConsultationStatus } from "prisma-client-generated";
import { PrismaService } from "../prisma/prisma.service";
import { AnalyticsService } from "./analytics.service";

const mockPrisma = {
  user: {
    findFirst: jest.fn(),
  },
  consultation: {
    findMany: jest.fn(),
  },
  payment: {
    findMany: jest.fn(),
  },
  homeworkTask: {
    findMany: jest.fn(),
  },
  chatMessage: {
    count: jest.fn(),
  },
  review: {
    findMany: jest.fn(),
  },
  moodEntry: {
    findMany: jest.fn(),
  },
};

describe("AnalyticsService", () => {
  let service: AnalyticsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
  });

  it("builds psychologist dashboard analytics", async () => {
    mockPrisma.user.findFirst.mockResolvedValue({
      id: "psychologist-1",
      psychologistProfile: {
        publicSlug: "anna-kovaleva",
        firstName: "Anna",
        lastName: "Kovaleva",
        publicTitle: "Психолог, КПТ",
        ratingAvg: { toString: () => "4.80", valueOf: () => 4.8 },
        reviewsCount: 12,
        specializations: [
          {
            specialization: {
              id: "spec-1",
              slug: "anxiety",
              name: "Тревожность",
            },
          },
        ],
      },
    });
    mockPrisma.consultation.findMany
      .mockResolvedValueOnce([
        {
          id: "consultation-1",
          clientUserId: "client-1",
          status: ConsultationStatus.completed,
          scheduledAt: new Date("2026-03-10T10:00:00.000Z"),
        },
        {
          id: "consultation-2",
          clientUserId: "client-2",
          status: ConsultationStatus.scheduled,
          scheduledAt: new Date("2026-03-15T10:00:00.000Z"),
        },
        {
          id: "consultation-3",
          clientUserId: "client-1",
          status: ConsultationStatus.cancelled_by_client,
          scheduledAt: new Date("2026-02-10T10:00:00.000Z"),
        },
      ])
      .mockResolvedValueOnce([{ clientUserId: "client-1" }, { clientUserId: "client-2" }]);
    mockPrisma.payment.findMany.mockResolvedValue([
      {
        amount: 4500,
        currency: "RUB",
        paidAt: new Date("2026-03-10T11:00:00.000Z"),
      },
    ]);
    mockPrisma.homeworkTask.findMany.mockResolvedValue([
      {
        status: "completed",
        dueAt: new Date("2026-03-20T10:00:00.000Z"),
      },
      {
        status: "assigned",
        dueAt: new Date("2026-03-01T10:00:00.000Z"),
      },
    ]);
    mockPrisma.chatMessage.count.mockResolvedValue(3);
    mockPrisma.review.findMany.mockResolvedValue([{ rating: 5 }, { rating: 4 }]);
    mockPrisma.moodEntry.findMany.mockResolvedValue([{ clientUserId: "client-1" }]);

    const result = await service.getPsychologistAnalytics("psychologist-1", { months: 3 });

    expect(result.summary).toEqual(
      expect.objectContaining({
        completedSessions: 1,
        scheduledSessions: 1,
        cancelledSessions: 1,
        uniqueClients: 2,
        grossRevenue: 4500,
        revenueCurrency: "RUB",
        homeworkAssigned: 2,
        homeworkCompleted: 1,
      }),
    );
    expect(result.engagement).toEqual(
      expect.objectContaining({
        activeClientsLast90Days: 2,
        clientsWithMoodEntriesLast30Days: 1,
        unreadMessagesCount: 3,
        overdueHomeworkTasks: 1,
      }),
    );
    expect(result.monthly).toHaveLength(3);
    expect(result.psychologist.fullName).toBe("Anna Kovaleva");
  });

  it("throws when psychologist profile is missing", async () => {
    mockPrisma.user.findFirst.mockResolvedValue(null);

    await expect(service.getPsychologistAnalytics("missing-user", {})).rejects.toThrow(NotFoundException);
  });
});
