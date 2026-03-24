import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PsychologistApprovalStatus, Prisma } from "@prisma/client";
import type { Request } from "express";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { SetSpecializationsDto } from "./dto/set-specializations.dto";
import { UpdatePsychologistProfileDto } from "./dto/update-psychologist-profile.dto";

const psychologistMeInclude = {
  specializations: {
    include: {
      specialization: true,
    },
  },
} satisfies Prisma.PsychologistProfileInclude;

type PsychologistMeRecord = Prisma.PsychologistProfileGetPayload<{
  include: typeof psychologistMeInclude;
}>;

@Injectable()
export class PsychologistsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async getMe(userId: string) {
    const profile = await this.prisma.psychologistProfile.findUnique({
      where: { userId },
      include: psychologistMeInclude,
    });

    if (!profile) {
      throw new NotFoundException("Psychologist profile not found");
    }

    return this.serialize(profile);
  }

  async updateMe(userId: string, dto: UpdatePsychologistProfileDto, request: Request) {
    const existing = await this.prisma.psychologistProfile.findUnique({
      where: { userId },
    });

    if (!existing) {
      throw new NotFoundException("Psychologist profile not found");
    }

    if (dto.publicSlug && dto.publicSlug !== existing.publicSlug) {
      const slugConflict = await this.prisma.psychologistProfile.findFirst({
        where: {
          publicSlug: dto.publicSlug,
          NOT: {
            userId,
          },
        },
        select: { userId: true },
      });

      if (slugConflict) {
        throw new ConflictException("Public slug is already taken");
      }
    }

    await this.prisma.psychologistProfile.update({
      where: { userId },
      data: {
        publicSlug: dto.publicSlug,
        firstName: dto.firstName,
        lastName: dto.lastName,
        publicTitle: dto.publicTitle,
        bio: dto.bio,
        experienceYears: dto.experienceYears,
        priceFrom: dto.priceFrom,
        priceTo: dto.priceTo,
        languagesJson: dto.languages,
        formatsJson: dto.formats,
        approvalStatus: this.requiresRemoderation(dto)
          ? PsychologistApprovalStatus.pending_review
          : undefined,
      },
    });

    await this.auditService.log({
      actorUserId: userId,
      actorRole: "psychologist",
      action: "psychologists.update_me",
      entityType: "psychologist_profile",
      entityId: userId,
      requestId: (request as any).requestId ?? null,
      ip: request.ip,
      userAgent: request.headers["user-agent"] ?? null,
      metadataJson: {
        fields: Object.keys(dto),
      },
    });

    return this.getMe(userId);
  }

  async setSpecializations(userId: string, dto: SetSpecializationsDto, request: Request) {
    const profile = await this.prisma.psychologistProfile.findUnique({
      where: { userId },
      select: { userId: true },
    });

    if (!profile) {
      throw new NotFoundException("Psychologist profile not found");
    }

    const existing = await this.prisma.specialization.findMany({
      where: {
        id: {
          in: dto.specializationIds,
        },
        isActive: true,
      },
      select: { id: true },
    });

    if (existing.length !== new Set(dto.specializationIds).size) {
      throw new NotFoundException("One or more specializations were not found");
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.psychologistSpecialization.deleteMany({
        where: {
          psychologistProfileId: userId,
        },
      });

      await tx.psychologistSpecialization.createMany({
        data: dto.specializationIds.map((specializationId) => ({
          psychologistProfileId: userId,
          specializationId,
        })),
      });

      await tx.psychologistProfile.update({
        where: { userId },
        data: {
          approvalStatus: PsychologistApprovalStatus.pending_review,
        },
      });
    });

    await this.auditService.log({
      actorUserId: userId,
      actorRole: "psychologist",
      action: "psychologists.set_specializations",
      entityType: "psychologist_profile",
      entityId: userId,
      requestId: (request as any).requestId ?? null,
      ip: request.ip,
      userAgent: request.headers["user-agent"] ?? null,
      metadataJson: {
        specializationIds: dto.specializationIds,
      },
    });

    return this.getMe(userId);
  }

  private requiresRemoderation(dto: UpdatePsychologistProfileDto) {
    return Boolean(
      dto.publicSlug ||
        dto.firstName ||
        dto.lastName ||
        dto.publicTitle ||
        dto.bio ||
        dto.priceFrom ||
        dto.priceTo ||
        dto.languages ||
        dto.formats,
    );
  }

  private serialize(profile: PsychologistMeRecord) {
    return {
      userId: profile.userId,
      publicSlug: profile.publicSlug,
      firstName: profile.firstName,
      lastName: profile.lastName,
      publicTitle: profile.publicTitle,
      bio: profile.bio,
      experienceYears: profile.experienceYears,
      priceFrom: profile.priceFrom,
      priceTo: profile.priceTo,
      languages: Array.isArray(profile.languagesJson) ? profile.languagesJson : [],
      formats: Array.isArray(profile.formatsJson) ? profile.formatsJson : [],
      approvalStatus: profile.approvalStatus,
      ratingAvg: profile.ratingAvg ? Number(profile.ratingAvg) : 0,
      reviewsCount: profile.reviewsCount,
      specializations: profile.specializations.map((item) => ({
        id: item.specialization.id,
        slug: item.specialization.slug,
        name: item.specialization.name,
      })),
    };
  }
}
