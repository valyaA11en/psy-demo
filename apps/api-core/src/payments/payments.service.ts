import { randomUUID } from "node:crypto";
import {
  ConsultationStatus,
  NotificationChannel,
  PaymentEventType,
  PaymentStatus,
  Prisma,
} from "prisma-client-generated";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Request } from "express";
import { AuditService } from "../audit/audit.service";
import type { CreateNotificationInput } from "../notifications/interfaces/create-notification-input.interface";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { RealtimeService } from "../realtime/realtime.service";
import { CreatePaymentDto } from "./dto/create-payment.dto";
import { ListPaymentsQueryDto } from "./dto/list-payments-query.dto";
import { MockFailPaymentDto } from "./dto/mock-fail-payment.dto";

const ADMIN_ROLES = new Set(["admin", "superadmin"]);

const paymentListInclude = {
  consultation: {
    select: {
      id: true,
      clientUserId: true,
      psychologistUserId: true,
      scheduledAt: true,
      status: true,
      psychologist: {
        select: {
          id: true,
          psychologistProfile: {
            select: {
              publicSlug: true,
              firstName: true,
              lastName: true,
              publicTitle: true,
              priceFrom: true,
              priceTo: true,
            },
          },
        },
      },
      client: {
        select: {
          id: true,
          clientProfile: {
            select: {
              displayName: true,
              timezone: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.PaymentInclude;

const paymentDetailInclude = {
  ...paymentListInclude,
  events: {
    orderBy: {
      createdAt: "asc",
    },
    select: {
      id: true,
      eventType: true,
      createdAt: true,
    },
  },
} satisfies Prisma.PaymentInclude;

type PaymentListRecord = Prisma.PaymentGetPayload<{
  include: typeof paymentListInclude;
}>;

type PaymentDetailRecord = Prisma.PaymentGetPayload<{
  include: typeof paymentDetailInclude;
}>;

type PaymentView = "client" | "psychologist" | "admin";

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly realtimeService: RealtimeService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async createPayment(
    clientUserId: string,
    dto: CreatePaymentDto,
    rawIdempotencyKey: string | undefined,
    request: Request,
  ) {
    const idempotencyKey = this.normalizeIdempotencyKey(rawIdempotencyKey);
    const existingByKey = await this.findByIdempotencyKey(dto.consultationId, idempotencyKey);

    if (existingByKey) {
      this.assertClientOwnership(existingByKey, clientUserId);
      return this.serializePayment(existingByKey, "client", true);
    }

    const consultation = await this.prisma.consultation.findFirst({
      where: {
        id: dto.consultationId,
        clientUserId,
      },
      include: {
        sessionPackageUsage: {
          select: {
            id: true,
            releasedAt: true,
            sessionPackage: {
              select: {
                id: true,
                title: true,
              },
            },
          },
        },
        psychologist: {
          select: {
            psychologistProfile: {
              select: {
                priceFrom: true,
                publicSlug: true,
                firstName: true,
                lastName: true,
                publicTitle: true,
              },
            },
          },
        },
        client: {
          select: {
            clientProfile: {
              select: {
                displayName: true,
                timezone: true,
              },
            },
          },
        },
      },
    });

    if (!consultation) {
      throw new NotFoundException("Консультация не найдена");
    }

    if (consultation.status !== ConsultationStatus.scheduled) {
      throw new ConflictException("Оплачивать можно только запланированные консультации");
    }

    if (consultation.sessionPackageUsage && !consultation.sessionPackageUsage.releasedAt) {
      throw new ConflictException("Эта консультация уже покрыта активным пакетом сессий");
    }

    const amount = consultation.psychologist.psychologistProfile?.priceFrom;
    if (!amount || amount <= 0) {
      throw new BadRequestException("Для консультации не настроена стоимость");
    }

    const existingSucceeded = await this.prisma.payment.findFirst({
      where: {
        consultationId: dto.consultationId,
        status: PaymentStatus.succeeded,
      },
      include: paymentDetailInclude,
      orderBy: {
        createdAt: "desc",
      },
    });

    if (existingSucceeded) {
      return this.serializePayment(existingSucceeded, "client", true);
    }

    const existingPending = await this.prisma.payment.findFirst({
      where: {
        consultationId: dto.consultationId,
        status: PaymentStatus.pending,
      },
      include: paymentDetailInclude,
      orderBy: {
        createdAt: "desc",
      },
    });

    if (existingPending) {
      return this.serializePayment(existingPending, "client", true);
    }

    const paymentId = await this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          consultationId: consultation.id,
          provider: "mock",
          providerPaymentId: `mock_${randomUUID()}`,
          amount,
          currency: "RUB",
          status: PaymentStatus.pending,
          idempotencyKey,
          metadataJson: {
            mode: "mock",
          },
        },
        select: {
          id: true,
        },
      });

      await tx.paymentEvent.create({
        data: {
          paymentId: payment.id,
          eventType: PaymentEventType.created,
          payloadJson: {
            idempotencyKey,
            provider: "mock",
          },
        },
      });

      return payment.id;
    });

    await this.auditService.log({
      actorUserId: clientUserId,
      actorRole: "client",
      action: "payments.create",
      entityType: "payment",
      entityId: paymentId,
      requestId: (request as any).requestId ?? null,
      ip: request.ip,
      userAgent: request.headers["user-agent"] ?? null,
      metadataJson: {
        consultationId: consultation.id,
        amount,
        currency: "RUB",
      },
    });

    const payment = await this.getPaymentRecord(paymentId, true);
    await this.realtimeService.publishSafe({
      name: "payment.created",
      entity: {
        type: "payment",
        id: paymentId,
      },
      audience: {
        userIds: [payment.consultation.clientUserId, payment.consultation.psychologistUserId],
      },
      payload: {
        consultationId: payment.consultationId,
        paymentId,
        status: payment.status,
      },
    });
    await this.notificationsService.createQueuedNotifications([
      ...this.notificationVariants({
        userId: payment.consultation.clientUserId,
        type: "payment.created",
        title: "Платёж создан",
        body: `Создан тестовый платёж на ${payment.amount} ${payment.currency} для консультации ${this.formatScheduleLabel(payment.consultation.scheduledAt)}.`,
        dedupKey: `payment.created:${paymentId}`,
        payloadJson: {
          consultationId: payment.consultationId,
          paymentId,
          status: payment.status,
        },
      }),
    ]);

    return this.serializePayment(payment, "client", true);
  }

  async listClientPayments(clientUserId: string, query: ListPaymentsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;
    const where: Prisma.PaymentWhereInput = {
      consultation: {
        clientUserId,
      },
      ...(query.status ? { status: query.status } : {}),
      ...(query.consultationId ? { consultationId: query.consultationId } : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.payment.findMany({
        where,
        include: paymentListInclude,
        orderBy: {
          createdAt: "desc",
        },
        skip,
        take: limit,
      }),
      this.prisma.payment.count({ where }),
    ]);

    return {
      items: items.map((item) => this.serializePayment(item, "client")),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
      filters: {
        status: query.status ?? null,
        consultationId: query.consultationId ?? null,
      },
    };
  }

  async getPaymentById(paymentId: string, viewerUserId: string, roles: string[]) {
    const payment = await this.getPaymentRecord(paymentId, true);
    const view = this.resolveView(payment, viewerUserId, roles);
    return this.serializePayment(payment, view, true);
  }

  async confirmMockPayment(
    paymentId: string,
    actorUserId: string,
    roles: string[],
    request: Request,
  ) {
    const payment = await this.getPaymentRecord(paymentId, true);
    const actorRole = this.resolveClientOrAdminRole(payment, actorUserId, roles);

    if (payment.status === PaymentStatus.succeeded) {
      return this.serializePayment(payment, this.resolveView(payment, actorUserId, roles), true);
    }

    if (payment.consultation.status !== ConsultationStatus.scheduled) {
      throw new ConflictException("Оплачивать можно только запланированные консультации");
    }

    if (payment.status !== PaymentStatus.pending) {
      throw new ConflictException("Подтвердить можно только платёж в статусе pending");
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: {
          id: paymentId,
        },
        data: {
          status: PaymentStatus.succeeded,
          paidAt: new Date(),
          failureCode: null,
          failureMessage: null,
        },
      });

      await tx.paymentEvent.create({
        data: {
          paymentId,
          eventType: PaymentEventType.succeeded,
          payloadJson: {
            provider: "mock",
          },
        },
      });
    });

    await this.auditService.log({
      actorUserId,
      actorRole,
      action: "payments.mock_confirm",
      entityType: "payment",
      entityId: paymentId,
      requestId: (request as any).requestId ?? null,
      ip: request.ip,
      userAgent: request.headers["user-agent"] ?? null,
      metadataJson: {
        consultationId: payment.consultationId,
      },
    });

    const updated = await this.getPaymentRecord(paymentId, true);
    await this.realtimeService.publishSafe({
      name: "payment.updated",
      entity: {
        type: "payment",
        id: paymentId,
      },
      audience: {
        userIds: [updated.consultation.clientUserId, updated.consultation.psychologistUserId],
      },
      payload: {
        consultationId: updated.consultationId,
        paymentId,
        status: updated.status,
      },
    });
    await this.realtimeService.publishSafe({
      name: "video.session_ready",
      entity: {
        type: "video_session",
        id: updated.consultationId,
      },
      audience: {
        userIds: [updated.consultation.clientUserId, updated.consultation.psychologistUserId],
      },
      payload: {
        consultationId: updated.consultationId,
        status: "payment_succeeded",
      },
    });
    await this.notificationsService.createQueuedNotifications([
      ...this.notificationVariants({
        userId: updated.consultation.clientUserId,
        type: "payment.succeeded",
        title: "Платёж подтверждён",
        body: `Платёж для консультации ${this.formatScheduleLabel(updated.consultation.scheduledAt)} успешно подтверждён.`,
        dedupKey: `payment.succeeded:${paymentId}`,
        payloadJson: {
          consultationId: updated.consultationId,
          paymentId,
          status: updated.status,
          audience: "client",
        },
      }),
      ...this.notificationVariants({
        userId: updated.consultation.psychologistUserId,
        type: "payment.succeeded",
        title: "Консультация оплачена",
        body: `Клиент оплатил консультацию ${this.formatScheduleLabel(updated.consultation.scheduledAt)}.`,
        dedupKey: `payment.succeeded:${paymentId}`,
        payloadJson: {
          consultationId: updated.consultationId,
          paymentId,
          status: updated.status,
          audience: "psychologist",
        },
      }),
      ...this.notificationVariants({
        userId: updated.consultation.clientUserId,
        type: "video.session_ready",
        title: "Доступ к видеосессии открыт",
        body: `Можно получить токен доступа к сессии ${this.formatScheduleLabel(updated.consultation.scheduledAt)}.`,
        dedupKey: `video.session_ready:${updated.consultationId}`,
        payloadJson: {
          consultationId: updated.consultationId,
          paymentId,
          status: "payment_succeeded",
          audience: "client",
        },
      }),
      ...this.notificationVariants({
        userId: updated.consultation.psychologistUserId,
        type: "video.session_ready",
        title: "Видеосессия готова",
        body: `Для консультации ${this.formatScheduleLabel(updated.consultation.scheduledAt)} доступна видеокомната.`,
        dedupKey: `video.session_ready:${updated.consultationId}`,
        payloadJson: {
          consultationId: updated.consultationId,
          paymentId,
          status: "payment_succeeded",
          audience: "psychologist",
        },
      }),
    ]);

    return this.serializePayment(updated, this.resolveView(updated, actorUserId, roles), true);
  }

  async failMockPayment(
    paymentId: string,
    actorUserId: string,
    roles: string[],
    dto: MockFailPaymentDto,
    request: Request,
  ) {
    const payment = await this.getPaymentRecord(paymentId, true);
    const actorRole = this.resolveClientOrAdminRole(payment, actorUserId, roles);

    if (payment.status === PaymentStatus.failed) {
      return this.serializePayment(payment, this.resolveView(payment, actorUserId, roles), true);
    }

    if (payment.status !== PaymentStatus.pending) {
      throw new ConflictException("Перевести в failed можно только платёж в статусе pending");
    }

    const failureCode = dto.failureCode?.trim() || "mock_declined";
    const failureMessage = dto.failureMessage?.trim() || "Тестовый отказ из платёжной песочницы";

    await this.prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: {
          id: paymentId,
        },
        data: {
          status: PaymentStatus.failed,
          failureCode,
          failureMessage,
        },
      });

      await tx.paymentEvent.create({
        data: {
          paymentId,
          eventType: PaymentEventType.failed,
          payloadJson: {
            failureCode,
          },
        },
      });
    });

    await this.auditService.log({
      actorUserId,
      actorRole,
      action: "payments.mock_fail",
      entityType: "payment",
      entityId: paymentId,
      requestId: (request as any).requestId ?? null,
      ip: request.ip,
      userAgent: request.headers["user-agent"] ?? null,
      metadataJson: {
        failureCode,
      },
    });

    const updated = await this.getPaymentRecord(paymentId, true);
    await this.realtimeService.publishSafe({
      name: "payment.updated",
      entity: {
        type: "payment",
        id: paymentId,
      },
      audience: {
        userIds: [updated.consultation.clientUserId, updated.consultation.psychologistUserId],
      },
      payload: {
        consultationId: updated.consultationId,
        paymentId,
        status: updated.status,
      },
    });
    await this.notificationsService.createQueuedNotifications([
      ...this.notificationVariants({
        userId: updated.consultation.clientUserId,
        type: "payment.failed",
        title: "Платёж отклонён",
        body: `Платёж для консультации ${this.formatScheduleLabel(updated.consultation.scheduledAt)} отклонён.`,
        dedupKey: `payment.failed:${paymentId}`,
        payloadJson: {
          consultationId: updated.consultationId,
          paymentId,
          status: updated.status,
          failureCode,
        },
      }),
    ]);

    return this.serializePayment(updated, this.resolveView(updated, actorUserId, roles), true);
  }

  async cancelMockPayment(
    paymentId: string,
    actorUserId: string,
    roles: string[],
    request: Request,
  ) {
    const payment = await this.getPaymentRecord(paymentId, true);
    const actorRole = this.resolveClientOrAdminRole(payment, actorUserId, roles);

    if (payment.status === PaymentStatus.cancelled) {
      return this.serializePayment(payment, this.resolveView(payment, actorUserId, roles), true);
    }

    if (payment.status !== PaymentStatus.pending) {
      throw new ConflictException("Отменить можно только платёж в статусе pending");
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: {
          id: paymentId,
        },
        data: {
          status: PaymentStatus.cancelled,
        },
      });

      await tx.paymentEvent.create({
        data: {
          paymentId,
          eventType: PaymentEventType.cancelled,
          payloadJson: {
            provider: "mock",
          },
        },
      });
    });

    await this.auditService.log({
      actorUserId,
      actorRole,
      action: "payments.mock_cancel",
      entityType: "payment",
      entityId: paymentId,
      requestId: (request as any).requestId ?? null,
      ip: request.ip,
      userAgent: request.headers["user-agent"] ?? null,
      metadataJson: {
        consultationId: payment.consultationId,
      },
    });

    const updated = await this.getPaymentRecord(paymentId, true);
    await this.realtimeService.publishSafe({
      name: "payment.updated",
      entity: {
        type: "payment",
        id: paymentId,
      },
      audience: {
        userIds: [updated.consultation.clientUserId, updated.consultation.psychologistUserId],
      },
      payload: {
        consultationId: updated.consultationId,
        paymentId,
        status: updated.status,
      },
    });
    await this.notificationsService.createQueuedNotifications([
      ...this.notificationVariants({
        userId: updated.consultation.clientUserId,
        type: "payment.cancelled",
        title: "Платёж отменён",
        body: `Платёж для консультации ${this.formatScheduleLabel(updated.consultation.scheduledAt)} отменён.`,
        dedupKey: `payment.cancelled:${paymentId}`,
        payloadJson: {
          consultationId: updated.consultationId,
          paymentId,
          status: updated.status,
        },
      }),
    ]);

    return this.serializePayment(updated, this.resolveView(updated, actorUserId, roles), true);
  }

  private async findByIdempotencyKey(consultationId: string, idempotencyKey: string) {
    return this.prisma.payment.findFirst({
      where: {
        consultationId,
        idempotencyKey,
      },
      include: paymentDetailInclude,
    });
  }

  private async getPaymentRecord(paymentId: string, includeEvents: boolean) {
    const payment = await this.prisma.payment.findUnique({
      where: {
        id: paymentId,
      },
      include: includeEvents ? paymentDetailInclude : paymentListInclude,
    });

    if (!payment) {
      throw new NotFoundException("Платёж не найден");
    }

    return payment;
  }

  private assertClientOwnership(payment: PaymentListRecord | PaymentDetailRecord, clientUserId: string) {
    if (payment.consultation.clientUserId !== clientUserId) {
      throw new ForbiddenException("У вас нет доступа к этому платежу");
    }
  }

  private resolveView(
    payment: PaymentListRecord | PaymentDetailRecord,
    viewerUserId: string,
    roles: string[],
  ): PaymentView {
    if (payment.consultation.clientUserId === viewerUserId) {
      return "client";
    }

    if (payment.consultation.psychologistUserId === viewerUserId) {
      return "psychologist";
    }

    if (roles.some((role) => ADMIN_ROLES.has(role))) {
      return "admin";
    }

    throw new ForbiddenException("У вас нет доступа к этому платежу");
  }

  private resolveClientOrAdminRole(
    payment: PaymentListRecord | PaymentDetailRecord,
    actorUserId: string,
    roles: string[],
  ) {
    if (payment.consultation.clientUserId === actorUserId) {
      return "client";
    }

    if (roles.includes("superadmin")) {
      return "superadmin";
    }

    if (roles.includes("admin")) {
      return "admin";
    }

    throw new ForbiddenException("Только клиент или администратор может выполнять это действие с платежом");
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

  private serializePayment(
    payment: PaymentListRecord | PaymentDetailRecord,
    view: PaymentView,
    includeEvents = false,
  ) {
    const base = {
      id: payment.id,
      consultationId: payment.consultationId,
      provider: payment.provider,
      providerPaymentId: view === "admin" ? payment.providerPaymentId : undefined,
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
      paidAt: payment.paidAt ? payment.paidAt.toISOString() : null,
      refundedAt: payment.refundedAt ? payment.refundedAt.toISOString() : null,
      createdAt: payment.createdAt.toISOString(),
      updatedAt: payment.updatedAt.toISOString(),
      consultation: {
        id: payment.consultation.id,
        scheduledAt: payment.consultation.scheduledAt.toISOString(),
        status: payment.consultation.status,
      },
    } as Record<string, unknown>;

    if (view === "client" || view === "admin") {
      base.psychologist = {
        userId: payment.consultation.psychologist.id,
        slug: payment.consultation.psychologist.psychologistProfile?.publicSlug ?? null,
        fullName: payment.consultation.psychologist.psychologistProfile
          ? `${payment.consultation.psychologist.psychologistProfile.firstName} ${payment.consultation.psychologist.psychologistProfile.lastName}`.trim()
          : null,
        publicTitle: payment.consultation.psychologist.psychologistProfile?.publicTitle ?? null,
      };
    }

    if (view === "psychologist" || view === "admin") {
      base.client = {
        userId: payment.consultation.client.id,
        displayName:
          payment.consultation.client.clientProfile?.displayName ??
          `Client ${payment.consultation.client.id.slice(0, 8)}`,
        timezone: payment.consultation.client.clientProfile?.timezone ?? null,
      };
    }

    if (view === "client" || view === "admin") {
      base.failureCode = payment.failureCode ?? null;
      base.failureMessage = payment.failureMessage ?? null;
    }

    if ((view === "client" || view === "admin") && payment.status === PaymentStatus.pending) {
      base.mockCheckout = {
        mode: "mock",
        confirmPath: `/api/v1/payments/${payment.id}/mock/confirm`,
        failPath: `/api/v1/payments/${payment.id}/mock/fail`,
        cancelPath: `/api/v1/payments/${payment.id}/mock/cancel`,
      };
    }

    if (includeEvents && "events" in payment) {
      base.events = payment.events.map((event) => ({
        id: event.id,
        eventType: event.eventType,
        createdAt: event.createdAt.toISOString(),
      }));
    }

    return base;
  }

  private formatScheduleLabel(date: Date) {
    return new Intl.DateTimeFormat("ru-RU", {
      day: "2-digit",
      month: "short",
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
