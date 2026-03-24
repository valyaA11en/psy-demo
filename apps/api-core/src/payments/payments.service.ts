import { randomUUID } from "node:crypto";
import {
  ConsultationStatus,
  PaymentEventType,
  PaymentStatus,
  Prisma,
} from "@prisma/client";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Request } from "express";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
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
      throw new NotFoundException("Consultation not found");
    }

    if (consultation.status !== ConsultationStatus.scheduled) {
      throw new ConflictException("Only scheduled consultations can be paid");
    }

    const amount = consultation.psychologist.psychologistProfile?.priceFrom;
    if (!amount || amount <= 0) {
      throw new BadRequestException("Consultation price is not configured");
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
      throw new ConflictException("Only scheduled consultations can be paid");
    }

    if (payment.status !== PaymentStatus.pending) {
      throw new ConflictException("Only pending payments can be confirmed");
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
      throw new ConflictException("Only pending payments can be failed");
    }

    const failureCode = dto.failureCode?.trim() || "mock_declined";
    const failureMessage = dto.failureMessage?.trim() || "Mock failure from payment sandbox";

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
      throw new ConflictException("Only pending payments can be cancelled");
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
      throw new NotFoundException("Payment not found");
    }

    return payment;
  }

  private assertClientOwnership(payment: PaymentListRecord | PaymentDetailRecord, clientUserId: string) {
    if (payment.consultation.clientUserId !== clientUserId) {
      throw new ForbiddenException("You do not have access to this payment");
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

    throw new ForbiddenException("You do not have access to this payment");
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

    throw new ForbiddenException("Only the client or admin can operate this payment");
  }

  private normalizeIdempotencyKey(value: string | undefined) {
    const normalized = value?.trim();

    if (!normalized) {
      throw new BadRequestException("Idempotency-Key header is required");
    }

    if (!/^[A-Za-z0-9._:-]{8,128}$/.test(normalized)) {
      throw new BadRequestException("Idempotency-Key format is invalid");
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
}
