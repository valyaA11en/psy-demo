import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { ConsultationStatus, NotificationChannel, Prisma } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { ComplaintsService } from "./complaints.service";

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
  scheduledAt: new Date(Date.now() - 60 * 60 * 1000),
  status: ConsultationStatus.completed,
  ...overrides,
});

const makeComplaint = (overrides: Partial<any> = {}) => ({
  id: "complaint-1",
  consultationId: "consultation-1",
  type: "service_quality",
  text: "Психолог опоздал и не предупредил, а качество консультации меня не устроило.",
  status: "new",
  resolutionNote: null,
  createdAt: new Date(),
  target: {
    id: "psychologist-1",
    clientProfile: null,
    psychologistProfile: {
      firstName: "Anna",
      lastName: "Kovaleva",
      publicTitle: "Психолог, КПТ",
    },
  },
  consultation: {
    id: "consultation-1",
    scheduledAt: new Date(),
    status: ConsultationStatus.completed,
    clientUserId: "client-1",
    psychologistUserId: "psychologist-1",
  },
  ...overrides,
});

const mockPrisma = {
  consultation: {
    findUnique: jest.fn(),
  },
  complaint: {
    create: jest.fn(),
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

describe("ComplaintsService", () => {
  let service: ComplaintsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ComplaintsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
        { provide: NotificationsService, useValue: mockNotifications },
      ],
    }).compile();

    service = module.get<ComplaintsService>(ComplaintsService);
  });

  describe("createComplaint", () => {
    it("throws when consultation is not found", async () => {
      mockPrisma.consultation.findUnique.mockResolvedValue(null);

      await expect(
        service.createComplaint(
          "client-1",
          ["client"],
          {
            consultationId: "consultation-1",
            type: "service_quality",
            text: "Очень подробное описание проблемы для проверки модерации.",
          },
          makeRequest(),
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it("throws when scheduled consultation is still in the future", async () => {
      mockPrisma.consultation.findUnique.mockResolvedValue(
        makeConsultation({
          status: ConsultationStatus.scheduled,
          scheduledAt: new Date(Date.now() + 60 * 60 * 1000),
        }),
      );

      await expect(
        service.createComplaint(
          "client-1",
          ["client"],
          {
            consultationId: "consultation-1",
            type: "service_quality",
            text: "Очень подробное описание проблемы для проверки модерации.",
          },
          makeRequest(),
        ),
      ).rejects.toThrow(ConflictException);
    });

    it("throws when text is too short after normalization", async () => {
      mockPrisma.consultation.findUnique.mockResolvedValue(makeConsultation());

      await expect(
        service.createComplaint(
          "client-1",
          ["client"],
          {
            consultationId: "consultation-1",
            type: "service_quality",
            text: "слишком коротко",
          },
          makeRequest(),
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it("creates complaint and sends author confirmation notification", async () => {
      mockPrisma.consultation.findUnique.mockResolvedValue(makeConsultation());
      mockPrisma.complaint.create.mockResolvedValue(makeComplaint());

      const result = await service.createComplaint(
        "client-1",
        ["client"],
        {
          consultationId: "consultation-1",
          type: "service_quality",
          text: "Психолог опоздал и не предупредил, а качество консультации меня не устроило.",
        },
        makeRequest(),
      );

      expect(result).toEqual(
        expect.objectContaining({
          id: "complaint-1",
          consultationId: "consultation-1",
          status: "new",
        }),
      );
      expect(mockPrisma.complaint.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            targetUserId: "psychologist-1",
            type: "service_quality",
          }),
        }),
      );
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "complaints.create",
        }),
      );
      expect(mockNotifications.createQueuedNotifications).toHaveBeenCalledWith([
        expect.objectContaining({
          channel: NotificationChannel.in_app,
          type: "complaint.created",
        }),
      ]);
    });

    it("translates duplicate complaint constraint to conflict", async () => {
      mockPrisma.consultation.findUnique.mockResolvedValue(makeConsultation());
      mockPrisma.complaint.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError("duplicate", {
          code: "P2002",
          clientVersion: "test",
        }),
      );

      await expect(
        service.createComplaint(
          "client-1",
          ["client"],
          {
            consultationId: "consultation-1",
            type: "service_quality",
            text: "Психолог опоздал и не предупредил, а качество консультации меня не устроило.",
          },
          makeRequest(),
        ),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe("listMyComplaints", () => {
    it("returns paginated complaint list", async () => {
      mockPrisma.$transaction.mockResolvedValue([[makeComplaint()], 1]);

      const result = await service.listMyComplaints("client-1", {
        page: 1,
        limit: 10,
      });

      expect(result.items).toHaveLength(1);
      expect(result.pagination.total).toBe(1);
      expect(result.items[0]).toEqual(
        expect.objectContaining({
          consultationId: "consultation-1",
          status: "new",
        }),
      );
    });
  });
});
