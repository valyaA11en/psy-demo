import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import {
  ConsultationStatus,
  NotificationChannel,
  Prisma,
  PsychologistApprovalStatus,
} from "@prisma/client";
import type { Request } from "express";
import { AuditService } from "../audit/audit.service";
import type { CreateNotificationInput } from "../notifications/interfaces/create-notification-input.interface";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { CreateReviewDto } from "./dto/create-review.dto";
import { ListPublicReviewsQueryDto } from "./dto/list-public-reviews-query.dto";

const PUBLIC_REVIEW_STATUS = "published";

const publicReviewInclude = {
  author: {
    select: {
      id: true,
      clientProfile: {
        select: {
          displayName: true,
        },
      },
    },
  },
} satisfies Prisma.ReviewInclude;

type PublicReviewRecord = Prisma.ReviewGetPayload<{
  include: typeof publicReviewInclude;
}>;

@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async listPublicPsychologistReviews(slug: string, query: ListPublicReviewsQueryDto) {
    const profile = await this.prisma.psychologistProfile.findFirst({
      where: {
        publicSlug: slug,
        approvalStatus: PsychologistApprovalStatus.approved,
      },
      select: {
        userId: true,
        publicSlug: true,
        firstName: true,
        lastName: true,
        ratingAvg: true,
        reviewsCount: true,
      },
    });

    if (!profile) {
      throw new NotFoundException("Психолог не найден");
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 6;
    const skip = (page - 1) * limit;
    const where: Prisma.ReviewWhereInput = {
      psychologistUserId: profile.userId,
      status: PUBLIC_REVIEW_STATUS,
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.review.findMany({
        where,
        include: publicReviewInclude,
        orderBy: {
          createdAt: "desc",
        },
        skip,
        take: limit,
      }),
      this.prisma.review.count({ where }),
    ]);

    return {
      psychologist: {
        id: profile.userId,
        slug: profile.publicSlug,
        fullName: `${profile.firstName} ${profile.lastName}`.trim(),
        ratingAvg: profile.ratingAvg ? Number(profile.ratingAvg) : 0,
        reviewsCount: profile.reviewsCount,
      },
      items: items.map((item) => this.serializePublicReview(item)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async createReview(clientUserId: string, dto: CreateReviewDto, request: Request) {
    const consultation = await this.prisma.consultation.findUnique({
      where: {
        id: dto.consultationId,
      },
      include: {
        slot: {
          select: {
            startsAt: true,
          },
        },
        review: {
          select: {
            id: true,
          },
        },
        psychologist: {
          select: {
            id: true,
            psychologistProfile: {
              select: {
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
    });

    if (!consultation) {
      throw new NotFoundException("Консультация не найдена");
    }

    if (consultation.clientUserId !== clientUserId) {
      throw new NotFoundException("Консультация не найдена");
    }

    if (consultation.status !== ConsultationStatus.completed) {
      throw new ConflictException("Отзыв можно оставить только после завершённой консультации");
    }

    if (consultation.review) {
      throw new ConflictException("Отзыв по этой консультации уже опубликован");
    }

    const cleanText = this.normalizeReviewText(dto.text);

    const review = await this.prisma.$transaction(async (tx) => {
      const created = await tx.review.create({
        data: {
          consultationId: consultation.id,
          clientUserId,
          psychologistUserId: consultation.psychologistUserId,
          rating: dto.rating,
          text: cleanText,
          status: PUBLIC_REVIEW_STATUS,
        },
        include: publicReviewInclude,
      });

      await this.refreshPsychologistRating(tx, consultation.psychologistUserId);

      return created;
    });

    await this.auditService.log({
      actorUserId: clientUserId,
      actorRole: "client",
      action: "reviews.create",
      entityType: "review",
      entityId: review.id,
      requestId: (request as any).requestId ?? null,
      ip: request.ip,
      userAgent: request.headers["user-agent"] ?? null,
      metadataJson: {
        consultationId: consultation.id,
        psychologistUserId: consultation.psychologistUserId,
        rating: dto.rating,
      },
    });

    await this.notificationsService.createQueuedNotifications(
      this.notificationVariants({
        userId: consultation.psychologistUserId,
        type: "review.created",
        title: "Клиент оставил отзыв",
        body: `После консультации на ${this.formatReviewDate(consultation.slot.startsAt)} появился новый отзыв.`,
        dedupKey: `review.created:${review.id}`,
        payloadJson: {
          reviewId: review.id,
          consultationId: consultation.id,
          rating: dto.rating,
        },
      }),
    );

    return this.serializeReview(review);
  }

  private async refreshPsychologistRating(tx: Prisma.TransactionClient, psychologistUserId: string) {
    const aggregate = await tx.review.aggregate({
      where: {
        psychologistUserId,
        status: PUBLIC_REVIEW_STATUS,
      },
      _avg: {
        rating: true,
      },
      _count: {
        id: true,
      },
    });

    const average = Number(aggregate._avg.rating ?? 0);
    const ratingAvg = new Prisma.Decimal(average.toFixed(2));

    await tx.psychologistProfile.update({
      where: {
        userId: psychologistUserId,
      },
      data: {
        ratingAvg,
        reviewsCount: aggregate._count.id,
      },
    });
  }

  private normalizeReviewText(value: string | undefined) {
    if (typeof value === "undefined") {
      return null;
    }

    const normalized = value.replace(/\s+/g, " ").trim();

    if (normalized.length === 0) {
      return null;
    }

    if (normalized.length < 10) {
      throw new BadRequestException("Текст отзыва должен содержать минимум 10 символов или быть пустым");
    }

    return normalized;
  }

  private serializeReview(review: PublicReviewRecord) {
    return {
      id: review.id,
      consultationId: review.consultationId,
      rating: review.rating,
      text: review.text,
      status: review.status,
      createdAt: review.createdAt.toISOString(),
      authorName: this.maskAuthorName(review.author.clientProfile?.displayName, review.author.id),
    };
  }

  private serializePublicReview(review: PublicReviewRecord) {
    return this.serializeReview(review);
  }

  private maskAuthorName(displayName: string | null | undefined, authorId: string) {
    const normalized = displayName?.trim();

    if (!normalized) {
      return `Клиент ${authorId.slice(0, 6)}`;
    }

    const parts = normalized.split(/\s+/).filter(Boolean);

    if (parts.length === 1) {
      return parts[0];
    }

    return `${parts[0]} ${parts[1][0]}.`;
  }

  private formatReviewDate(date: Date) {
    return new Intl.DateTimeFormat("ru-RU", {
      day: "2-digit",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC",
    }).format(date);
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
