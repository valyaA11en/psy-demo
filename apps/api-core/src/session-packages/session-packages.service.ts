import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import {
  ClientSessionPackageStatus,
  NotificationChannel,
  Prisma,
  PsychologistApprovalStatus,
} from "prisma-client-generated";
import type { Request } from "express";
import { AuditService } from "../audit/audit.service";
import type { CreateNotificationInput } from "../notifications/interfaces/create-notification-input.interface";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { ListMySessionPackagesQueryDto } from "./dto/list-my-session-packages-query.dto";
import { PurchaseSessionPackageDto } from "./dto/purchase-session-package.dto";

const publicOfferInclude = {
  psychologist: {
    select: {
      id: true,
      psychologistProfile: {
        select: {
          publicSlug: true,
          firstName: true,
          lastName: true,
          publicTitle: true,
          approvalStatus: true,
        },
      },
    },
  },
} satisfies Prisma.SessionPackageOfferInclude;

const clientPackageInclude = {
  offer: {
    select: {
      id: true,
      title: true,
      description: true,
      sessionCount: true,
      discountPercent: true,
      totalPrice: true,
      currency: true,
    },
  },
  psychologist: {
    select: {
      id: true,
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
  usages: {
    select: {
      id: true,
      consultationId: true,
      usedAt: true,
      releasedAt: true,
    },
    orderBy: {
      usedAt: "desc",
    },
  },
} satisfies Prisma.ClientSessionPackageInclude;

type PublicOfferRecord = Prisma.SessionPackageOfferGetPayload<{
  include: typeof publicOfferInclude;
}>;

type ClientPackageRecord = Prisma.ClientSessionPackageGetPayload<{
  include: typeof clientPackageInclude;
}>;

@Injectable()
export class SessionPackagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async listPublicOffers(slug: string) {
    const offers = await this.prisma.sessionPackageOffer.findMany({
      where: {
        isActive: true,
        psychologist: {
          psychologistProfile: {
            publicSlug: slug,
            approvalStatus: PsychologistApprovalStatus.approved,
          },
        },
      },
      include: publicOfferInclude,
      orderBy: [
        {
          sessionCount: "asc",
        },
        {
          createdAt: "asc",
        },
      ],
    });

    if (offers.length === 0) {
      const psychologist = await this.prisma.psychologistProfile.findFirst({
        where: {
          publicSlug: slug,
          approvalStatus: PsychologistApprovalStatus.approved,
        },
        select: {
          userId: true,
          publicSlug: true,
          firstName: true,
          lastName: true,
          publicTitle: true,
        },
      });

      if (!psychologist) {
        throw new NotFoundException("Психолог не найден");
      }

      return {
        psychologist: {
          id: psychologist.userId,
          slug: psychologist.publicSlug,
          fullName: `${psychologist.firstName} ${psychologist.lastName}`.trim(),
          publicTitle: psychologist.publicTitle,
        },
        items: [],
      };
    }

    const first = offers[0];

    return {
      psychologist: {
        id: first.psychologist.id,
        slug: first.psychologist.psychologistProfile?.publicSlug ?? slug,
        fullName: first.psychologist.psychologistProfile
          ? `${first.psychologist.psychologistProfile.firstName} ${first.psychologist.psychologistProfile.lastName}`.trim()
          : slug,
        publicTitle: first.psychologist.psychologistProfile?.publicTitle ?? null,
      },
      items: offers.map((offer) => this.serializePublicOffer(offer)),
    };
  }

  async listMyPackages(clientUserId: string, query: ListMySessionPackagesQueryDto) {
    const where: Prisma.ClientSessionPackageWhereInput = {
      clientUserId,
      ...(query.status ? { status: query.status as ClientSessionPackageStatus } : {}),
      ...(query.psychologistSlug
        ? {
            psychologist: {
              psychologistProfile: {
                publicSlug: query.psychologistSlug,
              },
            },
          }
        : {}),
    };

    const items = await this.prisma.clientSessionPackage.findMany({
      where,
      include: clientPackageInclude,
      orderBy: [
        {
          status: "asc",
        },
        {
          purchasedAt: "desc",
        },
      ],
    });

    return {
      items: items.map((item) => this.serializeClientPackage(item)),
      filters: {
        psychologistSlug: query.psychologistSlug ?? null,
        status: query.status ?? null,
      },
    };
  }

  async purchasePackage(
    clientUserId: string,
    dto: PurchaseSessionPackageDto,
    rawIdempotencyKey: string | undefined,
    request: Request,
  ) {
    await this.ensureClientProfile(clientUserId);
    const idempotencyKey = this.normalizeIdempotencyKey(rawIdempotencyKey);

    const existing = await this.prisma.clientSessionPackage.findFirst({
      where: {
        clientUserId,
        idempotencyKey,
      },
      include: clientPackageInclude,
    });

    if (existing) {
      return this.serializeClientPackage(existing);
    }

    const offer = await this.prisma.sessionPackageOffer.findFirst({
      where: {
        id: dto.offerId,
        isActive: true,
        psychologist: {
          psychologistProfile: {
            approvalStatus: PsychologistApprovalStatus.approved,
          },
        },
      },
      include: publicOfferInclude,
    });

    if (!offer || !offer.psychologist.psychologistProfile) {
      throw new NotFoundException("Пакет сессий не найден");
    }

    if (offer.psychologistUserId === clientUserId) {
      throw new ForbiddenException("Нельзя купить собственный пакет психолога");
    }

    const purchased = await this.prisma.clientSessionPackage.create({
      data: {
        offerId: offer.id,
        clientUserId,
        psychologistUserId: offer.psychologistUserId,
        title: offer.title,
        totalSessions: offer.sessionCount,
        remainingSessions: offer.sessionCount,
        discountPercent: offer.discountPercent,
        priceAmount: offer.totalPrice,
        currency: offer.currency,
        status: ClientSessionPackageStatus.active,
        idempotencyKey,
      },
      include: clientPackageInclude,
    });

    await this.auditService.log({
      actorUserId: clientUserId,
      actorRole: "client",
      action: "session_packages.purchase",
      entityType: "client_session_package",
      entityId: purchased.id,
      requestId: (request as any).requestId ?? null,
      ip: request.ip,
      userAgent: request.headers["user-agent"] ?? null,
      metadataJson: {
        offerId: offer.id,
        psychologistUserId: offer.psychologistUserId,
        sessionCount: offer.sessionCount,
        amount: offer.totalPrice,
        currency: offer.currency,
      },
    });

    await this.notificationsService.createQueuedNotifications([
      ...this.notificationVariants({
        userId: clientUserId,
        type: "session_package.purchased",
        title: "Пакет сессий активирован",
        body: `Пакет «${offer.title}» активирован. Доступно сессий: ${offer.sessionCount}.`,
        dedupKey: `session_package.purchased:${purchased.id}:client`,
        payloadJson: {
          sessionPackageId: purchased.id,
          offerId: offer.id,
          audience: "client",
        },
      }),
      ...this.notificationVariants({
        userId: offer.psychologistUserId,
        type: "session_package.purchased",
        title: "Клиент приобрёл пакет сессий",
        body: `Клиент активировал пакет «${offer.title}» на ${offer.sessionCount} сессий.`,
        dedupKey: `session_package.purchased:${purchased.id}:psychologist`,
        payloadJson: {
          sessionPackageId: purchased.id,
          offerId: offer.id,
          audience: "psychologist",
        },
      }),
    ]);

    return this.serializeClientPackage(purchased);
  }

  private async ensureClientProfile(userId: string) {
    const profile = await this.prisma.clientProfile.findUnique({
      where: {
        userId,
      },
      select: {
        userId: true,
      },
    });

    if (!profile) {
      throw new ForbiddenException("Профиль клиента не найден");
    }

    return profile;
  }

  private normalizeIdempotencyKey(value: string | undefined) {
    const normalized = value?.trim();

    if (!normalized) {
      throw new BadRequestException("Заголовок Idempotency-Key обязателен");
    }

    if (!/^[A-Za-z0-9._:-]{8,128}$/.test(normalized)) {
      throw new BadRequestException("Некорректный формат Idempotency-Key");
    }

    return normalized;
  }

  private serializePublicOffer(offer: PublicOfferRecord) {
    return {
      id: offer.id,
      title: offer.title,
      description: offer.description,
      sessionCount: offer.sessionCount,
      discountPercent: offer.discountPercent,
      totalPrice: offer.totalPrice,
      currency: offer.currency,
      isActive: offer.isActive,
      psychologistUserId: offer.psychologistUserId,
    };
  }

  private serializeClientPackage(item: ClientPackageRecord) {
    const usedSessions = item.usages.filter((usage) => !usage.releasedAt).length;
    const releasedSessions = item.usages.filter((usage) => Boolean(usage.releasedAt)).length;

    return {
      id: item.id,
      title: item.title,
      totalSessions: item.totalSessions,
      remainingSessions: item.remainingSessions,
      discountPercent: item.discountPercent,
      priceAmount: item.priceAmount,
      currency: item.currency,
      status: item.status,
      purchasedAt: item.purchasedAt.toISOString(),
      expiresAt: item.expiresAt ? item.expiresAt.toISOString() : null,
      cancelledAt: item.cancelledAt ? item.cancelledAt.toISOString() : null,
      offer: {
        id: item.offer.id,
        title: item.offer.title,
        description: item.offer.description,
        sessionCount: item.offer.sessionCount,
        discountPercent: item.offer.discountPercent,
        totalPrice: item.offer.totalPrice,
        currency: item.offer.currency,
      },
      psychologist: {
        userId: item.psychologist.id,
        slug: item.psychologist.psychologistProfile?.publicSlug ?? null,
        fullName: item.psychologist.psychologistProfile
          ? `${item.psychologist.psychologistProfile.firstName} ${item.psychologist.psychologistProfile.lastName}`.trim()
          : null,
        publicTitle: item.psychologist.psychologistProfile?.publicTitle ?? null,
      },
      usageSummary: {
        usedSessions,
        releasedSessions,
      },
      usages: item.usages.map((usage) => ({
        id: usage.id,
        consultationId: usage.consultationId,
        usedAt: usage.usedAt.toISOString(),
        releasedAt: usage.releasedAt ? usage.releasedAt.toISOString() : null,
      })),
    };
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
