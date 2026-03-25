import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { ReviewsService } from "./reviews.service";

const makeRequest = () =>
  ({
    ip: "127.0.0.1",
    headers: {
      "user-agent": "jest",
    },
    requestId: "req-1",
  }) as any;

const makeCompletedConsultation = (overrides: Partial<any> = {}) => ({
  id: "consultation-1",
  clientUserId: "client-1",
  psychologistUserId: "psychologist-1",
  status: "completed",
  slot: {
    startsAt: new Date("2026-03-20T10:00:00.000Z"),
  },
  review: null,
  psychologist: {
    id: "psychologist-1",
    psychologistProfile: {
      firstName: "Anna",
      lastName: "Kovaleva",
    },
  },
  ...overrides,
});

const makeReview = (overrides: Partial<any> = {}) => ({
  id: "review-1",
  consultationId: "consultation-1",
  rating: 5,
  text: "Очень бережная и полезная консультация.",
  status: "published",
  createdAt: new Date("2026-03-21T08:00:00.000Z"),
  author: {
    id: "client-1",
    clientProfile: {
      displayName: "Irina Petrova",
    },
  },
  ...overrides,
});

const mockPrisma = {
  consultation: {
    findUnique: jest.fn(),
  },
  psychologistProfile: {
    findFirst: jest.fn(),
  },
  review: {
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

describe("ReviewsService", () => {
  let service: ReviewsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReviewsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
        { provide: NotificationsService, useValue: mockNotifications },
      ],
    }).compile();

    service = module.get<ReviewsService>(ReviewsService);
  });

  describe("createReview", () => {
    it("throws when consultation does not exist", async () => {
      mockPrisma.consultation.findUnique.mockResolvedValue(null);

      await expect(
        service.createReview(
          "client-1",
          {
            consultationId: "consultation-1",
            rating: 5,
          },
          makeRequest(),
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it("throws when consultation is not completed", async () => {
      mockPrisma.consultation.findUnique.mockResolvedValue(
        makeCompletedConsultation({
          status: "scheduled",
        }),
      );

      await expect(
        service.createReview(
          "client-1",
          {
            consultationId: "consultation-1",
            rating: 5,
          },
          makeRequest(),
        ),
      ).rejects.toThrow(ConflictException);
    });

    it("throws when normalized review text is too short", async () => {
      mockPrisma.consultation.findUnique.mockResolvedValue(makeCompletedConsultation());

      await expect(
        service.createReview(
          "client-1",
          {
            consultationId: "consultation-1",
            rating: 5,
            text: "коротко",
          },
          makeRequest(),
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it("creates a review, refreshes aggregates and emits notifications", async () => {
      const tx = {
        review: {
          create: jest.fn().mockResolvedValue(makeReview()),
          aggregate: jest.fn().mockResolvedValue({
            _avg: {
              rating: 5,
            },
            _count: {
              id: 1,
            },
          }),
        },
        psychologistProfile: {
          update: jest.fn().mockResolvedValue(undefined),
        },
      };

      mockPrisma.consultation.findUnique.mockResolvedValue(makeCompletedConsultation());
      mockPrisma.$transaction.mockImplementation(async (callback: (tx: any) => Promise<any>) => callback(tx));

      const result = await service.createReview(
        "client-1",
        {
          consultationId: "consultation-1",
          rating: 5,
          text: "Очень бережная и полезная консультация.",
        },
        makeRequest(),
      );

      expect(result).toEqual(
        expect.objectContaining({
          id: "review-1",
          rating: 5,
          status: "published",
          authorName: "Irina P.",
        }),
      );
      expect(tx.review.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            consultationId: "consultation-1",
            rating: 5,
          }),
        }),
      );
      expect(tx.psychologistProfile.update).toHaveBeenCalled();
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "reviews.create",
        }),
      );
      expect(mockNotifications.createQueuedNotifications).toHaveBeenCalled();
    });
  });

  describe("listPublicPsychologistReviews", () => {
    it("returns paginated public reviews with masked names", async () => {
      mockPrisma.psychologistProfile.findFirst.mockResolvedValue({
        userId: "psychologist-1",
        publicSlug: "anna-kovaleva",
        firstName: "Anna",
        lastName: "Kovaleva",
        ratingAvg: 4.75,
        reviewsCount: 12,
      });
      mockPrisma.$transaction.mockResolvedValue([[makeReview()], 1]);

      const result = await service.listPublicPsychologistReviews("anna-kovaleva", {
        page: 1,
        limit: 6,
      });

      expect(result.psychologist).toEqual(
        expect.objectContaining({
          slug: "anna-kovaleva",
          ratingAvg: 4.75,
          reviewsCount: 12,
        }),
      );
      expect(result.items[0]).toEqual(
        expect.objectContaining({
          authorName: "Irina P.",
        }),
      );
    });
  });
});
