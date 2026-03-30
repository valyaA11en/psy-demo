import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, UserStatus } from "prisma-client-generated";
import type { Request } from "express";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { ListMoodEntriesQueryDto } from "./dto/list-mood-entries-query.dto";
import { UpsertMoodEntryDto } from "./dto/upsert-mood-entry.dto";

const moodEntryInclude = {
  client: {
    select: {
      id: true,
      clientProfile: {
        select: {
          displayName: true,
        },
      },
    },
  },
} satisfies Prisma.MoodEntryInclude;

type MoodEntryRecord = Prisma.MoodEntryGetPayload<{
  include: typeof moodEntryInclude;
}>;

@Injectable()
export class MoodEntriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async listClientEntries(clientUserId: string, query: ListMoodEntriesQueryDto) {
    const items = await this.fetchEntries(clientUserId, query);

    return {
      client: null,
      items: items.map((item) => this.serializeEntry(item)),
      summary: this.buildSummary(items),
      filters: {
        dateFrom: query.dateFrom ?? null,
        dateTo: query.dateTo ?? null,
        limit: query.limit ?? 14,
      },
    };
  }

  async upsertClientEntry(clientUserId: string, dto: UpsertMoodEntryDto, request: Request) {
    const recordedForDate = this.parseDateOnly(dto.recordedForDate);
    const emotions = this.normalizeEmotions(dto.emotions);
    const note = this.normalizeNote(dto.note);

    const existing = await this.prisma.moodEntry.findUnique({
      where: {
        clientUserId_recordedForDate: {
          clientUserId,
          recordedForDate,
        },
      },
      include: moodEntryInclude,
    });

    const saved = existing
      ? await this.prisma.moodEntry.update({
          where: {
            id: existing.id,
          },
          data: {
            moodScore: dto.moodScore,
            emotionsJson: emotions.length > 0 ? emotions : Prisma.JsonNull,
            note,
          },
          include: moodEntryInclude,
        })
      : await this.prisma.moodEntry.create({
          data: {
            clientUserId,
            recordedForDate,
            moodScore: dto.moodScore,
            emotionsJson: emotions.length > 0 ? emotions : Prisma.JsonNull,
            note,
          },
          include: moodEntryInclude,
        });

    await this.auditService.log({
      actorUserId: clientUserId,
      actorRole: "client",
      action: existing ? "mood_entries.update" : "mood_entries.create",
      entityType: "mood_entry",
      entityId: saved.id,
      requestId: (request as any).requestId ?? null,
      ip: request.ip,
      userAgent: request.headers["user-agent"] ?? null,
      metadataJson: {
        recordedForDate: dto.recordedForDate,
        moodScore: dto.moodScore,
      },
    });

    return this.serializeEntry(saved);
  }

  async listPsychologistClientEntries(
    psychologistUserId: string,
    clientUserId: string,
    query: ListMoodEntriesQueryDto,
  ) {
    await this.assertPsychologistCanViewClient(psychologistUserId, clientUserId);

    const items = await this.fetchEntries(clientUserId, query);
    const client = await this.prisma.user.findFirst({
      where: {
        id: clientUserId,
        status: {
          not: UserStatus.deleted,
        },
      },
      select: {
        id: true,
        clientProfile: {
          select: {
            displayName: true,
            timezone: true,
          },
        },
      },
    });

    if (!client) {
      throw new NotFoundException("Клиент не найден");
    }

    await this.auditService.log({
      actorUserId: psychologistUserId,
      actorRole: "psychologist",
      action: "mood_entries.list_client",
      entityType: "user",
      entityId: clientUserId,
      metadataJson: {
        limit: query.limit ?? 14,
        dateFrom: query.dateFrom ?? null,
        dateTo: query.dateTo ?? null,
      },
    });

    return {
      client: {
        userId: client.id,
        displayName: client.clientProfile?.displayName?.trim() || `Клиент ${client.id.slice(0, 6)}`,
        timezone: client.clientProfile?.timezone ?? null,
      },
      items: items.map((item) => this.serializeEntry(item)),
      summary: this.buildSummary(items),
      filters: {
        dateFrom: query.dateFrom ?? null,
        dateTo: query.dateTo ?? null,
        limit: query.limit ?? 14,
      },
    };
  }

  private async assertPsychologistCanViewClient(psychologistUserId: string, clientUserId: string) {
    const relationship = await this.prisma.consultation.findFirst({
      where: {
        psychologistUserId,
        clientUserId,
      },
      select: {
        id: true,
      },
    });

    if (!relationship) {
      throw new NotFoundException("Клиент не найден");
    }
  }

  private async fetchEntries(clientUserId: string, query: ListMoodEntriesQueryDto) {
    const limit = query.limit ?? 14;
    const where = this.buildWhere(clientUserId, query);

    const items = await this.prisma.moodEntry.findMany({
      where,
      include: moodEntryInclude,
      orderBy: {
        recordedForDate: "desc",
      },
      take: limit,
    });

    return [...items].reverse();
  }

  private buildWhere(clientUserId: string, query: ListMoodEntriesQueryDto): Prisma.MoodEntryWhereInput {
    const fromDate = query.dateFrom ? this.parseDateOnly(query.dateFrom) : null;
    const toDate = query.dateTo ? this.parseDateOnly(query.dateTo) : null;

    if (fromDate && toDate && fromDate > toDate) {
      throw new BadRequestException("dateFrom должен быть раньше или равен dateTo");
    }

    return {
      clientUserId,
      ...(fromDate || toDate
        ? {
            recordedForDate: {
              ...(fromDate ? { gte: fromDate } : {}),
              ...(toDate ? { lte: toDate } : {}),
            },
          }
        : {}),
    };
  }

  private parseDateOnly(value: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new BadRequestException("Ожидается дата в формате YYYY-MM-DD");
    }

    return new Date(`${value}T00:00:00.000Z`);
  }

  private normalizeEmotions(value: string[] | undefined) {
    if (!value?.length) {
      return [];
    }

    const unique = new Map<string, string>();

    for (const item of value) {
      const normalized = item.replace(/\s+/g, " ").trim();

      if (!normalized) {
        continue;
      }

      const key = normalized.toLocaleLowerCase("ru-RU");

      if (!unique.has(key)) {
        unique.set(key, normalized);
      }
    }

    return [...unique.values()].slice(0, 8);
  }

  private normalizeNote(value: string | undefined) {
    if (typeof value === "undefined") {
      return null;
    }

    const normalized = value.replace(/\s+/g, " ").trim();

    return normalized.length > 0 ? normalized : null;
  }

  private buildSummary(items: MoodEntryRecord[]) {
    if (items.length === 0) {
      return {
        daysTracked: 0,
        averageScore: null,
        latestScore: null,
        latestRecordedForDate: null,
        minScore: null,
        maxScore: null,
      };
    }

    const scores = items.map((item) => item.moodScore);
    const sum = scores.reduce((total, score) => total + score, 0);
    const latest = items[items.length - 1];

    return {
      daysTracked: items.length,
      averageScore: Number((sum / items.length).toFixed(2)),
      latestScore: latest.moodScore,
      latestRecordedForDate: this.serializeDateOnly(latest.recordedForDate),
      minScore: Math.min(...scores),
      maxScore: Math.max(...scores),
    };
  }

  private serializeEntry(item: MoodEntryRecord) {
    return {
      id: item.id,
      clientUserId: item.clientUserId,
      recordedForDate: this.serializeDateOnly(item.recordedForDate),
      moodScore: item.moodScore,
      emotions: this.readEmotions(item.emotionsJson),
      note: item.note,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    };
  }

  private readEmotions(value: Prisma.JsonValue | null) {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.filter((item): item is string => typeof item === "string");
  }

  private serializeDateOnly(value: Date) {
    return value.toISOString().slice(0, 10);
  }
}
