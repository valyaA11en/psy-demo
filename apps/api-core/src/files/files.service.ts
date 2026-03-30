import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { FileStatus, Prisma } from "prisma-client-generated";
import type { Request } from "express";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { CreateFileUploadDto } from "./dto/create-file-upload.dto";
import { ListMyFilesQueryDto } from "./dto/list-my-files-query.dto";
import {
  type FilePurpose,
  getFilePurposeConfig,
} from "./files.constants";
import { FilesStorageService } from "./files-storage.service";

const fileSelect = {
  id: true,
  ownerUserId: true,
  psychologistProfileId: true,
  bucket: true,
  objectKey: true,
  originalFilename: true,
  purpose: true,
  mimeType: true,
  sizeBytes: true,
  status: true,
  visibility: true,
  checksum: true,
  createdAt: true,
  uploadedAt: true,
  deletedAt: true,
} satisfies Prisma.FileSelect;

type FileRecord = Prisma.FileGetPayload<{
  select: typeof fileSelect;
}>;

@Injectable()
export class FilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly filesStorageService: FilesStorageService,
  ) {}

  async listMyFiles(userId: string, query: ListMyFilesQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;
    const where: Prisma.FileWhereInput = {
      ownerUserId: userId,
      ...(query.purpose ? { purpose: query.purpose } : {}),
      ...(query.status
        ? { status: query.status as FileStatus }
        : {
            status: {
              not: FileStatus.deleted,
            },
          }),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.file.findMany({
        where,
        select: fileSelect,
        orderBy: {
          createdAt: "desc",
        },
        skip,
        take: limit,
      }),
      this.prisma.file.count({ where }),
    ]);

    return {
      items: items.map((item) => this.serialize(item)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
      filters: {
        purpose: query.purpose ?? null,
        status: query.status ?? null,
      },
    };
  }

  async createUploadSession(userId: string, dto: CreateFileUploadDto, request: Request) {
    await this.ensurePsychologistProfile(userId);

    const purposeConfig = this.getPurposeConfig(dto.purpose);
    const originalFilename = this.normalizeFilename(dto.originalFilename);
    const mimeType = this.normalizeMimeType(dto.mimeType);
    const allowedMimeTypes = purposeConfig.mimeTypes as readonly string[];

    if (!allowedMimeTypes.includes(mimeType)) {
      throw new BadRequestException("Недопустимый mime type для выбранного типа файла");
    }

    if (dto.sizeBytes > purposeConfig.maxSizeBytes) {
      throw new BadRequestException(
        `Файл превышает допустимый размер ${Math.floor(purposeConfig.maxSizeBytes / (1024 * 1024))} МБ`,
      );
    }

    const bucket = this.filesStorageService.resolveBucket(purposeConfig.bucketKind);
    const objectKey = this.filesStorageService.createObjectKey(
      userId,
      dto.purpose as FilePurpose,
      originalFilename,
      mimeType,
    );

    const file = await this.prisma.file.create({
      data: {
        ownerUserId: userId,
        psychologistProfileId: userId,
        bucket,
        objectKey,
        originalFilename,
        purpose: dto.purpose,
        mimeType,
        sizeBytes: dto.sizeBytes,
        status: FileStatus.pending,
        visibility: purposeConfig.visibility,
      },
      select: fileSelect,
    });

    const upload = await this.filesStorageService.createPresignedUpload({
      bucket,
      objectKey,
      mimeType,
    });

    await this.auditService.log({
      actorUserId: userId,
      actorRole: "psychologist",
      action: "files.upload_requested",
      entityType: "file",
      entityId: file.id,
      requestId: (request as any).requestId ?? null,
      ip: request.ip,
      userAgent: request.headers["user-agent"] ?? null,
      metadataJson: {
        purpose: dto.purpose,
        sizeBytes: dto.sizeBytes,
        mimeType,
        visibility: purposeConfig.visibility,
      },
    });

    return {
      file: this.serialize(file),
      upload,
    };
  }

  async completeUpload(fileId: string, userId: string, request: Request) {
    await this.ensurePsychologistProfile(userId);
    const file = await this.getOwnedFile(fileId, userId);

    if (file.status === FileStatus.deleted) {
      throw new NotFoundException("Файл не найден");
    }

    if (file.status === FileStatus.uploaded) {
      return this.serialize(file);
    }

    const headObject = await this.filesStorageService.headObject(file.bucket, file.objectKey);

    if (!headObject) {
      throw new BadRequestException("Загрузка не завершена: объект в хранилище не найден");
    }

    if (headObject.contentLength !== file.sizeBytes) {
      await this.filesStorageService.deleteObject(file.bucket, file.objectKey);
      throw new BadRequestException("Размер загруженного файла не совпадает с ожидаемым");
    }

    if (!headObject.contentType || headObject.contentType !== this.normalizeMimeType(file.mimeType)) {
      await this.filesStorageService.deleteObject(file.bucket, file.objectKey);
      throw new BadRequestException("Mime type загруженного файла не прошёл проверку");
    }

    const updated = await this.prisma.file.update({
      where: {
        id: file.id,
      },
      data: {
        status: FileStatus.uploaded,
        checksum: headObject.eTag ?? file.checksum,
        uploadedAt: new Date(),
      },
      select: fileSelect,
    });

    await this.auditService.log({
      actorUserId: userId,
      actorRole: "psychologist",
      action: "files.upload_completed",
      entityType: "file",
      entityId: updated.id,
      requestId: (request as any).requestId ?? null,
      ip: request.ip,
      userAgent: request.headers["user-agent"] ?? null,
      metadataJson: {
        purpose: updated.purpose,
        sizeBytes: updated.sizeBytes,
        mimeType: updated.mimeType,
        visibility: updated.visibility,
      },
    });

    return this.serialize(updated);
  }

  async createDownloadUrl(fileId: string, userId: string, request: Request) {
    await this.ensurePsychologistProfile(userId);
    const file = await this.getOwnedFile(fileId, userId);

    if (file.status !== FileStatus.uploaded || file.deletedAt) {
      throw new NotFoundException("Файл не найден");
    }

    const download = await this.filesStorageService.createPresignedDownload({
      bucket: file.bucket,
      objectKey: file.objectKey,
      mimeType: file.mimeType,
      visibility: file.visibility,
    });

    await this.auditService.log({
      actorUserId: userId,
      actorRole: "psychologist",
      action: "files.download_url_requested",
      entityType: "file",
      entityId: file.id,
      requestId: (request as any).requestId ?? null,
      ip: request.ip,
      userAgent: request.headers["user-agent"] ?? null,
      metadataJson: {
        purpose: file.purpose,
        visibility: file.visibility,
      },
    });

    return download;
  }

  async deleteFile(fileId: string, userId: string, request: Request) {
    await this.ensurePsychologistProfile(userId);
    const file = await this.getOwnedFile(fileId, userId);

    if (file.status !== FileStatus.deleted) {
      await this.filesStorageService.deleteObject(file.bucket, file.objectKey);

      await this.prisma.file.update({
        where: {
          id: file.id,
        },
        data: {
          status: FileStatus.deleted,
          deletedAt: new Date(),
        },
      });

      await this.auditService.log({
        actorUserId: userId,
        actorRole: "psychologist",
        action: "files.deleted",
        entityType: "file",
        entityId: file.id,
        requestId: (request as any).requestId ?? null,
        ip: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
        metadataJson: {
          purpose: file.purpose,
          previousStatus: file.status,
        },
      });
    }

    return {
      id: file.id,
      deleted: true,
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
      throw new ForbiddenException("Загрузка файлов доступна только психологам с профилем");
    }

    return profile;
  }

  private async getOwnedFile(fileId: string, userId: string) {
    const file = await this.prisma.file.findUnique({
      where: {
        id: fileId,
      },
      select: fileSelect,
    });

    if (!file || file.ownerUserId !== userId) {
      throw new NotFoundException("Файл не найден");
    }

    return file;
  }

  private getPurposeConfig(purpose: string) {
    const config = getFilePurposeConfig(purpose);

    if (!config) {
      throw new BadRequestException("Неизвестный тип файла");
    }

    return config;
  }

  private normalizeFilename(value: string) {
    const normalized = value.replace(/\s+/g, " ").trim();

    if (!normalized) {
      throw new BadRequestException("Имя файла не должно быть пустым");
    }

    return normalized.slice(0, 255);
  }

  private normalizeMimeType(value: string) {
    const normalized = value.trim().toLowerCase();

    if (!normalized) {
      throw new BadRequestException("Mime type не должен быть пустым");
    }

    return normalized;
  }

  private serialize(file: FileRecord) {
    return {
      id: file.id,
      purpose: file.purpose,
      originalFilename: file.originalFilename,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      status: file.status,
      visibility: file.visibility,
      createdAt: file.createdAt.toISOString(),
      uploadedAt: file.uploadedAt ? file.uploadedAt.toISOString() : null,
      deletedAt: file.deletedAt ? file.deletedAt.toISOString() : null,
      canDownload: file.status === FileStatus.uploaded && !file.deletedAt,
    };
  }
}
