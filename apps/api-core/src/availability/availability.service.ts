import {
  AppointmentSlotSource,
  AppointmentSlotStatus,
  Prisma,
  PsychologistApprovalStatus,
  Weekday,
  type AvailabilityException,
  type AvailabilityRule,
} from "@prisma/client";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { DateTime } from "luxon";
import type { Request } from "express";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { BookingSlotQueueService } from "./booking-slot-queue.service";
import { CreateAppointmentSlotDto } from "./dto/create-appointment-slot.dto";
import { CreateAvailabilityExceptionDto } from "./dto/create-availability-exception.dto";
import { CreateAvailabilityRuleDto } from "./dto/create-availability-rule.dto";
import { GenerateAppointmentSlotsDto } from "./dto/generate-appointment-slots.dto";
import { ListSlotsQueryDto } from "./dto/list-slots-query.dto";
import { UpdateAvailabilityExceptionDto } from "./dto/update-availability-exception.dto";
import { UpdateAvailabilityRuleDto } from "./dto/update-availability-rule.dto";

const ACTIVE_SLOT_STATUSES: AppointmentSlotStatus[] = [
  AppointmentSlotStatus.open,
  AppointmentSlotStatus.held,
  AppointmentSlotStatus.booked,
  AppointmentSlotStatus.blocked,
];

const WEEKDAY_ORDER: Weekday[] = [
  Weekday.monday,
  Weekday.tuesday,
  Weekday.wednesday,
  Weekday.thursday,
  Weekday.friday,
  Weekday.saturday,
  Weekday.sunday,
];

