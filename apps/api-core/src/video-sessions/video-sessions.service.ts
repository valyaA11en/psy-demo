import { ConsultationStatus, PaymentStatus, Prisma } from "@prisma/client";
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { DateTime } from "luxon";
import type { Request } from "express";
import { AuditService } from "../audit/audit.service";
import { VideoAccessTokenPayload } from "./interfaces/video-access-token-payload.interface";
import { PrismaService } from "../prisma/prisma.service";

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
} satisfies Prisma.ConsultationInclude;

type ConsultationRecord = Prisma.ConsultationGetPayload<{
  include: typeof consultationInclude;
}>;

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
      throw new ConflictException("Доступ к видео доступен только для запланированных консультаций");
    }

    if (!this.hasSucceededPayment(readyConsultation)) {
      throw new ConflictException("Для доступа к видео нужна успешная оплата");
    }

    const window = this.resolveAccessWindow(readyConsultation);
    const now = DateTime.utc();

    if (now < window.opensAt) {
      throw new ConflictException(`Доступ к видео откроется в ${window.opensAt.toISO()}`);
    }

    if (now > window.closesAt) {
      throw new ConflictException("Окно доступа к видео истекло");
    }

    if (!readyConsultation.meetingRoomId || !readyConsultation.meetingProvider) {
      throw new ConflictException("Видеосессия ещё не подготовлена");
    }

    const ttl = Number(this.configService.get<string>("VIDEO_ACCESS_TTL", "900"));
    const issuedAt = DateTime.utc();
    const expiresAt = issuedAt.plus({ seconds: ttl });
    const accessToken = await this.jwtService.signAsync<VideoAccessTokenPayload>(
      {
        sub: viewerUserId,
        consultationId: readyConsultation.id,
        roomId: readyConsultation.meetingRoomId,
        participantRole,
        tokenType: "video_access",
      },
      {
        secret: this.videoAccessSecret(),
        expiresIn: ttl,
      },
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
      accessToken,
      issuedAt: issuedAt.toISO(),
      expiresAt: expiresAt.toISO(),
      expiresInSec: ttl,
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
  ): "client" | "psychologist" {
    if (consultation.clientUserId === viewerUserId) {
      return "client";
    }

    if (consultation.psychologistUserId === viewerUserId) {
      return "psychologist";
    }

    if (roles.includes("admin") || roles.includes("superadmin")) {
      throw new ForbiddenException("Администраторам запрещён доступ к ссылкам на сессию и токенам видеокомнаты");
    }

    throw new ForbiddenException("У вас нет доступа к этой консультационной сессии");
  }

  private async ensureProvisionedIfEligible(consultation: ConsultationRecord) {
    if (!this.hasSucceededPayment(consultation)) {
      return consultation;
    }

    if (consultation.meetingProvider && consultation.meetingRoomId) {
      return consultation;
    }

    const roomId = `mock-room-${consultation.id}`;
    await this.prisma.consultation.update({
      where: {
        id: consultation.id,
      },
      data: {
        meetingProvider: consultation.meetingProvider ?? "mock_video",
        meetingRoomId: consultation.meetingRoomId ?? roomId,
        meetingJoinTokenRef: consultation.meetingJoinTokenRef ?? `mock-video:${consultation.id}`,
      },
    });

    return this.getConsultation(consultation.id);
  }

  private hasSucceededPayment(consultation: ConsultationRecord) {
    return consultation.payments.some((payment) => payment.status === PaymentStatus.succeeded);
  }

  private resolveAccessWindow(consultation: ConsultationRecord) {
    const startsAt = DateTime.fromJSDate(consultation.slot.startsAt, { zone: "utc" });
    const endsAt = DateTime.fromJSDate(consultation.slot.endsAt, { zone: "utc" });

    return {
      opensAt: startsAt.minus({ minutes: PARTICIPANT_JOIN_OPEN_BEFORE_MINUTES }),
      closesAt: endsAt.plus({ minutes: PARTICIPANT_JOIN_CLOSE_AFTER_MINUTES }),
    };
  }

  private serializeSession(
    consultation: ConsultationRecord,
    participantRole: "client" | "psychologist",
  ) {
    const window = this.resolveAccessWindow(consultation);
    const now = DateTime.utc();
    const paymentSucceeded = this.hasSucceededPayment(consultation);
    const canRequestAccess =
      consultation.status === ConsultationStatus.scheduled &&
      paymentSucceeded &&
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
      paymentStatus: paymentSucceeded ? "paid" : "payment_required",
      joinUrl: consultation.meetingRoomId ? this.joinUrl(consultation.id) : null,
      accessWindow: {
        opensAt: window.opensAt.toISO(),
        closesAt: window.closesAt.toISO(),
      },
      accessPolicy: {
        participantsOnly: true,
        requiresSucceededPayment: true,
        opensBeforeStartMinutes: PARTICIPANT_JOIN_OPEN_BEFORE_MINUTES,
        closesAfterEndMinutes: PARTICIPANT_JOIN_CLOSE_AFTER_MINUTES,
      },
      canRequestAccess,
    };
  }

  private joinUrl(consultationId: string) {
    const origin = this.configService.get<string>("WEB_APP_ORIGIN", "http://localhost:3000");
    return `${origin}/session/${consultationId}`;
  }

  private videoAccessSecret() {
    return (
      this.configService.get<string>("VIDEO_ACCESS_SECRET") ??
      this.configService.getOrThrow<string>("JWT_ACCESS_SECRET")
    );
  }
}
