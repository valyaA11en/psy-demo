import {
  AppointmentSlotStatus,
  ConsultationStatus,
  NotificationChannel,
  Prisma,
  PsychologistApprovalStatus,
} from "@prisma/client";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { DateTime } from "luxon";
import type { Request } from "express";
import { AuditService } from "../audit/audit.service";
import type { CreateNotificationInput } from "../notifications/interfaces/create-notification-input.interface";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { RealtimeService } from "../realtime/realtime.service";
import { CancelBookingDto } from "./dto/cancel-booking.dto";
import { CreateBookingDto } from "./dto/create-booking.dto";
import { ListBookingsQueryDto } from "./dto/list-bookings-query.dto";

const ADMIN_ROLES = new Set(["admin", "superadmin"]);
const ACTIVE_BOOKING_STATUSES: ConsultationStatus[] = [ConsultationStatus.scheduled];

const bookingListInclude = {
  slot: {
    select: {
      id: true,
      startsAt: true,
      endsAt: true,
      status: true,
      source: true,
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
  payments: {
    orderBy: {
      createdAt: "desc",
    },
    take: 1,
    select: {
      id: true,
      provider: true,
      amount: true,
      currency: true,
      status: true,
      paidAt: true,
      createdAt: true,
    },
  },
  review: {
    select: {
      id: true,
      consultationId: true,
      rating: true,
      text: true,
      status: true,
      createdAt: true,
    },
  },
} satisfies Prisma.ConsultationInclude;

const bookingDetailInclude = {
  ...bookingListInclude,
  statusHistory: {
    orderBy: {
      createdAt: "asc",
    },
    select: {
      id: true,
      fromStatus: true,
      toStatus: true,
      changedByRole: true,
      reasonCode: true,
      createdAt: true,
    },
  },
} satisfies Prisma.ConsultationInclude;

type BookingListRecord = Prisma.ConsultationGetPayload<{
  include: typeof bookingListInclude;
}>;

type BookingDetailRecord = Prisma.ConsultationGetPayload<{
  include: typeof bookingDetailInclude;
}>;

type BookingView = "client" | "psychologist" | "admin";

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly realtimeService: RealtimeService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async createBooking(
    clientUserId: string,
    dto: CreateBookingDto,
    rawIdempotencyKey: string | undefined,
    request: Request,
  ) {
    await this.ensureClientProfile(clientUserId);
    const idempotencyKey = this.normalizeIdempotencyKey(rawIdempotencyKey);

    const existing = await this.findByIdempotencyKey(clientUserId, idempotencyKey);
    if (existing) {
      return this.serializeBooking(existing, "client", true);
    }

    try {
      const consultationId = await this.prisma.$transaction(async (tx) => {
        const slot = await tx.appointmentSlot.findUnique({
          where: {
            id: dto.slotId,
          },
          include: {
            psychologistProfile: {
              select: {
                userId: true,
                approvalStatus: true,
              },
            },
          },
        });

        if (!slot) {
          throw new NotFoundException("Слот записи не найден");
        }

        if (slot.status !== AppointmentSlotStatus.open) {
          throw new ConflictException("Слот записи больше недоступен");
        }

        if (slot.psychologistProfile.approvalStatus !== PsychologistApprovalStatus.approved) {
          throw new ConflictException("Психолог недоступен для записи");
        }

        if (slot.startsAt <= new Date()) {
          throw new BadRequestException("Нельзя забронировать слот в прошлом");
        }

        if (slot.psychologistProfile.userId === clientUserId) {
          throw new ForbiddenException("Нельзя забронировать собственный слот психолога");
        }

        const overlapping = await tx.consultation.findFirst({
          where: {
            clientUserId,
            status: {
              in: ACTIVE_BOOKING_STATUSES,
            },
            scheduledAt: {
              lt: slot.endsAt,
            },
            slot: {
              endsAt: {
                gt: slot.startsAt,
              },
            },
          },
          select: {
            id: true,
          },
        });

        if (overlapping) {
          throw new ConflictException("У клиента уже есть пересекающаяся консультация");
        }

        const updated = await tx.appointmentSlot.updateMany({
          where: {
            id: slot.id,
            status: AppointmentSlotStatus.open,
          },
          data: {
            status: AppointmentSlotStatus.booked,
          },
        });

        if (updated.count !== 1) {
          throw new ConflictException("Слот записи больше недоступен");
        }

        const consultation = await tx.consultation.create({
          data: {
            clientUserId,
            psychologistUserId: slot.psychologistProfileId,
            slotId: slot.id,
            status: ConsultationStatus.scheduled,
            scheduledAt: slot.startsAt,
            clientMessage: dto.clientMessage?.trim() || null,
            idempotencyKey,
          },
          select: {
            id: true,
          },
        });

        await tx.consultationStatusHistory.create({
          data: {
            consultationId: consultation.id,
            fromStatus: null,
            toStatus: ConsultationStatus.scheduled,
            changedByUserId: clientUserId,
            changedByRole: "client",
            reasonCode: "booking_created",
          },
        });

        return consultation.id;
      });

      const created = await this.getBookingRecord(consultationId, true);

      await this.auditService.log({
        actorUserId: clientUserId,
        actorRole: "client",
        action: "bookings.create",
        entityType: "consultation",
        entityId: consultationId,
        requestId: (request as any).requestId ?? null,
        ip: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
        metadataJson: {
          slotId: dto.slotId,
          psychologistUserId: created.psychologistUserId,
          scheduledAt: created.scheduledAt.toISOString(),
        },
      });

      await this.realtimeService.publishSafe({
        name: "booking.created",
        entity: {
          type: "consultation",
          id: consultationId,
        },
        audience: {
          userIds: [clientUserId, created.psychologistUserId],
        },
        payload: {
          consultationId,
          status: created.status,
        },
      });
      await this.notificationsService.createQueuedNotifications([
        ...this.notificationVariants({
          userId: clientUserId,
          type: "booking.created",
          title: "Бронирование создано",
          body: `Запись на ${this.formatSlotLabel(created.slot.startsAt)} подтверждена.`,
          dedupKey: `booking.created:${consultationId}`,
          payloadJson: {
            consultationId,
            status: created.status,
            audience: "client",
          },
        }),
        ...this.notificationVariants({
          userId: created.psychologistUserId,
          type: "booking.created",
          title: "Новая консультация",
          body: `Клиент записался на ${this.formatSlotLabel(created.slot.startsAt)}.`,
          dedupKey: `booking.created:${consultationId}`,
          payloadJson: {
            consultationId,
            status: created.status,
            audience: "psychologist",
          },
        }),
      ]);

      return this.serializeBooking(created, "client", true);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const duplicate = await this.findByIdempotencyKey(clientUserId, idempotencyKey);
        if (duplicate) {
          return this.serializeBooking(duplicate, "client", true);
        }
      }

      throw error;
    }
  }

  async listClientBookings(clientUserId: string, query: ListBookingsQueryDto) {
    return this.listBookings(
      {
        clientUserId,
      },
      query,
      "client",
    );
  }

  async listPsychologistBookings(psychologistUserId: string, query: ListBookingsQueryDto) {
    return this.listBookings(
      {
        psychologistUserId,
      },
      query,
      "psychologist",
    );
  }

  async getBookingById(bookingId: string, viewerUserId: string, roles: string[]) {
    const booking = await this.getBookingRecord(bookingId, true);
    const view = this.resolveView(booking, viewerUserId, roles);
    return this.serializeBooking(booking, view, true);
  }

  async cancelBooking(
    bookingId: string,
    actorUserId: string,
    roles: string[],
    dto: CancelBookingDto,
    request: Request,
  ) {
    const booking = await this.getBookingRecord(bookingId, true);
    const actorRole = this.resolveActorRole(booking, actorUserId, roles);

    if (booking.status !== ConsultationStatus.scheduled) {
      throw new ConflictException("Отменять можно только запланированные консультации");
    }

    const targetStatus = this.resolveCancellationStatus(actorRole);
    const reasonCode = dto.reasonCode?.trim() || this.defaultCancellationReason(actorRole);
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.consultation.update({
        where: {
          id: bookingId,
        },
        data: {
          status: targetStatus,
          cancelledAt: now,
          cancellationReasonCode: reasonCode,
          cancelledByUserId: actorUserId,
        },
      });

      await tx.consultationStatusHistory.create({
        data: {
          consultationId: bookingId,
          fromStatus: booking.status,
          toStatus: targetStatus,
          changedByUserId: actorUserId,
          changedByRole: actorRole,
          reasonCode,
        },
      });

      await tx.appointmentSlot.updateMany({
        where: {
          id: booking.slotId,
          status: AppointmentSlotStatus.booked,
        },
        data: {
          status:
            booking.slot.startsAt > now
              ? AppointmentSlotStatus.open
              : AppointmentSlotStatus.cancelled,
        },
      });
    });

    await this.auditService.log({
      actorUserId,
      actorRole,
      action: "bookings.cancel",
      entityType: "consultation",
      entityId: bookingId,
      requestId: (request as any).requestId ?? null,
      ip: request.ip,
      userAgent: request.headers["user-agent"] ?? null,
      metadataJson: {
        reasonCode,
        targetStatus,
      },
    });

    const updated = await this.getBookingRecord(bookingId, true);
    await this.realtimeService.publishSafe({
      name: "booking.cancelled",
      entity: {
        type: "consultation",
        id: bookingId,
      },
      audience: {
        userIds: [updated.clientUserId, updated.psychologistUserId],
      },
      payload: {
        consultationId: bookingId,
        status: updated.status,
        reasonCode,
      },
    });
    await this.notificationsService.createQueuedNotifications([
      ...this.notificationVariants({
        userId: updated.clientUserId,
        type: "booking.cancelled",
        title:
          actorRole === "client"
            ? "Вы отменили консультацию"
            : "Консультация отменена",
        body: `Консультация на ${this.formatSlotLabel(updated.slot.startsAt)} отменена.`,
        dedupKey: `booking.cancelled:${bookingId}:${updated.status}`,
        payloadJson: {
          consultationId: bookingId,
          status: updated.status,
          reasonCode,
          audience: "client",
        },
      }),
      ...this.notificationVariants({
        userId: updated.psychologistUserId,
        type: "booking.cancelled",
        title:
          actorRole === "psychologist"
            ? "Вы отменили консультацию"
            : "Консультация отменена",
        body: `Консультация на ${this.formatSlotLabel(updated.slot.startsAt)} отменена.`,
        dedupKey: `booking.cancelled:${bookingId}:${updated.status}`,
        payloadJson: {
          consultationId: bookingId,
          status: updated.status,
          reasonCode,
          audience: "psychologist",
        },
      }),
    ]);

    return this.serializeBooking(updated, this.resolveView(updated, actorUserId, roles), true);
  }

  async completeBooking(
    bookingId: string,
    actorUserId: string,
    roles: string[],
    request: Request,
  ) {
    const booking = await this.getBookingRecord(bookingId, true);
    const actorRole = this.resolveCompleteActorRole(booking, actorUserId, roles);

    if (booking.status !== ConsultationStatus.scheduled) {
      throw new ConflictException("Завершать можно только запланированные консультации");
    }

    if (booking.slot.endsAt > new Date()) {
      throw new ConflictException("Консультацию нельзя завершить до окончания слота");
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.consultation.update({
        where: {
          id: bookingId,
        },
        data: {
          status: ConsultationStatus.completed,
        },
      });

      await tx.consultationStatusHistory.create({
        data: {
          consultationId: bookingId,
          fromStatus: booking.status,
          toStatus: ConsultationStatus.completed,
          changedByUserId: actorUserId,
          changedByRole: actorRole,
          reasonCode: "consultation_completed",
        },
      });
    });

    await this.auditService.log({
      actorUserId,
      actorRole,
      action: "bookings.complete",
      entityType: "consultation",
      entityId: bookingId,
      requestId: (request as any).requestId ?? null,
      ip: request.ip,
      userAgent: request.headers["user-agent"] ?? null,
      metadataJson: {
        scheduledAt: booking.scheduledAt.toISOString(),
      },
    });

    const updated = await this.getBookingRecord(bookingId, true);
    await this.realtimeService.publishSafe({
      name: "booking.completed",
      entity: {
        type: "consultation",
        id: bookingId,
      },
      audience: {
        userIds: [updated.clientUserId, updated.psychologistUserId],
      },
      payload: {
        consultationId: bookingId,
        status: updated.status,
      },
    });
    await this.notificationsService.createQueuedNotifications([
      ...this.notificationVariants({
        userId: updated.clientUserId,
        type: "booking.completed",
        title: "Консультация завершена",
        body: `Консультация на ${this.formatSlotLabel(updated.slot.startsAt)} завершена.`,
        dedupKey: `booking.completed:${bookingId}`,
        payloadJson: {
          consultationId: bookingId,
          status: updated.status,
          audience: "client",
        },
      }),
      ...this.notificationVariants({
        userId: updated.psychologistUserId,
        type: "booking.completed",
        title: "Консультация завершена",
        body: `Консультация на ${this.formatSlotLabel(updated.slot.startsAt)} отмечена как завершённая.`,
        dedupKey: `booking.completed:${bookingId}`,
        payloadJson: {
          consultationId: bookingId,
          status: updated.status,
          audience: "psychologist",
        },
      }),
    ]);

    return this.serializeBooking(updated, this.resolveView(updated, actorUserId, roles), true);
  }

  private async listBookings(
    scope: { clientUserId?: string; psychologistUserId?: string },
    query: ListBookingsQueryDto,
    view: BookingView,
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;
    const range = this.resolveDateRange(query);
    const where: Prisma.ConsultationWhereInput = {
      ...scope,
      ...(query.status ? { status: query.status } : {}),
      ...(range
        ? {
            scheduledAt: {
              gte: range.startUtc.toJSDate(),
              lte: range.endUtc.toJSDate(),
            },
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.consultation.findMany({
        where,
        include: bookingListInclude,
        orderBy: {
          scheduledAt: "asc",
        },
        skip,
        take: limit,
      }),
      this.prisma.consultation.count({ where }),
    ]);

    return {
      items: items.map((item) => this.serializeBooking(item, view)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
      filters: {
        status: query.status ?? null,
        dateFrom: range?.startLocal.toISODate() ?? null,
        dateTo: range?.endLocal.toISODate() ?? null,
        timezone: range?.timezone ?? null,
      },
    };
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

  private async findByIdempotencyKey(clientUserId: string, idempotencyKey: string) {
    return this.prisma.consultation.findFirst({
      where: {
        clientUserId,
        idempotencyKey,
      },
      include: bookingDetailInclude,
    });
  }

  private async getBookingRecord(bookingId: string, includeHistory: boolean) {
    const booking = await this.prisma.consultation.findUnique({
      where: {
        id: bookingId,
      },
      include: includeHistory ? bookingDetailInclude : bookingListInclude,
    });

    if (!booking) {
      throw new NotFoundException("Бронирование не найдено");
    }

    return booking;
  }

  private resolveView(booking: BookingListRecord, viewerUserId: string, roles: string[]): BookingView {
    if (booking.clientUserId === viewerUserId) {
      return "client";
    }

    if (booking.psychologistUserId === viewerUserId) {
      return "psychologist";
    }

    if (roles.some((role) => ADMIN_ROLES.has(role))) {
      return "admin";
    }

    throw new ForbiddenException("У вас нет доступа к этому бронированию");
  }

  private resolveActorRole(booking: BookingListRecord, actorUserId: string, roles: string[]) {
    if (booking.clientUserId === actorUserId) {
      return "client";
    }

    if (booking.psychologistUserId === actorUserId) {
      return "psychologist";
    }

    if (roles.includes("superadmin")) {
      return "superadmin";
    }

    if (roles.includes("admin")) {
      return "admin";
    }

    throw new ForbiddenException("У вас нет доступа к этому бронированию");
  }

  private resolveCompleteActorRole(booking: BookingListRecord, actorUserId: string, roles: string[]) {
    if (booking.psychologistUserId === actorUserId) {
      return "psychologist";
    }

    if (roles.includes("superadmin")) {
      return "superadmin";
    }

    if (roles.includes("admin")) {
      return "admin";
    }

    throw new ForbiddenException("Только психолог или администратор может завершить консультацию");
  }

  private resolveCancellationStatus(actorRole: string) {
    switch (actorRole) {
      case "client":
        return ConsultationStatus.cancelled_by_client;
      case "psychologist":
        return ConsultationStatus.cancelled_by_psychologist;
      case "admin":
      case "superadmin":
        return ConsultationStatus.cancelled_by_admin;
      default:
        throw new ForbiddenException("Неподдерживаемая роль исполнителя");
    }
  }

  private defaultCancellationReason(actorRole: string) {
    switch (actorRole) {
      case "client":
        return "client_cancelled";
      case "psychologist":
        return "psychologist_cancelled";
      case "admin":
      case "superadmin":
        return "admin_cancelled";
      default:
        return "cancelled";
    }
  }

  private resolveDateRange(query: ListBookingsQueryDto) {
    if (!query.dateFrom && !query.dateTo) {
      return null;
    }

    const timezone = query.timezone ?? "UTC";
    if (!DateTime.now().setZone(timezone).isValid) {
      throw new BadRequestException("Некорректная timezone");
    }

    const startLocal = query.dateFrom
      ? DateTime.fromISO(query.dateFrom, { zone: timezone }).startOf("day")
      : DateTime.now().setZone(timezone).startOf("day");
    const endLocal = query.dateTo
      ? DateTime.fromISO(query.dateTo, { zone: timezone }).endOf("day")
      : startLocal.endOf("day");

    if (!startLocal.isValid || !endLocal.isValid) {
      throw new BadRequestException("Некорректный диапазон дат");
    }

    if (endLocal < startLocal) {
      throw new BadRequestException("dateTo должно быть больше или равно dateFrom");
    }

    return {
      timezone,
      startLocal,
      endLocal,
      startUtc: startLocal.toUTC(),
      endUtc: endLocal.toUTC(),
    };
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

  private serializeBooking(
    booking: BookingListRecord | BookingDetailRecord,
    view: BookingView,
    includeHistory = false,
  ) {
    const base = {
      id: booking.id,
      status: booking.status,
      scheduledAt: booking.scheduledAt.toISOString(),
      cancelledAt: booking.cancelledAt ? booking.cancelledAt.toISOString() : null,
      cancellationReasonCode: booking.cancellationReasonCode,
      createdAt: booking.createdAt.toISOString(),
      updatedAt: booking.updatedAt.toISOString(),
      slot: {
        id: booking.slot.id,
        status: booking.slot.status,
        source: booking.slot.source,
        startsAt: booking.slot.startsAt.toISOString(),
        endsAt: booking.slot.endsAt.toISOString(),
      },
      latestPayment: booking.payments[0]
        ? {
            id: booking.payments[0].id,
            provider: booking.payments[0].provider,
            amount: booking.payments[0].amount,
            currency: booking.payments[0].currency,
            status: booking.payments[0].status,
            paidAt: booking.payments[0].paidAt ? booking.payments[0].paidAt.toISOString() : null,
            createdAt: booking.payments[0].createdAt.toISOString(),
          }
        : null,
      review: booking.review
        ? {
            id: booking.review.id,
            consultationId: booking.review.consultationId,
            rating: booking.review.rating,
            text: booking.review.text,
            status: booking.review.status,
            createdAt: booking.review.createdAt.toISOString(),
          }
        : null,
      canLeaveReview:
        view === "client" &&
        booking.status === ConsultationStatus.completed &&
        booking.review === null,
    } as Record<string, unknown>;

    if (view === "client" || view === "admin") {
      base.psychologist = {
        userId: booking.psychologist.id,
        slug: booking.psychologist.psychologistProfile?.publicSlug ?? null,
        fullName: booking.psychologist.psychologistProfile
          ? `${booking.psychologist.psychologistProfile.firstName} ${booking.psychologist.psychologistProfile.lastName}`.trim()
          : null,
        publicTitle: booking.psychologist.psychologistProfile?.publicTitle ?? null,
      };
    }

    if (view === "psychologist" || view === "admin") {
      base.client = {
        userId: booking.client.id,
        displayName: booking.client.clientProfile?.displayName ?? `Client ${booking.client.id.slice(0, 8)}`,
        timezone: booking.client.clientProfile?.timezone ?? null,
      };
    }

    if (view !== "admin") {
      base.clientMessage = booking.clientMessage ?? null;
    }

    if (includeHistory && "statusHistory" in booking) {
      base.statusHistory = booking.statusHistory.map((item) => ({
        id: item.id,
        fromStatus: item.fromStatus,
        toStatus: item.toStatus,
        changedByRole: item.changedByRole,
        reasonCode: item.reasonCode,
        createdAt: item.createdAt.toISOString(),
      }));
    }

    return base;
  }

  private formatSlotLabel(date: Date) {
    return DateTime.fromJSDate(date, { zone: "utc" })
      .setLocale("ru")
      .toFormat("dd LLL yyyy, HH:mm 'UTC'");
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