const slotSelect = {
  id: true,
  startsAt: true,
  endsAt: true,
  status: true,
  source: true,
  lockedUntil: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.AppointmentSlotSelect;

type SlotRecord = Prisma.AppointmentSlotGetPayload<{
  select: typeof slotSelect;
}>;

const exceptionSelect = {
  id: true,
  startsAt: true,
  endsAt: true,
  reason: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.AvailabilityExceptionSelect;

type ExceptionRecord = Prisma.AvailabilityExceptionGetPayload<{
  select: typeof exceptionSelect;
}>;

@Injectable()
export class AvailabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly bookingSlotQueueService: BookingSlotQueueService,
  ) {}

  async listMyRules(userId: string) {
    await this.ensurePsychologistProfile(userId);

    const rules = await this.prisma.availabilityRule.findMany({
      where: {
        psychologistProfileId: userId,
      },
      orderBy: [{ weekday: "asc" }, { startTime: "asc" }],
    });

    return rules
      .sort((a, b) => {
        const weekdayDiff = WEEKDAY_ORDER.indexOf(a.weekday) - WEEKDAY_ORDER.indexOf(b.weekday);
        if (weekdayDiff !== 0) {
          return weekdayDiff;
        }
        return a.startTime.localeCompare(b.startTime);
      })
      .map((rule) => this.serializeRule(rule));
  }

  async createRule(userId: string, dto: CreateAvailabilityRuleDto, request: Request) {
    await this.ensurePsychologistProfile(userId);
    this.assertTimezone(dto.timezone);
    this.assertTimeRange(dto.startTime, dto.endTime, dto.slotDurationMin, dto.bufferMin ?? 0);

    const rule = await this.prisma.availabilityRule.create({
      data: {
        psychologistProfileId: userId,
        weekday: dto.weekday,
        startTime: dto.startTime,
        endTime: dto.endTime,
        slotDurationMin: dto.slotDurationMin,
        bufferMin: dto.bufferMin ?? 0,
        timezone: dto.timezone,
        isActive: dto.isActive ?? true,
      },
    });

    await this.logAudit(request, userId, "availability_rules.create", "availability_rule", rule.id, {
      weekday: rule.weekday,
      startTime: rule.startTime,
      endTime: rule.endTime,
      timezone: rule.timezone,
    });

    if (rule.isActive) {
      await this.bookingSlotQueueService.enqueueRebuild(userId, {
        reason: "availability_rule_created",
        requestedByUserId: userId,
      });
    }

    return this.serializeRule(rule);
  }

  async listMyExceptions(userId: string) {
    await this.ensurePsychologistProfile(userId);

    const exceptions = await this.prisma.availabilityException.findMany({
      where: {
        psychologistProfileId: userId,
      },
      orderBy: [{ startsAt: "asc" }, { endsAt: "asc" }],
      select: exceptionSelect,
    });

    return exceptions.map((exception) => this.serializeException(exception));
  }

  async createException(
    userId: string,
    dto: CreateAvailabilityExceptionDto,
    request: Request,
  ) {
    await this.ensurePsychologistProfile(userId);
    const startsAt = DateTime.fromISO(dto.startsAt, { zone: "utc" });
    const endsAt = DateTime.fromISO(dto.endsAt, { zone: "utc" });
    const isActive = dto.isActive ?? true;

    this.assertExceptionRange(startsAt, endsAt);

    if (isActive) {
      await this.assertExceptionCanBeApplied(userId, startsAt.toJSDate(), endsAt.toJSDate());
    }

    const exception = await this.prisma.availabilityException.create({
      data: {
        psychologistProfileId: userId,
        startsAt: startsAt.toJSDate(),
        endsAt: endsAt.toJSDate(),
        reason: dto.reason?.trim() || null,
        isActive,
      },
      select: exceptionSelect,
    });

    await this.logAudit(
      request,
      userId,
      "availability_exceptions.create",
      "availability_exception",
      exception.id,
      {
        startsAt: exception.startsAt.toISOString(),
        endsAt: exception.endsAt.toISOString(),
        isActive: exception.isActive,
      },
    );

    if (exception.isActive) {
      await this.bookingSlotQueueService.enqueueRebuild(userId, {
        reason: "availability_exception_created",
        requestedByUserId: userId,
      });
    }

    return this.serializeException(exception);
  }

  async updateRule(
    userId: string,
    ruleId: string,
    dto: UpdateAvailabilityRuleDto,
    request: Request,
  ) {
    const existing = await this.prisma.availabilityRule.findFirst({
      where: {
        id: ruleId,
        psychologistProfileId: userId,
      },
    });

    if (!existing) {
      throw new NotFoundException("Правило доступности не найдено");
    }

    const timezone = dto.timezone ?? existing.timezone;
    const startTime = dto.startTime ?? existing.startTime;
    const endTime = dto.endTime ?? existing.endTime;
    const slotDurationMin = dto.slotDurationMin ?? existing.slotDurationMin;
    const bufferMin = dto.bufferMin ?? existing.bufferMin;

    this.assertTimezone(timezone);
    this.assertTimeRange(startTime, endTime, slotDurationMin, bufferMin);

    const updated = await this.prisma.availabilityRule.update({
      where: { id: ruleId },
      data: {
        weekday: dto.weekday,
        startTime: dto.startTime,
        endTime: dto.endTime,
        slotDurationMin: dto.slotDurationMin,
        bufferMin: dto.bufferMin,
        timezone: dto.timezone,
        isActive: dto.isActive,
      },
    });

    await this.logAudit(request, userId, "availability_rules.update", "availability_rule", updated.id, {
      fields: Object.keys(dto),
    });

    const shouldRebuild = existing.isActive || dto.isActive === true;
    if (shouldRebuild) {
      await this.bookingSlotQueueService.enqueueRebuild(userId, {
        reason: "availability_rule_updated",
        requestedByUserId: userId,
      });
    }

    return this.serializeRule(updated);
  }

  async deleteRule(userId: string, ruleId: string, request: Request) {
    const existing = await this.prisma.availabilityRule.findFirst({
      where: {
        id: ruleId,
        psychologistProfileId: userId,
      },
      select: {
        id: true,
        isActive: true,
      },
    });

    if (!existing) {
      throw new NotFoundException("Правило доступности не найдено");
    }

    await this.prisma.availabilityRule.delete({
      where: { id: ruleId },
    });

    await this.logAudit(request, userId, "availability_rules.delete", "availability_rule", ruleId, null);

    if (existing.isActive) {
      await this.bookingSlotQueueService.enqueueRebuild(userId, {
        reason: "availability_rule_deleted",
        requestedByUserId: userId,
      });
    }

    return {
      id: ruleId,
      deleted: true,
    };
  }

  async updateException(
    userId: string,
    exceptionId: string,
    dto: UpdateAvailabilityExceptionDto,
    request: Request,
  ) {
    const existing = await this.prisma.availabilityException.findFirst({
      where: {
        id: exceptionId,
        psychologistProfileId: userId,
      },
      select: exceptionSelect,
    });

    if (!existing) {
      throw new NotFoundException("Исключение доступности не найдено");
    }

    const startsAt = dto.startsAt
      ? DateTime.fromISO(dto.startsAt, { zone: "utc" })
      : DateTime.fromJSDate(existing.startsAt, { zone: "utc" });
    const endsAt = dto.endsAt
      ? DateTime.fromISO(dto.endsAt, { zone: "utc" })
      : DateTime.fromJSDate(existing.endsAt, { zone: "utc" });
    const isActive = dto.isActive ?? existing.isActive;

    this.assertExceptionRange(startsAt, endsAt);

    if (isActive) {
      await this.assertExceptionCanBeApplied(
        userId,
        startsAt.toJSDate(),
        endsAt.toJSDate(),
        exceptionId,
      );
    }

    const updated = await this.prisma.availabilityException.update({
      where: {
        id: exceptionId,
      },
      data: {
        startsAt: dto.startsAt ? startsAt.toJSDate() : undefined,
        endsAt: dto.endsAt ? endsAt.toJSDate() : undefined,
        reason: dto.reason === undefined ? undefined : dto.reason.trim() || null,
        isActive: dto.isActive,
      },
      select: exceptionSelect,
    });

    await this.logAudit(
      request,
      userId,
      "availability_exceptions.update",
      "availability_exception",
      updated.id,
      {
        fields: Object.keys(dto),
      },
    );

    const shouldRebuild = existing.isActive || dto.isActive === true;
    if (shouldRebuild) {
      await this.bookingSlotQueueService.enqueueRebuild(userId, {
        reason: "availability_exception_updated",
        requestedByUserId: userId,
      });
    }

    return this.serializeException(updated);
  }

  async deleteException(userId: string, exceptionId: string, request: Request) {
    const existing = await this.prisma.availabilityException.findFirst({
      where: {
        id: exceptionId,
        psychologistProfileId: userId,
      },
      select: {
        id: true,
        isActive: true,
      },
    });

    if (!existing) {
      throw new NotFoundException("Исключение доступности не найдено");
    }

    await this.prisma.availabilityException.delete({
      where: {
        id: exceptionId,
      },
    });

    await this.logAudit(
      request,
      userId,
      "availability_exceptions.delete",
      "availability_exception",
      exceptionId,
      null,
    );

    if (existing.isActive) {
      await this.bookingSlotQueueService.enqueueRebuild(userId, {
        reason: "availability_exception_deleted",
        requestedByUserId: userId,
      });
    }

    return {
      id: exceptionId,
      deleted: true,
    };
  }

  async listMySlots(userId: string, query: ListSlotsQueryDto) {
    await this.ensurePsychologistProfile(userId);
    const range = this.resolveQueryRange(query, {
      defaultDays: 30,
      maxDays: 90,
      defaultTimezone: "UTC",
    });

    const slots = await this.prisma.appointmentSlot.findMany({
      where: {
        psychologistProfileId: userId,
        startsAt: {
          gte: range.startUtc.toJSDate(),
          lte: range.endUtc.toJSDate(),
        },
        ...(query.status ? { status: query.status } : {}),
      },
      orderBy: {
        startsAt: "asc",
      },
      take: query.limit ?? 50,
      select: slotSelect,
    });

    return {
      items: slots.map((slot) => this.serializeSlot(slot, range.displayTimezone)),
      filters: {
        dateFrom: range.startLocal.toISODate(),
        dateTo: range.endLocal.toISODate(),
        timezone: range.displayTimezone,
        status: query.status ?? null,
        limit: query.limit ?? 50,
      },
    };
  }

  async createManualSlot(userId: string, dto: CreateAppointmentSlotDto, request: Request) {
    await this.ensurePsychologistProfile(userId);
    const startsAt = DateTime.fromISO(dto.startsAt, { zone: "utc" });
    const endsAt = DateTime.fromISO(dto.endsAt, { zone: "utc" });

    this.assertSlotRange(startsAt, endsAt);

    const overlappingException = await this.findActiveExceptionOverlap(
      userId,
      startsAt.toJSDate(),
      endsAt.toJSDate(),
    );
    if (overlappingException) {
      throw new ConflictException("Слот пересекается с активным исключением доступности");
    }

    const overlap = await this.findActiveOverlap(userId, startsAt.toJSDate(), endsAt.toJSDate());
    if (overlap) {
      throw new ConflictException("Слот пересекается с уже существующим активным слотом");
    }

    const slot = await this.prisma.appointmentSlot.create({
      data: {
        psychologistProfileId: userId,
        startsAt: startsAt.toJSDate(),
        endsAt: endsAt.toJSDate(),
        status: AppointmentSlotStatus.open,
        source: AppointmentSlotSource.manual,
      },
      select: slotSelect,
    });

    await this.logAudit(request, userId, "appointment_slots.create_manual", "appointment_slot", slot.id, {
      startsAt: slot.startsAt.toISOString(),
      endsAt: slot.endsAt.toISOString(),
    });

    return this.serializeSlot(slot);
  }

  async cancelSlot(userId: string, slotId: string, request: Request) {
    const slot = await this.prisma.appointmentSlot.findFirst({
      where: {
        id: slotId,
        psychologistProfileId: userId,
      },
      select: slotSelect,
    });

    if (!slot) {
      throw new NotFoundException("Слот записи не найден");
    }

    if (slot.status === AppointmentSlotStatus.booked || slot.status === AppointmentSlotStatus.held) {
      throw new ConflictException("Забронированный или удерживаемый слот нельзя отменить напрямую");
    }

    const updated = await this.prisma.appointmentSlot.update({
      where: { id: slotId },
      data: {
        status: AppointmentSlotStatus.cancelled,
      },
      select: slotSelect,
    });

    await this.logAudit(request, userId, "appointment_slots.cancel", "appointment_slot", slotId, null);

    return this.serializeSlot(updated);
  }

  async generateSlots(userId: string, dto: GenerateAppointmentSlotsDto, request: Request) {
    await this.ensurePsychologistProfile(userId);
    const dateRange = this.resolveCalendarRange(dto.dateFrom, dto.dateTo, 60);
    const rules = await this.prisma.availabilityRule.findMany({
      where: {
        psychologistProfileId: userId,
        isActive: true,
      },
      orderBy: [{ weekday: "asc" }, { startTime: "asc" }],
    });

    if (rules.length === 0) {
      throw new BadRequestException("Активные правила доступности не найдены");
    }

    const utcRange = this.resolveUtcWindow(dateRange.startDate, dateRange.endDate);

    if (dto.clearOpenGeneratedSlots) {
      await this.prisma.appointmentSlot.updateMany({
        where: {
          psychologistProfileId: userId,
          source: AppointmentSlotSource.generated,
          status: AppointmentSlotStatus.open,
          startsAt: {
            gte: utcRange.startUtc.toJSDate(),
            lte: utcRange.endUtc.toJSDate(),
          },
        },
        data: {
          status: AppointmentSlotStatus.cancelled,
        },
      });
    }

    const existingSlots = await this.prisma.appointmentSlot.findMany({
      where: {
        psychologistProfileId: userId,
        status: {
          in: ACTIVE_SLOT_STATUSES,
        },
        startsAt: {
          lt: utcRange.endUtc.toJSDate(),
        },
        endsAt: {
          gt: utcRange.startUtc.toJSDate(),
        },
      },
      orderBy: {
        startsAt: "asc",
      },
      select: {
        startsAt: true,
        endsAt: true,
      },
    });
    const activeExceptions = await this.prisma.availabilityException.findMany({
      where: {
        psychologistProfileId: userId,
        isActive: true,
        startsAt: {
          lt: utcRange.endUtc.toJSDate(),
        },
        endsAt: {
          gt: utcRange.startUtc.toJSDate(),
        },
      },
      orderBy: {
        startsAt: "asc",
      },
      select: {
        startsAt: true,
        endsAt: true,
      },
    });

    const intervals = [
      ...existingSlots.map((slot) => ({
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
      })),
      ...activeExceptions.map((exception) => ({
        startsAt: exception.startsAt,
        endsAt: exception.endsAt,
      })),
    ];

    const nowUtc = DateTime.utc();
    const toCreate: Prisma.AppointmentSlotCreateManyInput[] = [];
    let cursor = dateRange.startDate;

    while (cursor <= dateRange.endDate) {
      for (const rule of rules) {
        const localDate = DateTime.fromObject(
          {
            year: cursor.year,
            month: cursor.month,
            day: cursor.day,
          },
          { zone: rule.timezone },
        );

        if (this.weekdayFromDate(localDate) !== rule.weekday) {
          continue;
        }

        let slotStart = this.combineLocalDateAndTime(localDate, rule.startTime);
        const windowEnd = this.combineLocalDateAndTime(localDate, rule.endTime);

        while (slotStart.plus({ minutes: rule.slotDurationMin }) <= windowEnd) {
          const slotEnd = slotStart.plus({ minutes: rule.slotDurationMin });
          const slotStartUtc = slotStart.toUTC();
          const slotEndUtc = slotEnd.toUTC();
          const slotStartDate = slotStartUtc.toJSDate();
          const slotEndDate = slotEndUtc.toJSDate();

          if (slotStartUtc > nowUtc && !this.hasOverlap(intervals, slotStartDate, slotEndDate)) {
            toCreate.push({
              psychologistProfileId: userId,
              startsAt: slotStartDate,
              endsAt: slotEndDate,
              status: AppointmentSlotStatus.open,
              source: AppointmentSlotSource.generated,
            });
            intervals.push({
              startsAt: slotStartDate,
              endsAt: slotEndDate,
            });
          }

          slotStart = slotEnd.plus({ minutes: rule.bufferMin });
        }
      }

      cursor = cursor.plus({ days: 1 });
    }

    if (toCreate.length > 0) {
      await this.prisma.appointmentSlot.createMany({
        data: toCreate,
        skipDuplicates: true,
      });
    }

    await this.logAudit(request, userId, "appointment_slots.generate", "appointment_slot", userId, {
      dateFrom: dto.dateFrom,
      dateTo: dto.dateTo,
      clearOpenGeneratedSlots: dto.clearOpenGeneratedSlots ?? false,
      createdCount: toCreate.length,
    });

    return {
      createdCount: toCreate.length,
      dateFrom: dateRange.startDate.toISODate(),
      dateTo: dateRange.endDate.toISODate(),
      clearOpenGeneratedSlots: dto.clearOpenGeneratedSlots ?? false,
    };
  }

  async listPublicSlots(slug: string, query: ListSlotsQueryDto) {
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
      },
    });

    if (!profile) {
      throw new NotFoundException("Психолог не найден");
    }

    const range = this.resolveQueryRange(query, {
      defaultDays: 21,
      maxDays: 60,
      defaultTimezone: "UTC",
    });
    const effectiveStartUtc = range.startUtc > DateTime.utc() ? range.startUtc : DateTime.utc();

    const slots = await this.prisma.appointmentSlot.findMany({
      where: {
        psychologistProfileId: profile.userId,
        status: AppointmentSlotStatus.open,
        startsAt: {
          gte: effectiveStartUtc.toJSDate(),
          lte: range.endUtc.toJSDate(),
        },
      },
      orderBy: {
        startsAt: "asc",
      },
      take: query.limit ?? 50,
      select: slotSelect,
    });

    return {
      psychologist: {
        id: profile.userId,
        slug: profile.publicSlug,
        fullName: `${profile.firstName} ${profile.lastName}`.trim(),
      },
      items: slots.map((slot) => this.serializeSlot(slot, range.displayTimezone)),
      filters: {
        dateFrom: range.startLocal.toISODate(),
        dateTo: range.endLocal.toISODate(),
        timezone: range.displayTimezone,
        limit: query.limit ?? 50,
      },
    };
  }

  private async ensurePsychologistProfile(userId: string) {
    const profile = await this.prisma.psychologistProfile.findUnique({
      where: {
        userId,
      },
      select: {
        userId: true,
      },
    });

    if (!profile) {
      throw new NotFoundException("Профиль психолога не найден");
    }

    return profile;
  }

  private async findActiveOverlap(userId: string, startsAt: Date, endsAt: Date) {
    return this.prisma.appointmentSlot.findFirst({
      where: {
        psychologistProfileId: userId,
        status: {
          in: ACTIVE_SLOT_STATUSES,
        },
        startsAt: {
          lt: endsAt,
        },
        endsAt: {
          gt: startsAt,
        },
      },
      select: {
        id: true,
      },
    });
  }

  private async findActiveExceptionOverlap(
    userId: string,
    startsAt: Date,
    endsAt: Date,
    excludeId?: string,
  ) {
    return this.prisma.availabilityException.findFirst({
      where: {
        psychologistProfileId: userId,
        isActive: true,
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
        startsAt: {
          lt: endsAt,
        },
        endsAt: {
          gt: startsAt,
        },
      },
      select: {
        id: true,
      },
    });
  }

  private async findBlockedSlotOverlapForException(userId: string, startsAt: Date, endsAt: Date) {
    return this.prisma.appointmentSlot.findFirst({
      where: {
        psychologistProfileId: userId,
        status: {
          in: ACTIVE_SLOT_STATUSES,
        },
        startsAt: {
          lt: endsAt,
        },
        endsAt: {
          gt: startsAt,
        },
        NOT: {
          source: AppointmentSlotSource.generated,
          status: AppointmentSlotStatus.open,
        },
      },
      select: {
        id: true,
      },
    });
  }

  private async assertExceptionCanBeApplied(
    userId: string,
    startsAt: Date,
    endsAt: Date,
    excludeExceptionId?: string,
  ) {
    const overlappingException = await this.findActiveExceptionOverlap(
      userId,
      startsAt,
      endsAt,
      excludeExceptionId,
    );
    if (overlappingException) {
      throw new ConflictException("Исключение пересекается с другим активным исключением");
    }

    const overlappingSlot = await this.findBlockedSlotOverlapForException(userId, startsAt, endsAt);
    if (overlappingSlot) {
      throw new ConflictException(
        "Исключение пересекается с активным ручным, удерживаемым или забронированным слотом",
      );
    }
  }

  private resolveQueryRange(
    query: ListSlotsQueryDto,
    options: { defaultDays: number; maxDays: number; defaultTimezone: string },
  ) {
    const timezone = query.timezone ?? options.defaultTimezone;
    this.assertTimezone(timezone);

    const startLocal = query.dateFrom
      ? DateTime.fromISO(query.dateFrom, { zone: timezone }).startOf("day")
      : DateTime.now().setZone(timezone).startOf("day");
    const endLocal = query.dateTo
      ? DateTime.fromISO(query.dateTo, { zone: timezone }).endOf("day")
      : startLocal.plus({ days: options.defaultDays - 1 }).endOf("day");

    if (!startLocal.isValid || !endLocal.isValid) {
      throw new BadRequestException("Некорректный диапазон дат");
    }

    const days = Math.floor(endLocal.diff(startLocal, "days").days) + 1;
    if (endLocal < startLocal) {
      throw new BadRequestException("dateTo должно быть больше или равно dateFrom");
    }

    if (days > options.maxDays) {
      throw new BadRequestException(`Диапазон дат не может превышать ${options.maxDays} дней`);
    }

    return {
      displayTimezone: timezone,
      startLocal,
      endLocal,
      startUtc: startLocal.toUTC(),
      endUtc: endLocal.toUTC(),
    };
  }

  private resolveCalendarRange(dateFrom: string, dateTo: string, maxDays: number) {
    const startDate = DateTime.fromISO(dateFrom, { zone: "utc" }).startOf("day");
    const endDate = DateTime.fromISO(dateTo, { zone: "utc" }).startOf("day");

    if (!startDate.isValid || !endDate.isValid) {
      throw new BadRequestException("Некорректный диапазон дат для генерации");
    }

    if (endDate < startDate) {
      throw new BadRequestException("dateTo должно быть больше или равно dateFrom");
    }

    const days = Math.floor(endDate.diff(startDate, "days").days) + 1;
    if (days > maxDays) {
      throw new BadRequestException(`Диапазон генерации не может превышать ${maxDays} дней`);
    }

    return {
      startDate,
      endDate,
    };
  }

  private resolveUtcWindow(startDate: DateTime, endDate: DateTime) {
    return {
      startUtc: startDate.startOf("day").toUTC(),
      endUtc: endDate.endOf("day").toUTC(),
    };
  }

  private combineLocalDateAndTime(date: DateTime, time: string) {
    const [hours, minutes] = time.split(":").map((item) => Number(item));
    const value = date.set({
      hour: hours,
      minute: minutes,
      second: 0,
      millisecond: 0,
    });

    if (!value.isValid) {
      throw new BadRequestException("Некорректная локальная дата или время");
    }

    return value;
  }

  private weekdayFromDate(date: DateTime): Weekday {
    return WEEKDAY_ORDER[date.weekday - 1];
  }

  private hasOverlap(intervals: Array<{ startsAt: Date; endsAt: Date }>, startsAt: Date, endsAt: Date) {
    return intervals.some((interval) => startsAt < interval.endsAt && endsAt > interval.startsAt);
  }

  private assertTimezone(timezone: string) {
    if (!DateTime.now().setZone(timezone).isValid) {
      throw new BadRequestException("Некорректная timezone");
    }
  }

  private assertTimeRange(
    startTime: string,
    endTime: string,
    slotDurationMin: number,
    bufferMin: number,
  ) {
    const start = DateTime.fromFormat(startTime, "HH:mm", { zone: "utc" });
    const end = DateTime.fromFormat(endTime, "HH:mm", { zone: "utc" });

    if (!start.isValid || !end.isValid || end <= start) {
      throw new BadRequestException("Время окончания доступности должно быть больше времени начала");
    }

    const windowMinutes = end.diff(start, "minutes").minutes;
    if (windowMinutes < slotDurationMin) {
      throw new BadRequestException("Окно доступности короче длительности слота");
    }

    if (bufferMin < 0) {
      throw new BadRequestException("Буфер не может быть отрицательным");
    }
  }

  private assertSlotRange(startsAt: DateTime, endsAt: DateTime) {
    if (!startsAt.isValid || !endsAt.isValid) {
      throw new BadRequestException("Некорректные временные метки слота");
    }

    if (endsAt <= startsAt) {
      throw new BadRequestException("Время окончания слота должно быть больше времени начала");
    }

    if (startsAt <= DateTime.utc()) {
      throw new BadRequestException("Нельзя создать слот в прошлом");
    }
  }

  private assertExceptionRange(startsAt: DateTime, endsAt: DateTime) {
    if (!startsAt.isValid || !endsAt.isValid) {
      throw new BadRequestException("Некорректные временные метки исключения");
    }

    if (endsAt <= startsAt) {
      throw new BadRequestException("Время окончания исключения должно быть больше времени начала");
    }

    if (endsAt <= DateTime.utc()) {
      throw new BadRequestException("Нельзя создать исключение, которое уже полностью прошло");
    }
  }

  private serializeRule(rule: AvailabilityRule) {
    return {
      id: rule.id,
      weekday: rule.weekday,
      startTime: rule.startTime,
      endTime: rule.endTime,
      slotDurationMin: rule.slotDurationMin,
      bufferMin: rule.bufferMin,
      timezone: rule.timezone,
      isActive: rule.isActive,
      createdAt: rule.createdAt.toISOString(),
      updatedAt: rule.updatedAt.toISOString(),
    };
  }

  private serializeException(exception: ExceptionRecord | AvailabilityException) {
    return {
      id: exception.id,
      startsAt: exception.startsAt.toISOString(),
      endsAt: exception.endsAt.toISOString(),
      reason: exception.reason ?? null,
      isActive: exception.isActive,
      createdAt: exception.createdAt.toISOString(),
      updatedAt: exception.updatedAt.toISOString(),
    };
  }

  private serializeSlot(slot: SlotRecord, timezone = "UTC") {
    const startsAt = DateTime.fromJSDate(slot.startsAt, { zone: "utc" });
    const endsAt = DateTime.fromJSDate(slot.endsAt, { zone: "utc" });

    return {
      id: slot.id,
      status: slot.status,
      source: slot.source,
      startsAt: startsAt.toISO(),
      endsAt: endsAt.toISO(),
      startsAtLocal: startsAt.setZone(timezone).toISO(),
      endsAtLocal: endsAt.setZone(timezone).toISO(),
      timezone,
      lockedUntil: slot.lockedUntil ? slot.lockedUntil.toISOString() : null,
      createdAt: slot.createdAt.toISOString(),
      updatedAt: slot.updatedAt.toISOString(),
    };
  }

  private async logAudit(
    request: Request,
    actorUserId: string,
    action: string,
    entityType: string,
    entityId: string,
    metadataJson: Record<string, unknown> | null,
  ) {
    await this.auditService.log({
      actorUserId,
      actorRole: "psychologist",
      action,
      entityType,
      entityId,
      requestId: (request as any).requestId ?? null,
      ip: request.ip,
      userAgent: request.headers["user-agent"] ?? null,
      metadataJson,
    });
  }
}
