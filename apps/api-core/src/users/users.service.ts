import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PsychologistApprovalStatus } from "@prisma/client";
import type { Request } from "express";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { UpdateMeDto } from "./dto/update-me.dto";

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async getCurrentUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        roles: {
          include: {
            role: true,
          },
        },
        clientProfile: true,
        twoFactorCredential: {
          select: {
            enabledAt: true,
          },
        },
        psychologistProfile: {
          include: {
            specializations: {
              include: {
                specialization: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException("Пользователь не найден");
    }

    return this.serializeUser(user);
  }

  async updateCurrentUser(
    userId: string,
    roles: string[],
    dto: UpdateMeDto,
    request: Request,
  ) {
    const hasClientRole = roles.includes("client");
    const hasPsychologistRole = roles.includes("psychologist");

    if (hasClientRole && (dto.displayName || dto.timezone)) {
      await this.prisma.clientProfile.upsert({
        where: { userId },
        update: {
          displayName: dto.displayName,
          timezone: dto.timezone,
        },
        create: {
          userId,
          displayName: dto.displayName,
          timezone: dto.timezone ?? "Asia/Yekaterinburg",
        },
      });
    }

    if (hasPsychologistRole) {
      const profile = await this.prisma.psychologistProfile.findUnique({
        where: { userId },
      });

      if (!profile) {
        throw new NotFoundException("Профиль психолога не найден");
      }

      await this.prisma.psychologistProfile.update({
        where: { userId },
        data: {
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
    }

    await this.auditService.log({
      actorUserId: userId,
      actorRole: roles[0] ?? null,
      action: "users.update_me",
      entityType: "user",
      entityId: userId,
      requestId: (request as any).requestId ?? null,
      ip: request.ip,
      userAgent: request.headers["user-agent"] ?? null,
      metadataJson: {
        fields: Object.keys(dto),
      },
    });

    return this.getCurrentUser(userId);
  }

  async listSessions(userId: string, currentSessionId: string | undefined) {
    const sessions = await this.prisma.refreshToken.findMany({
      where: {
        userId,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return sessions.map((session) => ({
      id: session.id,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      revokedAt: session.revokedAt,
      current: session.id === currentSessionId,
    }));
  }

  async revokeSession(
    userId: string,
    sessionId: string,
    roles: string[],
    request: Request,
  ) {
    const session = await this.prisma.refreshToken.findUnique({
      where: { id: sessionId },
    });

    if (!session || session.userId !== userId) {
      throw new ForbiddenException("Сессия не найдена");
    }

    await this.prisma.refreshToken.update({
      where: { id: sessionId },
      data: {
        revokedAt: new Date(),
      },
    });

    await this.auditService.log({
      actorUserId: userId,
      actorRole: roles[0] ?? null,
      action: "users.revoke_session",
      entityType: "refresh_token",
      entityId: sessionId,
      requestId: (request as any).requestId ?? null,
      ip: request.ip,
      userAgent: request.headers["user-agent"] ?? null,
    });

    return { success: true };
  }

  private requiresRemoderation(dto: UpdateMeDto) {
    return Boolean(
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

  private serializeUser(user: Awaited<ReturnType<UsersService["getRawUser"]>>) {
    return {
      id: user.id,
      email: user.email,
      status: user.status,
      roles: user.roles.map((item) => item.role.code),
      twoFactorEnabled: Boolean(user.is2faEnabled && user.twoFactorCredential?.enabledAt),
      clientProfile: user.clientProfile,
      psychologistProfile: user.psychologistProfile
        ? {
            userId: user.psychologistProfile.userId,
            publicSlug: user.psychologistProfile.publicSlug,
            firstName: user.psychologistProfile.firstName,
            lastName: user.psychologistProfile.lastName,
            publicTitle: user.psychologistProfile.publicTitle,
            bio: user.psychologistProfile.bio,
            experienceYears: user.psychologistProfile.experienceYears,
            priceFrom: user.psychologistProfile.priceFrom,
            priceTo: user.psychologistProfile.priceTo,
            languages: Array.isArray(user.psychologistProfile.languagesJson)
              ? user.psychologistProfile.languagesJson
              : [],
            formats: Array.isArray(user.psychologistProfile.formatsJson)
              ? user.psychologistProfile.formatsJson
              : [],
            approvalStatus: user.psychologistProfile.approvalStatus,
            ratingAvg: user.psychologistProfile.ratingAvg
              ? Number(user.psychologistProfile.ratingAvg)
              : 0,
            reviewsCount: user.psychologistProfile.reviewsCount,
            specializations: user.psychologistProfile.specializations.map((item) => ({
              id: item.specialization.id,
              slug: item.specialization.slug,
              name: item.specialization.name,
            })),
          }
        : null,
    };
  }

  private async getRawUser(userId: string) {
    return this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        roles: {
          include: {
            role: true,
          },
        },
        clientProfile: true,
        twoFactorCredential: {
          select: {
            enabledAt: true,
          },
        },
        psychologistProfile: {
          include: {
            specializations: {
              include: {
                specialization: true,
              },
            },
          },
        },
      },
    });
  }
}
