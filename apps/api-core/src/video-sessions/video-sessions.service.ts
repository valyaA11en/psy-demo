import { ConsultationStatus, PaymentStatus, Prisma } from "prisma-client-generated";
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { AccessToken } from "livekit-server-sdk";
import { DateTime } from "luxon";
import type { Request } from "express";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { VideoAccessTokenPayload } from "./interfaces/video-access-token-payload.interface";

const PARTICIPANT_JOIN_OPEN_BEFORE_MINUTES = 30;
const PARTICIPANT_JOIN_CLOSE_AFTER_MINUTES = 180;

const consultationInclude = {
  slot: {
    select: {
      id: true,
      startsAt: true,
      endsAt: true,
    },
  },
  payments: {
    orderBy: {
      createdAt: "desc",
    },
    select: {
      id: true,
      status: true,
      paidAt: true,
      createdAt: true,
    },
  },
  sessionPackageUsage: {
    select: {
      id: true,
      releasedAt: true,
      sessionPackage: {
        select: {
          id: true,
          title: true,
        },
      },
    },
  },
} satisfies Prisma.ConsultationInclude;

type ConsultationRecord = Prisma.ConsultationGetPayload<{
  include: typeof consultationInclude;
}>;

type ParticipantRole = "client" | "psychologist";

type ProviderAccess = {
  accessToken: string;
  issuedAt: string;
  expiresAt: string;
  expiresInSec: number;
  providerServerUrl: string | null;
};

