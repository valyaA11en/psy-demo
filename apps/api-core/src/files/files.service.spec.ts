import { Test, TestingModule } from "@nestjs/testing";
import {
  BadRequestException,
  ForbiddenException,
} from "@nestjs/common";
import { FileStatus, FileVisibility } from "@prisma/client";
import type { Request } from "express";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { FilesStorageService } from "./files-storage.service";
import { FilesService } from "./files.service";

const makeRequest = (): Request =>
  ({
    ip: "127.0.0.1",
    headers: { "user-agent": "jest" },
    requestId: "req-1",
  }) as any;

const makeFile = (overrides: Partial<any> = {}) => ({
  id: "file-1",
  ownerUserId: "psychologist-1",
  psychologistProfileId: "psychologist-1",
  bucket: "consultations-private",
  objectKey: "psychologist-1/psychologist_diploma/file-1.pdf",
  originalFilename: "diploma.pdf",
  purpose: "psychologist_diploma",
  mimeType: "application/pdf",
  sizeBytes: 2048,
  status: FileStatus.pending,
  visibility: FileVisibility.private,
  checksum: null,
  createdAt: new Date(),
  uploadedAt: null,
  deletedAt: null,
  ...overrides,
});

const mockPrisma = {
  psychologistProfile: {
    findUnique: jest.fn(),
  },
  file: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
  $transaction: jest.fn(),
};

const mockAudit = {
  log: jest.fn().mockResolvedValue(undefined),
};

const mockStorage = {
  resolveBucket: jest.fn(),
  createObjectKey: jest.fn(),
  createPresignedUpload: jest.fn(),
  createPresignedDownload: jest.fn(),
  headObject: jest.fn(),
  deleteObject: jest.fn().mockResolvedValue(undefined),
};

describe("FilesService", () => {
  let service: FilesService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(async (operations: any[]) => Promise.all(operations));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FilesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
        { provide: FilesStorageService, useValue: mockStorage },
      ],
    }).compile();

    service = module.get<FilesService>(FilesService);
  });

  it("creates pending file upload session for psychologist", async () => {
    mockPrisma.psychologistProfile.findUnique.mockResolvedValue({ userId: "psychologist-1" });
    mockStorage.resolveBucket.mockReturnValue("consultations-private");
    mockStorage.createObjectKey.mockReturnValue("psychologist-1/psychologist_diploma/file-1.pdf");
    mockPrisma.file.create.mockResolvedValue(makeFile());
    mockStorage.createPresignedUpload.mockResolvedValue({
      method: "PUT",
      url: "http://localhost/s3/consultations-private/file-1.pdf",
      headers: { "Content-Type": "application/pdf" },
      expiresAt: new Date().toISOString(),
      expiresInSec: 900,
    });

    const result = await service.createUploadSession(
      "psychologist-1",
      {
        purpose: "psychologist_diploma",
        originalFilename: "diploma.pdf",
        mimeType: "application/pdf",
        sizeBytes: 2048,
      },
      makeRequest(),
    );

    expect(result.file).toEqual(
      expect.objectContaining({
        id: "file-1",
        purpose: "psychologist_diploma",
        status: FileStatus.pending,
      }),
    );
    expect(mockPrisma.file.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ownerUserId: "psychologist-1",
          psychologistProfileId: "psychologist-1",
          purpose: "psychologist_diploma",
        }),
      }),
    );
    expect(mockAudit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "files.upload_requested",
        entityId: "file-1",
      }),
    );
  });

  it("rejects upload when psychologist profile is missing", async () => {
    mockPrisma.psychologistProfile.findUnique.mockResolvedValue(null);

    await expect(
      service.createUploadSession(
        "user-1",
        {
          purpose: "psychologist_diploma",
          originalFilename: "diploma.pdf",
          mimeType: "application/pdf",
          sizeBytes: 2048,
        },
        makeRequest(),
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it("completes upload after head-object validation", async () => {
    mockPrisma.psychologistProfile.findUnique.mockResolvedValue({ userId: "psychologist-1" });
    mockPrisma.file.findUnique.mockResolvedValue(makeFile());
    mockStorage.headObject.mockResolvedValue({
      contentType: "application/pdf",
      contentLength: 2048,
      eTag: "etag-1",
    });
    mockPrisma.file.update.mockResolvedValue(
      makeFile({
        status: FileStatus.uploaded,
        checksum: "etag-1",
        uploadedAt: new Date(),
      }),
    );

    const result = await service.completeUpload("file-1", "psychologist-1", makeRequest());

    expect(result).toEqual(
      expect.objectContaining({
        id: "file-1",
        status: FileStatus.uploaded,
        canDownload: true,
      }),
    );
    expect(mockPrisma.file.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "file-1" },
        data: expect.objectContaining({
          status: FileStatus.uploaded,
          checksum: "etag-1",
        }),
      }),
    );
    expect(mockAudit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "files.upload_completed",
      }),
    );
  });

  it("deletes object and rejects mismatched uploaded content", async () => {
    mockPrisma.psychologistProfile.findUnique.mockResolvedValue({ userId: "psychologist-1" });
    mockPrisma.file.findUnique.mockResolvedValue(makeFile());
    mockStorage.headObject.mockResolvedValue({
      contentType: "application/pdf",
      contentLength: 9999,
      eTag: "etag-1",
    });

    await expect(
      service.completeUpload("file-1", "psychologist-1", makeRequest()),
    ).rejects.toThrow(BadRequestException);

    expect(mockStorage.deleteObject).toHaveBeenCalledWith(
      "consultations-private",
      "psychologist-1/psychologist_diploma/file-1.pdf",
    );
    expect(mockPrisma.file.update).not.toHaveBeenCalled();
  });
});
