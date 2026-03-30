import { Test, TestingModule } from "@nestjs/testing";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { ClientSessionPackageStatus, NotificationChannel } from "prisma-client-generated";
import type { Request } from "express";
import { AuditService } from "../audit/audit.service";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { SessionPackagesService } from "./session-packages.service";

const makeRequest = (): Request =>
  ({
    ip: "127.0.0.1",
    headers: { "user-agent": "jest" },
    requestId: "req-1",
  }) as any;

const mockPrisma = {
  sessionPackageOffer: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
  },
  clientSessionPackage: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
  },
  clientProfile: {
    findUnique: jest.fn(),
  },
};

const mockAudit = {
  log: jest.fn().mockResolvedValue(undefined),
};

const mockNotifications = {
  createQueuedNotifications: jest.fn().mockResolvedValue(["notification-1"]),
};

describe("SessionPackagesService", () => {
  let service: SessionPackagesService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionPackagesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
        { provide: NotificationsService, useValue: mockNotifications },
      ],
    }).compile();

    service = module.get<SessionPackagesService>(SessionPackagesService);
  });

  it("lists public offers for psychologist slug", async () => {
    mockPrisma.sessionPackageOffer.findMany.mockResolvedValue([
      {
        id: "offer-1",
        title: "Пакет 4 сессии",
        description: "Подходит для регулярной краткосрочной работы.",
        sessionCount: 4,
        discountPercent: 10,
        totalPrice: 12600,
        currency: "RUB",
        isActive: true,
        psychologistUserId: "psychologist-1",
        psychologist: {
          id: "psychologist-1",
          psychologistProfile: {
            publicSlug: "anna-kovaleva",
            firstName: "Анна",
            lastName: "Ковалева",
            publicTitle: "Психолог, КПТ",
            approvalStatus: "approved",
          },
        },
      },
    ]);

    const result = await service.listPublicOffers("anna-kovaleva");

    expect(result).toEqual({
      psychologist: {
        id: "psychologist-1",
        slug: "anna-kovaleva",
        fullName: "Анна Ковалева",
        publicTitle: "Психолог, КПТ",
      },
      items: [
        expect.objectContaining({
          id: "offer-1",
          title: "Пакет 4 сессии",
          sessionCount: 4,
          discountPercent: 10,
          totalPrice: 12600,
        }),
      ],
    });
  });

  it("returns existing package for repeated idempotency key", async () => {
    mockPrisma.clientProfile.findUnique.mockResolvedValue({ userId: "client-1" });
    mockPrisma.clientSessionPackage.findFirst.mockResolvedValue({
      id: "package-1",
      title: "Пакет 4 сессии",
      totalSessions: 4,
      remainingSessions: 4,
      discountPercent: 10,
      priceAmount: 12600,
      currency: "RUB",
      status: ClientSessionPackageStatus.active,
      purchasedAt: new Date("2026-03-30T09:00:00.000Z"),
      expiresAt: null,
      cancelledAt: null,
      offer: {
        id: "offer-1",
        title: "Пакет 4 сессии",
        description: "Подходит для регулярной краткосрочной работы.",
        sessionCount: 4,
        discountPercent: 10,
        totalPrice: 12600,
        currency: "RUB",
      },
      psychologist: {
        id: "psychologist-1",
        psychologistProfile: {
          publicSlug: "anna-kovaleva",
          firstName: "Анна",
          lastName: "Ковалева",
          publicTitle: "Психолог, КПТ",
        },
      },
      usages: [],
    });

    const result = await service.purchasePackage(
      "client-1",
      { offerId: "offer-1" },
      "idem-package-1",
      makeRequest(),
    );

    expect(result).toEqual(
      expect.objectContaining({
        id: "package-1",
        title: "Пакет 4 сессии",
        remainingSessions: 4,
      }),
    );
    expect(mockPrisma.sessionPackageOffer.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.clientSessionPackage.create).not.toHaveBeenCalled();
  });

  it("creates a new package purchase and emits notifications", async () => {
    mockPrisma.clientProfile.findUnique.mockResolvedValue({ userId: "client-1" });
    mockPrisma.clientSessionPackage.findFirst.mockResolvedValue(null);
    mockPrisma.sessionPackageOffer.findFirst.mockResolvedValue({
      id: "offer-1",
      title: "Пакет 4 сессии",
      description: "Подходит для регулярной краткосрочной работы.",
      sessionCount: 4,
      discountPercent: 10,
      totalPrice: 12600,
      currency: "RUB",
      isActive: true,
      psychologistUserId: "psychologist-1",
      psychologist: {
        id: "psychologist-1",
        psychologistProfile: {
          publicSlug: "anna-kovaleva",
          firstName: "Анна",
          lastName: "Ковалева",
          publicTitle: "Психолог, КПТ",
          approvalStatus: "approved",
        },
      },
    });
    mockPrisma.clientSessionPackage.create.mockResolvedValue({
      id: "package-1",
      title: "Пакет 4 сессии",
      totalSessions: 4,
      remainingSessions: 4,
      discountPercent: 10,
      priceAmount: 12600,
      currency: "RUB",
      status: ClientSessionPackageStatus.active,
      purchasedAt: new Date("2026-03-30T09:00:00.000Z"),
      expiresAt: null,
      cancelledAt: null,
      offer: {
        id: "offer-1",
        title: "Пакет 4 сессии",
        description: "Подходит для регулярной краткосрочной работы.",
        sessionCount: 4,
        discountPercent: 10,
        totalPrice: 12600,
        currency: "RUB",
      },
      psychologist: {
        id: "psychologist-1",
        psychologistProfile: {
          publicSlug: "anna-kovaleva",
          firstName: "Анна",
          lastName: "Ковалева",
          publicTitle: "Психолог, КПТ",
        },
      },
      usages: [],
    });

    const result = await service.purchasePackage(
      "client-1",
      { offerId: "offer-1" },
      "idem-package-2",
      makeRequest(),
    );

    expect(result).toEqual(
      expect.objectContaining({
        id: "package-1",
        title: "Пакет 4 сессии",
        remainingSessions: 4,
      }),
    );
    expect(mockPrisma.clientSessionPackage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          offerId: "offer-1",
          clientUserId: "client-1",
          psychologistUserId: "psychologist-1",
          status: ClientSessionPackageStatus.active,
          idempotencyKey: "idem-package-2",
        }),
      }),
    );
    expect(mockNotifications.createQueuedNotifications).toHaveBeenCalledWith([
      expect.objectContaining({
        userId: "client-1",
        channel: NotificationChannel.in_app,
        type: "session_package.purchased",
      }),
      expect.objectContaining({
        userId: "client-1",
        channel: NotificationChannel.email,
        type: "session_package.purchased",
      }),
      expect.objectContaining({
        userId: "client-1",
        channel: NotificationChannel.telegram,
        type: "session_package.purchased",
      }),
      expect.objectContaining({
        userId: "psychologist-1",
        channel: NotificationChannel.in_app,
        type: "session_package.purchased",
      }),
      expect.objectContaining({
        userId: "psychologist-1",
        channel: NotificationChannel.email,
        type: "session_package.purchased",
      }),
      expect.objectContaining({
        userId: "psychologist-1",
        channel: NotificationChannel.telegram,
        type: "session_package.purchased",
      }),
    ]);
    expect(mockAudit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "session_packages.purchase",
        entityId: "package-1",
      }),
    );
  });

  it("rejects attempt to buy own package", async () => {
    mockPrisma.clientProfile.findUnique.mockResolvedValue({ userId: "psychologist-1" });
    mockPrisma.clientSessionPackage.findFirst.mockResolvedValue(null);
    mockPrisma.sessionPackageOffer.findFirst.mockResolvedValue({
      id: "offer-1",
      title: "Пакет 4 сессии",
      description: null,
      sessionCount: 4,
      discountPercent: 10,
      totalPrice: 12600,
      currency: "RUB",
      isActive: true,
      psychologistUserId: "psychologist-1",
      psychologist: {
        id: "psychologist-1",
        psychologistProfile: {
          publicSlug: "anna-kovaleva",
          firstName: "Анна",
          lastName: "Ковалева",
          publicTitle: "Психолог, КПТ",
          approvalStatus: "approved",
        },
      },
    });

    await expect(
      service.purchasePackage("psychologist-1", { offerId: "offer-1" }, "idem-own-package", makeRequest()),
    ).rejects.toThrow(ForbiddenException);
  });

  it("throws when offer is missing", async () => {
    mockPrisma.clientProfile.findUnique.mockResolvedValue({ userId: "client-1" });
    mockPrisma.clientSessionPackage.findFirst.mockResolvedValue(null);
    mockPrisma.sessionPackageOffer.findFirst.mockResolvedValue(null);

    await expect(
      service.purchasePackage("client-1", { offerId: "missing-offer" }, "idem-missing-offer", makeRequest()),
    ).rejects.toThrow(NotFoundException);
  });
});
