import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  ConsultationStatus,
  HomeworkTaskStatus,
  NotificationChannel,
  Prisma,
} from "prisma-client-generated";
import type { Request } from "express";
import { AuditService } from "../audit/audit.service";
import type { CreateNotificationInput } from "../notifications/interfaces/create-notification-input.interface";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { CreateHomeworkTaskDto } from "./dto/create-homework-task.dto";
import { ListHomeworkTasksQueryDto } from "./dto/list-homework-tasks-query.dto";
import { UpdateClientHomeworkTaskDto } from "./dto/update-client-homework-task.dto";
import { UpdatePsychologistHomeworkTaskDto } from "./dto/update-psychologist-homework-task.dto";

const homeworkTaskInclude = {
  consultation: {
    select: {
      id: true,
      status: true,
      scheduledAt: true,
      slot: {
        select: {
          startsAt: true,
          endsAt: true,
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
} satisfies Prisma.HomeworkTaskInclude;

type HomeworkTaskRecord = Prisma.HomeworkTaskGetPayload<{
  include: typeof homeworkTaskInclude;
}>;

type HomeworkTaskView = "client" | "psychologist";

@Injectable()
export class HomeworkTasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async listClientTasks(clientUserId: string, query: ListHomeworkTasksQueryDto) {
    return this.listTasks("client", clientUserId, query);
  }

  async listPsychologistTasks(psychologistUserId: string, query: ListHomeworkTasksQueryDto) {
    return this.listTasks("psychologist", psychologistUserId, query);
  }

  async createPsychologistTask(psychologistUserId: string, dto: CreateHomeworkTaskDto, request: Request) {
    const consultation = await this.prisma.consultation.findUnique({
      where: {
        id: dto.consultationId,
      },
      select: {
        id: true,
        clientUserId: true,
        psychologistUserId: true,
        status: true,
        scheduledAt: true,
      },
    });

    if (!consultation || consultation.psychologistUserId !== psychologistUserId) {
      throw new NotFoundException("Консультация не найдена");
    }

    if (consultation.status !== ConsultationStatus.completed) {
      throw new ConflictException("Домашнее задание можно назначить только после завершенной консультации");
    }

    const dueAt = this.parseOptionalDateTime(dto.dueAt);
    if (dueAt && dueAt <= consultation.scheduledAt) {
      throw new BadRequestException("Дедлайн должен быть позже даты консультации");
    }

    const task = await this.prisma.homeworkTask.create({
      data: {
        consultationId: consultation.id,
        clientUserId: consultation.clientUserId,
        psychologistUserId,
        title: this.normalizeTitle(dto.title),
        description: this.normalizeText(dto.description),
        dueAt,
      },
      include: homeworkTaskInclude,
    });

    await this.auditService.log({
      actorUserId: psychologistUserId,
      actorRole: "psychologist",
      action: "homework_tasks.create",
      entityType: "homework_task",
      entityId: task.id,
      requestId: (request as any).requestId ?? null,
      ip: request.ip,
      userAgent: request.headers["user-agent"] ?? null,
      metadataJson: {
        consultationId: consultation.id,
        clientUserId: consultation.clientUserId,
        dueAt: dueAt?.toISOString() ?? null,
      },
    });

    await this.notificationsService.createQueuedNotifications(
      this.notificationVariants({
        userId: consultation.clientUserId,
        type: "homework.assigned",
        title: "Психолог назначил домашнее задание",
        body: `После консультации появилось новое задание: "${task.title}".`,
        dedupKey: `homework.assigned:${task.id}:${task.createdAt.toISOString()}`,
        payloadJson: {
          homeworkTaskId: task.id,
          consultationId: consultation.id,
          status: task.status,
        },
      }),
    );

    return this.serializeTask(task, "psychologist");
  }

  async updateClientTask(
    clientUserId: string,
    taskId: string,
    dto: UpdateClientHomeworkTaskDto,
    request: Request,
  ) {
    const task = await this.prisma.homeworkTask.findFirst({
      where: {
        id: taskId,
        clientUserId,
      },
      include: homeworkTaskInclude,
    });

    if (!task) {
      throw new NotFoundException("Задание не найдено");
    }

    if (task.status === HomeworkTaskStatus.cancelled) {
      throw new ConflictException("Отмененное задание нельзя обновить");
    }

    const nextStatus = dto.status ?? task.status;
    if (![HomeworkTaskStatus.assigned, HomeworkTaskStatus.completed].includes(nextStatus)) {
      throw new BadRequestException("Клиент может только отметить задание как выполненное или вернуть его в работу");
    }

    const updated = await this.prisma.homeworkTask.update({
      where: {
        id: task.id,
      },
      data: {
        status: nextStatus,
        clientNote: this.normalizeText(dto.clientNote),
        completedAt: nextStatus === HomeworkTaskStatus.completed ? new Date() : null,
      },
      include: homeworkTaskInclude,
    });

    await this.auditService.log({
      actorUserId: clientUserId,
      actorRole: "client",
      action: "homework_tasks.update_client",
      entityType: "homework_task",
      entityId: task.id,
      requestId: (request as any).requestId ?? null,
      ip: request.ip,
      userAgent: request.headers["user-agent"] ?? null,
      metadataJson: {
        previousStatus: task.status,
        nextStatus,
      },
    });

    if (task.status !== updated.status && updated.status === HomeworkTaskStatus.completed) {
      await this.notificationsService.createQueuedNotifications(
        this.notificationVariants({
          userId: updated.psychologistUserId,
          type: "homework.completed",
          title: "Клиент отметил задание как выполненное",
          body: `Клиент завершил задание "${updated.title}".`,
          dedupKey: `homework.completed:${updated.id}:${updated.updatedAt.toISOString()}`,
          payloadJson: {
            homeworkTaskId: updated.id,
            consultationId: updated.consultationId,
            status: updated.status,
          },
        }),
      );
    }

    return this.serializeTask(updated, "client");
  }

  async updatePsychologistTask(
    psychologistUserId: string,
    taskId: string,
    dto: UpdatePsychologistHomeworkTaskDto,
    request: Request,
  ) {
    const task = await this.prisma.homeworkTask.findFirst({
      where: {
        id: taskId,
        psychologistUserId,
      },
      include: homeworkTaskInclude,
    });

    if (!task) {
      throw new NotFoundException("Задание не найдено");
    }

    if (task.status === HomeworkTaskStatus.completed && typeof dto.status !== "undefined") {
      throw new ConflictException("Выполненное задание нельзя перевести в другой статус со стороны психолога");
    }

    const nextStatus = dto.status ?? task.status;
    if (![HomeworkTaskStatus.assigned, HomeworkTaskStatus.cancelled, HomeworkTaskStatus.completed].includes(nextStatus)) {
      throw new BadRequestException("Некорректный статус задания");
    }

    const dueAt = typeof dto.dueAt === "undefined" ? task.dueAt : this.parseOptionalDateTime(dto.dueAt);

    const updated = await this.prisma.homeworkTask.update({
      where: {
        id: task.id,
      },
      data: {
        title: typeof dto.title === "undefined" ? task.title : this.normalizeTitle(dto.title),
        description: typeof dto.description === "undefined" ? task.description : this.normalizeText(dto.description),
        dueAt,
        status: nextStatus,
        completedAt:
          nextStatus === HomeworkTaskStatus.assigned
            ? null
            : nextStatus === HomeworkTaskStatus.cancelled
              ? task.completedAt
              : task.completedAt,
      },
      include: homeworkTaskInclude,
    });

    await this.auditService.log({
      actorUserId: psychologistUserId,
      actorRole: "psychologist",
      action: "homework_tasks.update_psychologist",
      entityType: "homework_task",
      entityId: task.id,
      requestId: (request as any).requestId ?? null,
      ip: request.ip,
      userAgent: request.headers["user-agent"] ?? null,
      metadataJson: {
        previousStatus: task.status,
        nextStatus,
        dueAt: dueAt?.toISOString() ?? null,
      },
    });

    if (task.status !== updated.status && updated.status === HomeworkTaskStatus.cancelled) {
      await this.notificationsService.createQueuedNotifications(
        this.notificationVariants({
          userId: updated.clientUserId,
          type: "homework.cancelled",
          title: "Домашнее задание отменено",
          body: `Психолог отменил задание "${updated.title}".`,
          dedupKey: `homework.cancelled:${updated.id}:${updated.updatedAt.toISOString()}`,
          payloadJson: {
            homeworkTaskId: updated.id,
            consultationId: updated.consultationId,
            status: updated.status,
          },
        }),
      );
    }

    return this.serializeTask(updated, "psychologist");
  }

  private async listTasks(view: HomeworkTaskView, actorUserId: string, query: ListHomeworkTasksQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;
    const where: Prisma.HomeworkTaskWhereInput = {
      ...(view === "client" ? { clientUserId: actorUserId } : { psychologistUserId: actorUserId }),
      ...(query.status ? { status: query.status } : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.homeworkTask.findMany({
        where,
        include: homeworkTaskInclude,
        orderBy: [{ status: "asc" }, { createdAt: "desc" }],
        skip,
        take: limit,
      }),
      this.prisma.homeworkTask.count({ where }),
    ]);

    return {
      items: items.map((item) => this.serializeTask(item, view)),
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

  private serializeTask(task: HomeworkTaskRecord, view: HomeworkTaskView) {
    return {
      id: task.id,
      consultationId: task.consultationId,
      title: task.title,
      description: task.description,
      dueAt: task.dueAt?.toISOString() ?? null,
      status: task.status,
      clientNote: task.clientNote,
      completedAt: task.completedAt?.toISOString() ?? null,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
      consultation: {
        id: task.consultation.id,
        status: task.consultation.status,
        scheduledAt: task.consultation.scheduledAt.toISOString(),
        slot: {
          startsAt: task.consultation.slot.startsAt.toISOString(),
          endsAt: task.consultation.slot.endsAt.toISOString(),
        },
      },
      client:
        view === "psychologist"
          ? {
              userId: task.client.id,
              displayName: task.client.clientProfile?.displayName ?? `Клиент ${task.client.id.slice(0, 6)}`,
              timezone: task.client.clientProfile?.timezone ?? null,
            }
          : null,
      psychologist:
        view === "client"
          ? {
              userId: task.psychologist.id,
              slug: task.psychologist.psychologistProfile?.publicSlug ?? null,
              fullName:
                task.psychologist.psychologistProfile
                  ? `${task.psychologist.psychologistProfile.firstName} ${task.psychologist.psychologistProfile.lastName}`.trim()
                  : null,
              publicTitle: task.psychologist.psychologistProfile?.publicTitle ?? null,
            }
          : null,
    };
  }

  private normalizeTitle(value: string) {
    const normalized = value.replace(/\s+/g, " ").trim();

    if (!normalized) {
      throw new BadRequestException("Название задания не может быть пустым");
    }

    return normalized;
  }

  private normalizeText(value: string | undefined) {
    if (typeof value === "undefined") {
      return null;
    }

    const normalized = value.replace(/\s+/g, " ").trim();
    return normalized.length > 0 ? normalized : null;
  }

  private parseOptionalDateTime(value: string | undefined) {
    if (typeof value === "undefined") {
      return null;
    }

    const parsed = new Date(value);

    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException("Некорректная дата дедлайна");
    }

    return parsed;
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