@Injectable()
export class VideoSessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
  ) {}

  async getSession(consultationId: string, viewerUserId: string, roles: string[]) {
    const consultation = await this.getConsultation(consultationId);
    const participantRole = this.resolveParticipantRole(consultation, viewerUserId, roles);
    const readyConsultation = await this.ensureProvisionedIfEligible(consultation);

    return this.serializeSession(readyConsultation, participantRole);
  }

  async issueAccess(
    consultationId: string,
    viewerUserId: string,
    roles: string[],
    request: Request,
  ) {
    const consultation = await this.getConsultation(consultationId);
    const participantRole = this.resolveParticipantRole(consultation, viewerUserId, roles);
    const readyConsultation = await this.ensureProvisionedIfEligible(consultation);

    if (readyConsultation.status !== ConsultationStatus.scheduled) {
      throw new ConflictException("Доступ к видеосессии разрешен только для запланированных консультаций");
    }

    if (!this.hasAccessCoverage(readyConsultation)) {
      throw new ConflictException("Для доступа к видеосессии нужна успешная оплата или активный пакет сессий");
    }

    const window = this.resolveAccessWindow(readyConsultation);
    const now = DateTime.utc();

    if (now < window.opensAt) {
      throw new ConflictException(`Доступ к видеосессии откроется в ${window.opensAt.toISO()}`);
    }

    if (now > window.closesAt) {
      throw new ConflictException("Окно доступа к видеосессии уже закрыто");
    }

    if (!readyConsultation.meetingRoomId || !readyConsultation.meetingProvider) {
      throw new ConflictException("Видеосессия еще не подготовлена");
    }

    const access = await this.createProviderAccessToken(
      readyConsultation,
      participantRole,
      viewerUserId,
    );

    await this.auditService.log({
      actorUserId: viewerUserId,
      actorRole: participantRole,
      action: "video_sessions.issue_access",
      entityType: "consultation",
      entityId: readyConsultation.id,
      requestId: (request as any).requestId ?? null,
      ip: request.ip,
      userAgent: request.headers["user-agent"] ?? null,
      metadataJson: {
        roomId: readyConsultation.meetingRoomId,
        provider: readyConsultation.meetingProvider,
      },
    });

    return {
      consultationId: readyConsultation.id,
      provider: readyConsultation.meetingProvider,
      roomId: readyConsultation.meetingRoomId,
      participantRole,
      accessToken: access.accessToken,
      issuedAt: access.issuedAt,
      expiresAt: access.expiresAt,
      expiresInSec: access.expiresInSec,
      providerServerUrl: access.providerServerUrl,
      joinUrl: this.joinUrl(readyConsultation.id),
    };
  }

  private async getConsultation(consultationId: string) {
    const consultation = await this.prisma.consultation.findUnique({
      where: {
        id: consultationId,
      },
      include: consultationInclude,
    });

    if (!consultation) {
      throw new NotFoundException("Консультация не найдена");
    }

    return consultation;
  }

  private resolveParticipantRole(
    consultation: ConsultationRecord,
    viewerUserId: string,
    roles: string[],
  ): ParticipantRole {
    if (consultation.clientUserId === viewerUserId) {
      return "client";
    }

    if (consultation.psychologistUserId === viewerUserId) {
      return "psychologist";
    }

    if (roles.includes("admin") || roles.includes("superadmin")) {
      throw new ForbiddenException("Администраторам запрещен доступ к ссылкам и токенам видеосессии");
    }

    throw new ForbiddenException("У вас нет доступа к этой видеосессии");
  }

  private async ensureProvisionedIfEligible(consultation: ConsultationRecord) {
    if (!this.hasAccessCoverage(consultation)) {
      return consultation;
    }

    if (consultation.meetingProvider && consultation.meetingRoomId) {
      return consultation;
    }

    const provider = this.desiredProvider();
    const roomId =
      provider === "livekit"
        ? this.liveKitRoomName(consultation.id)
        : `mock-room-${consultation.id}`;

    await this.prisma.consultation.update({
      where: {
        id: consultation.id,
      },
      data: {
        meetingProvider: consultation.meetingProvider ?? provider,
        meetingRoomId: consultation.meetingRoomId ?? roomId,
        meetingJoinTokenRef:
          consultation.meetingJoinTokenRef ??
          (provider === "livekit" ? `livekit-room:${roomId}` : `mock-video:${consultation.id}`),
      },
    });

    return this.getConsultation(consultation.id);
  }

  private hasSucceededPayment(consultation: ConsultationRecord) {
    return consultation.payments.some((payment) => payment.status === PaymentStatus.succeeded);
  }

  private hasActivePackageCoverage(consultation: ConsultationRecord) {
    return Boolean(
      consultation.sessionPackageUsage && !consultation.sessionPackageUsage.releasedAt,
    );
  }

  private hasAccessCoverage(consultation: ConsultationRecord) {
    return this.hasSucceededPayment(consultation) || this.hasActivePackageCoverage(consultation);
  }

  private resolveAccessWindow(consultation: ConsultationRecord) {
    const startsAt = DateTime.fromJSDate(consultation.slot.startsAt, { zone: "utc" });
    const endsAt = DateTime.fromJSDate(consultation.slot.endsAt, { zone: "utc" });

    return {
      opensAt: startsAt.minus({ minutes: PARTICIPANT_JOIN_OPEN_BEFORE_MINUTES }),
      closesAt: endsAt.plus({ minutes: PARTICIPANT_JOIN_CLOSE_AFTER_MINUTES }),
    };
  }

  private serializeSession(consultation: ConsultationRecord, participantRole: ParticipantRole) {
    const window = this.resolveAccessWindow(consultation);
    const now = DateTime.utc();
    const paidViaPackage = this.hasActivePackageCoverage(consultation);
    const paymentSucceeded = this.hasSucceededPayment(consultation);
    const accessSatisfied = paymentSucceeded || paidViaPackage;
    const canRequestAccess =
      consultation.status === ConsultationStatus.scheduled &&
      accessSatisfied &&
      now >= window.opensAt &&
      now <= window.closesAt;

    return {
      consultationId: consultation.id,
      participantRole,
      consultationStatus: consultation.status,
      provider: consultation.meetingProvider ?? null,
      roomId: consultation.meetingRoomId ?? null,
      scheduledAt: consultation.scheduledAt.toISOString(),
      startsAt: consultation.slot.startsAt.toISOString(),
      endsAt: consultation.slot.endsAt.toISOString(),
      paymentStatus: paidViaPackage ? "paid_via_package" : paymentSucceeded ? "paid" : "payment_required",
      joinUrl: consultation.meetingRoomId ? this.joinUrl(consultation.id) : null,
      providerConnection: {
        serverUrl: consultation.meetingProvider === "livekit" ? this.liveKitWsUrlOrNull() : null,
      },
      accessWindow: {
        opensAt: window.opensAt.toISO(),
        closesAt: window.closesAt.toISO(),
      },
      accessPolicy: {
        participantsOnly: true,
        requiresSucceededPayment: true,
        opensBeforeStartMinutes: PARTICIPANT_JOIN_OPEN_BEFORE_MINUTES,
        closesAfterEndMinutes: PARTICIPANT_JOIN_CLOSE_AFTER_MINUTES,
        allowsSessionPackageCoverage: true,
      },
      canRequestAccess,
    };
  }

  private joinUrl(consultationId: string) {
    const origin = this.configService.get<string>("WEB_APP_ORIGIN", "http://localhost:3000");
    return `${origin}/session/${consultationId}`;
  }

  private async createProviderAccessToken(
    consultation: ConsultationRecord,
    participantRole: ParticipantRole,
    viewerUserId: string,
  ): Promise<ProviderAccess> {
    if (consultation.meetingProvider === "livekit") {
      return this.createLiveKitAccessToken(consultation, participantRole, viewerUserId);
    }

    return this.createMockAccessToken(consultation, participantRole, viewerUserId);
  }

  private async createMockAccessToken(
    consultation: ConsultationRecord,
    participantRole: ParticipantRole,
    viewerUserId: string,
  ): Promise<ProviderAccess> {
    const ttl = Number(this.configService.get<string>("VIDEO_ACCESS_TTL", "900"));
    const issuedAt = DateTime.utc();
    const expiresAt = issuedAt.plus({ seconds: ttl });
    const accessToken = await this.jwtService.signAsync<VideoAccessTokenPayload>(
      {
        sub: viewerUserId,
        consultationId: consultation.id,
        roomId: consultation.meetingRoomId!,
        participantRole,
        tokenType: "video_access",
      },
      {
        secret: this.videoAccessSecret(),
        expiresIn: ttl,
      },
    );

    return {
      accessToken,
      issuedAt: issuedAt.toISO()!,
      expiresAt: expiresAt.toISO()!,
      expiresInSec: ttl,
      providerServerUrl: null,
    };
  }

  private async createLiveKitAccessToken(
    consultation: ConsultationRecord,
    participantRole: ParticipantRole,
    viewerUserId: string,
  ): Promise<ProviderAccess> {
    const wsUrl = this.liveKitWsUrl();
    const ttl = Number(this.configService.get<string>("VIDEO_ACCESS_TTL", "900"));
    const issuedAt = DateTime.utc();
    const expiresAt = issuedAt.plus({ seconds: ttl });
    const token = new AccessToken(
      this.configService.getOrThrow<string>("LIVEKIT_API_KEY"),
      this.configService.getOrThrow<string>("LIVEKIT_API_SECRET"),
      {
        identity: `${participantRole}:${viewerUserId}`,
        name: participantRole === "client" ? "Клиент" : "Психолог",
        ttl: `${ttl}s`,
        metadata: JSON.stringify({
          consultationId: consultation.id,
          participantRole,
          userId: viewerUserId,
        }),
      },
    );

    token.addGrant({
      roomJoin: true,
      room: consultation.meetingRoomId!,
      canPublish: true,
      canPublishData: true,
      canSubscribe: true,
    });

    return {
      accessToken: await token.toJwt(),
      issuedAt: issuedAt.toISO()!,
      expiresAt: expiresAt.toISO()!,
      expiresInSec: ttl,
      providerServerUrl: wsUrl,
    };
  }

  private videoAccessSecret() {
    return (
      this.configService.get<string>("VIDEO_ACCESS_SECRET") ??
      this.configService.getOrThrow<string>("JWT_ACCESS_SECRET")
    );
  }

  private desiredProvider() {
    const provider = this.configService.get<string>("VIDEO_PROVIDER", "mock_video").trim().toLowerCase();
    return provider === "livekit" ? "livekit" : "mock_video";
  }

  private liveKitRoomName(consultationId: string) {
    const prefix = this.configService.get<string>("LIVEKIT_ROOM_PREFIX", "consultation").trim() || "consultation";
    return `${prefix}-${consultationId}`;
  }

  private liveKitWsUrl() {
    const url = this.liveKitWsUrlOrNull();

    if (!url) {
      throw new ConflictException("LiveKit не настроен: отсутствует LIVEKIT_WS_URL");
    }

    return url;
  }

  private liveKitWsUrlOrNull() {
    return this.configService.get<string>("LIVEKIT_WS_URL")?.trim() || null;
  }
}
