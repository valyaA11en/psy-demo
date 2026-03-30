import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { MoodEntriesService } from "./mood-entries.service";

const mockPrisma = {
  moodEntry: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn(),
  },
  consultation: {
    findFirst: jest.fn(),
  },
  user: {
    findFirst: jest.fn(),
  },
};

const mockAudit = {
  log: jest.fn().mockResolvedValue(undefined),
};

const makeRequest = () =>
  ({
    ip: "127.0.0.1",
    headers: {
      "user-agent": "jest",
    },
    requestId: "req-1",
  }) as any;

const makeMoodEntry = (overrides: Partial<any> = {}) => ({
  id: "mood-entry-1",
  clientUserId: "client-1",
  recordedForDate: new Date("2026-03-29T00:00:00.000Z"),
  moodScore: 7,
  emotionsJson: ["спокойствие", "усталость"],
  note: "Состояние ровнее, чем на прошлой неделе.",
  createdAt: new Date("2026-03-29T08:00:00.000Z"),
  updatedAt: new Date("2026-03-29T08:00:00.000Z"),
  client: {
    id: "client-1",
    clientProfile: {
      displayName: "Ирина",
    },
  },
  ...overrides,
});

describe("MoodEntriesService", () => {
  let service: MoodEntriesService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MoodEntriesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();

    service = module.get<MoodEntriesService>(MoodEntriesService);
  });

  it("creates a new mood entry for a date", async () => {
    mockPrisma.moodEntry.findUnique.mockResolvedValue(null);
    mockPrisma.moodEntry.create.mockResolvedValue(makeMoodEntry());

    const result = await service.upsertClientEntry(
      "client-1",
      {
        recordedForDate: "2026-03-29",
        moodScore: 7,
        emotions: ["спокойствие", " усталость ", "спокойствие"],
        note: "  Состояние ровнее, чем на прошлой неделе.  ",
      },
      makeRequest(),
    );

    expect(result).toEqual(
      expect.objectContaining({
        recordedForDate: "2026-03-29",
        moodScore: 7,
        emotions: ["спокойствие", "усталость"],
      }),
    );
    expect(mockPrisma.moodEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          clientUserId: "client-1",
          moodScore: 7,
        }),
      }),
    );
    expect(mockAudit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "mood_entries.create",
      }),
    );
  });

  it("updates existing entry for the same date", async () => {
    mockPrisma.moodEntry.findUnique.mockResolvedValue(makeMoodEntry());
    mockPrisma.moodEntry.update.mockResolvedValue(
      makeMoodEntry({
        moodScore: 9,
        emotionsJson: ["энергия"],
      }),
    );

    const result = await service.upsertClientEntry(
      "client-1",
      {
        recordedForDate: "2026-03-29",
        moodScore: 9,
        emotions: ["энергия"],
      },
      makeRequest(),
    );

    expect(result.moodScore).toBe(9);
    expect(mockPrisma.moodEntry.update).toHaveBeenCalled();
    expect(mockAudit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "mood_entries.update",
      }),
    );
  });

  it("rejects inverted date ranges", async () => {
    await expect(
      service.listClientEntries("client-1", {
        dateFrom: "2026-03-30",
        dateTo: "2026-03-01",
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it("allows psychologist to see client trend only with consultation relationship", async () => {
    mockPrisma.consultation.findFirst.mockResolvedValue({ id: "consultation-1" });
    mockPrisma.moodEntry.findMany.mockResolvedValue([
      makeMoodEntry({
        id: "mood-entry-2",
        recordedForDate: new Date("2026-03-29T00:00:00.000Z"),
        moodScore: 8,
      }),
      makeMoodEntry({
        id: "mood-entry-1",
        recordedForDate: new Date("2026-03-28T00:00:00.000Z"),
        moodScore: 5,
      }),
    ]);
    mockPrisma.user.findFirst.mockResolvedValue({
      id: "client-1",
      clientProfile: {
        displayName: "Ирина",
        timezone: "Asia/Yekaterinburg",
      },
    });

    const result = await service.listPsychologistClientEntries("psychologist-1", "client-1", {
      limit: 14,
    });

    expect(result.client).toEqual(
      expect.objectContaining({
        userId: "client-1",
        displayName: "Ирина",
      }),
    );
    expect(result.summary).toEqual(
      expect.objectContaining({
        daysTracked: 2,
        latestScore: 8,
      }),
    );
  });

  it("hides client trend from unrelated psychologist", async () => {
    mockPrisma.consultation.findFirst.mockResolvedValue(null);

    await expect(
      service.listPsychologistClientEntries("psychologist-1", "client-1", {}),
    ).rejects.toThrow(NotFoundException);
  });
});
