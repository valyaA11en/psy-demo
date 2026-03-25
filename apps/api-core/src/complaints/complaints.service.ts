import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { ConsultationStatus, NotificationChannel, Prisma } from "@prisma/client";
import type { Request } from "express";
import { AuditService } from "../audit/audit.service";
import type { CreateNotificationInput } from "../notifications/interfaces/create-notification-input.interface";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { CreateComplaintDto } from "./dto/create-complaint.dto";
import { ListMyComplaintsQueryDto } from "./dto/list-my-complaints-query.dto";

const complaintInclude = {
  target: {
    select: {
      id: true,
      clientProfile: {
        select: {
          displayName: true,
        },
      },
      psychologistProfile: {
        select: {
          firstName: true,
          lastName: true,
          publicTitle: true,
        },
      },
    },
  },
  consultation: {
    select: {
      id: true,
      scheduledAt: true,
      status: true,
      clientUserId: true,
      psychologistUserId: true,
    },
  },
} satisfies Prisma.ComplaintInclude;

type ComplaintRecord = Prisma.ComplaintGetPayload<{
  include: typeof complaintInclude;
}>;

@Injectable()
export class ComplaintsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async listMyComplaints(authorUserId: string, query: ListMyComplaintsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;
    const where: Prisma.ComplaintWhereInput = {
      authorUserId,
      ...(query.status ? { status: query.status } : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.complaint.findMany({
        where,
        include: complaintInclude,
        orderBy: {
          createdAt: "desc",
        },
        skip,
        take: limit,
      }),
      this.prisma.complaint.count({ where }),
    ]);

    return {
      items: items.map((item) => this.serializeComplaint(item, authorUserId)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
      filters: {
        status: query.status ?? null,
      },
    };
  }

  async createComplaint(
    authorUserId: string,
    roles: string[],
    dto: CreateComplaintDto,
    request: Request,
  ) {
    const consultation = await this.prisma.consultation.findUnique({
      where: {
        id: dto.consultationId,
      },
      select: {
        id: true,
        clientUserId: true,
        psychologistUserId: true,
        scheduledAt: true,
        status: true,
      },
    });

    if (!consultation) {
      throw new NotFoundException("Консультация не найдена");
    }

    const actorRole = this.resolveAuthorRole(consultation, authorUserId, roles);
    const now = new Date();
    if (consultation.status === ConsultationStatus.scheduled && consultation.scheduledAt > now) {
      throw new ConflictException("Жалобу можно подать после начала консультации или изменения её статуса");
    }

    const targetUserId =
      consultation.clientUserId === authorUserId ? consultation.psychologistUserId : consultation.clientUserId;

    if (targetUserId === authorUserId) {
      throw new BadRequestException("Нельзя создать жалобу на самого себя");
    }

    const normalizedText = this.normalizeComplaintText(dto.text);

    try {
      const complaint = await this.prisma.complaint.create({
        data: {
          consultationId: consultation.id,
          authorUserId,
          targetUserId,
          type: dto.type,
          text: normalizedText,
          status: "new",
        },
        include: complaintInclude,
      });

      await this.auditService.log({
        actorUserId: authorUserId,
        actorRole,
        action: "complaints.create",
        entityType: "complaint",
        entityId: complaint.id,
        requestId: (request as any).requestId ?? null,
        ip: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
        metadataJson: {
          consultationId: consultation.id,
          targetUserId,
          type: dto.type,
        },
      });

      await this.notificationsService.createQueuedNotifications([
        {
          userId: authorUserId,
          channel: NotificationChannel.in_app,
          type: "complaint.created",
          title: "Жалоба зарегистрирована",
          body: "Мы сохранили жалобу и передали её в административную очередь.",
          dedupKey: `complaint.created:${complaint.id}`,
          payloadJson: {
            complaintId: complaint.id,
            consultationId: consultation.id,
            status: complaint.status,
          },
        } satisfies CreateNotificationInput,
      ]);

      return this.serializeComplaint(complaint, authorUserId);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("Жалоба по этой консультации уже была отправлена");
      }

      throw error;
    }
  }

  private resolveAuthorRole(
    consultation: {
      clientUserId: string;
      psychologistUserId: string;
    },
    authorUserId: string,
    roles: string[],
  ) {
    if (consultation.clientUserId === authorUserId && roles.includes("client")) {
      return "client";
    }

    if (consultation.psychologistUserId === authorUserId && roles.includes("psychologist")) {
      return "psychologist";
    }

    throw new NotFoundException("Консультация не найдена");
  }

  private normalizeComplaintText(value: string) {
    const normalized = value.replace(/\s+/g, " ").trim();

    if (normalized.length < 20) {
      throw new BadRequestException("Текст жалобы должен содержать минимум 20 символов");
    }

    return normalized;
  }

  private serializeComplaint(complaint: ComplaintRecord, authorUserId: string) {
    const target = complaint.target;
    const targetDisplayName = target
      ? target.psychologistProfile
        ? `${target.psychologistProfile.firstName} ${target.psychologistProfile.lastName}`.trim()
        : target.clientProfile?.displayName ?? `Клиент ${target.id.slice(0, 6)}`
      : null;

    return {
      id: complaint.id,
      consultationId: complaint.consultationId,
      type: complaint.type,
      text: complaint.text,
      status: complaint.status,
      resolutionNote: complaint.resolutionNote,
      createdAt: complaint.createdAt.toISOString(),
      authorUserId,
      target: target
        ? {
            userId: target.id,
            displayName: targetDisplayName,
            publicTitle: target.psychologistProfile?.publicTitle ?? null,
          }
        : null,
      consultation: complaint.consultation
        ? {
            id: complaint.consultation.id,
            scheduledAt: complaint.consultation.scheduledAt.toISOString(),
            status: complaint.consultation.status,
          }
        : null,
    };
  }
}
