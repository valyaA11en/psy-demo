import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import {
  NotificationChannel,
  Prisma,
  PsychologistApprovalStatus,
  UserStatus,
} from "@prisma/client";
import bcrypt from "bcryptjs";
import type { Request, Response } from "express";
import { AuditService } from "../audit/audit.service";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";
import { DisableTwoFactorDto } from "./dto/disable-two-factor.dto";
import { EnableTwoFactorDto } from "./dto/enable-two-factor.dto";
import { ResendEmailVerificationDto } from "./dto/resend-email-verification.dto";
import { VerifyEmailDto } from "./dto/verify-email.dto";
import { VerifyTwoFactorLoginDto } from "./dto/verify-two-factor-login.dto";
import { RefreshTokenPayload } from "./interfaces/refresh-token-payload.interface";
import { SessionRevocationService } from "./session-revocation.service";
import { TwoFactorService } from "./two-factor.service";
import { TwoFactorStateService } from "./two-factor-state.service";

type AuthIdentity = Prisma.UserGetPayload<{
  include: {
    roles: { include: { role: true } };
    clientProfile: true;
    psychologistProfile: true;
    twoFactorCredential: {
      select: {
        enabledAt: true;
      };
    };
  };
}>;

type AuthTwoFactorUser = Prisma.UserGetPayload<{
  include: {
    roles: { include: { role: true } };
    clientProfile: true;
    psychologistProfile: true;
    twoFactorCredential: true;
  };
}>;

@Injectable()
export class AuthService {
  private readonly refreshCookieName = "refresh_token";

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
    private readonly sessionRevocationService: SessionRevocationService,
    private readonly twoFactorService: TwoFactorService,
    private readonly twoFactorStateService: TwoFactorStateService,
  ) {}

  async register(dto: RegisterDto, request: Request) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (existing) {
      throw new ConflictException("Пользователь уже существует");
    }

    const role = await this.prisma.role.findUnique({
      where: {
        code: dto.accountType,
      },
    });

    if (!role) {
      throw new ForbiddenException("Регистрация с этой ролью недоступна");
    }

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: dto.email.toLowerCase(),
          passwordHash: await bcrypt.hash(dto.password, 10),
          status: UserStatus.pending,
          consentRecords: {
            create: [
              {
                consentType: "privacy_policy",
                version: "2026-03-01",
                granted: true,
                grantedAt: new Date(),
                source: "web-register",
              },
              {
                consentType: "platform_terms",
                version: "2026-03-01",
                granted: true,
                grantedAt: new Date(),
                source: "web-register",
              },
            ],
          },
          roles: {
            create: {
              roleId: role.id,
            },
          },
        },
        include: {
          roles: {
            include: {
              role: true,
            },
          },
          clientProfile: true,
          psychologistProfile: true,
        },
      });

      if (dto.accountType === "client") {
        await tx.clientProfile.create({
          data: {
            userId: created.id,
            displayName: dto.displayName ?? null,
          },
        });
      } else {
        await tx.psychologistProfile.create({
          data: {
            userId: created.id,
            publicSlug: `psychologist-${created.id.slice(0, 8)}`,
            firstName: dto.firstName ?? "Новый",
            lastName: dto.lastName ?? "Психолог",
            publicTitle: dto.publicTitle ?? null,
            approvalStatus: PsychologistApprovalStatus.pending_review,
          },
        });
      }

      return tx.user.findUniqueOrThrow({
        where: { id: created.id },
        include: {
          roles: {
            include: {
              role: true,
            },
          },
          clientProfile: true,
          psychologistProfile: true,
        },
      });
    });

    await this.auditService.log({
      actorUserId: user.id,
      actorRole: dto.accountType,
      action: "auth.register",
      entityType: "user",
      entityId: user.id,
      requestId: (request as any).requestId ?? null,
      ip: request.ip,
      userAgent: request.headers["user-agent"] ?? null,
      metadataJson: {
        accountType: dto.accountType,
      },
    });

    const verification = await this.issueEmailVerification(user.id, user.email);

    return {
      success: true,
      requiresEmailVerification: true,
      email: user.email,
      verificationExpiresAt: verification.expiresAt.toISOString(),
      ...(verification.debugVerificationLink
        ? { debugVerificationLink: verification.debugVerificationLink }
        : {}),
    };
  }

  async login(dto: LoginDto, request: Request, response: Response) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      include: {
        roles: {
          include: {
            role: true,
          },
        },
        clientProfile: true,
        psychologistProfile: true,
        twoFactorCredential: {
          select: {
            enabledAt: true,
          },
        },
      },
    });

    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException("Неверные учётные данные");
    }

    if (!user.emailVerifiedAt || user.status === UserStatus.pending) {
      throw new ForbiddenException("Подтвердите email перед входом в систему");
    }

    if (user.status !== UserStatus.active) {
      throw new ForbiddenException("Пользователь не активен");
    }

    if (this.isTwoFactorProtected(user)) {
      const challenge = await this.twoFactorStateService.createLoginChallenge({
        userId: user.id,
        email: user.email,
        roles: this.roleCodes(user),
      });

      await this.auditService.log({
        actorUserId: user.id,
        actorRole: this.roleCodes(user)[0] ?? null,
        action: "auth.login_2fa_challenge_started",
        entityType: "user",
        entityId: user.id,
        requestId: (request as any).requestId ?? null,
        ip: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });

      this.clearRefreshCookie(response);

      return {
        requiresTwoFactor: true,
        challengeToken: challenge.token,
        challengeExpiresAt: challenge.expiresAt.toISOString(),
        methods: ["totp", "recovery_code"],
      };
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
      },
    });

    await this.auditService.log({
      actorUserId: user.id,
      actorRole: this.roleCodes(user)[0] ?? null,
      action: "auth.login",
      entityType: "user",
      entityId: user.id,
      requestId: (request as any).requestId ?? null,
      ip: request.ip,
      userAgent: request.headers["user-agent"] ?? null,
    });

    return this.issueAuthSession(user, request, response);
  }

  async verifyTwoFactorLogin(
    dto: VerifyTwoFactorLoginDto,
    request: Request,
    response: Response,
  ) {
    if (!dto.code && !dto.recoveryCode) {
      throw new BadRequestException("Введите TOTP-код или recovery code");
    }

    const challenge = await this.twoFactorStateService.getLoginChallenge(dto.challengeToken);

    if (!challenge || new Date(challenge.expiresAt) < new Date()) {
      await this.twoFactorStateService.deleteLoginChallenge(dto.challengeToken);
      throw new UnauthorizedException("2FA challenge недействителен или истёк");
    }

    const user = await this.prisma.user.findUnique({
      where: { id: challenge.userId },
      include: {
        roles: {
          include: {
            role: true,
          },
        },
        clientProfile: true,
        psychologistProfile: true,
        twoFactorCredential: true,
      },
    });

    if (!user) {
      await this.twoFactorStateService.deleteLoginChallenge(dto.challengeToken);
      throw new NotFoundException("Пользователь не найден");
    }

    if (!user.emailVerifiedAt || user.status !== UserStatus.active || !this.isTwoFactorProtected(user)) {
      await this.twoFactorStateService.deleteLoginChallenge(dto.challengeToken);
      throw new UnauthorizedException("2FA challenge больше не актуален");
    }

    const credential = user.twoFactorCredential;

    if (!credential) {
      await this.twoFactorStateService.deleteLoginChallenge(dto.challengeToken);
      throw new UnauthorizedException("2FA credential не найден");
    }

    const usedRecoveryCode = Boolean(dto.recoveryCode && !dto.code);
    let verified = false;

    if (dto.code) {
      verified = this.twoFactorService.verifyTotp(
        this.twoFactorService.decryptSecret(credential.totpSecretEncrypted),
        dto.code,
      );
    } else if (dto.recoveryCode) {
      const remainingRecoveryCodes = this.consumeRecoveryCode(
        credential.recoveryCodesJson,
        dto.recoveryCode,
      );

      if (remainingRecoveryCodes) {
        await this.prisma.userTwoFactorCredential.update({
          where: { userId: user.id },
          data: {
            recoveryCodesJson: remainingRecoveryCodes,
          },
        });
        verified = true;
      }
    }

    if (!verified) {
      throw new UnauthorizedException("Неверный код подтверждения");
    }

    await this.twoFactorStateService.deleteLoginChallenge(dto.challengeToken);

    const identity = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
      },
      include: {
        roles: {
          include: {
            role: true,
          },
        },
        clientProfile: true,
        psychologistProfile: true,
        twoFactorCredential: {
          select: {
            enabledAt: true,
          },
        },
      },
    });

    await this.auditService.log({
      actorUserId: identity.id,
      actorRole: this.roleCodes(identity)[0] ?? null,
      action: "auth.login_2fa_verified",
      entityType: "user",
      entityId: identity.id,
      requestId: (request as any).requestId ?? null,
      ip: request.ip,
      userAgent: request.headers["user-agent"] ?? null,
      metadataJson: {
        usedRecoveryCode,
      },
    });

    await this.auditService.log({
      actorUserId: identity.id,
      actorRole: this.roleCodes(identity)[0] ?? null,
      action: "auth.login",
      entityType: "user",
      entityId: identity.id,
      requestId: (request as any).requestId ?? null,
      ip: request.ip,
      userAgent: request.headers["user-agent"] ?? null,
      metadataJson: {
        viaTwoFactorChallenge: true,
      },
    });

    return this.issueAuthSession(identity, request, response);
  }

  async verifyEmail(dto: VerifyEmailDto, request: Request, response: Response) {
    const verificationToken = await this.prisma.emailVerificationToken.findUnique({
      where: {
        tokenHash: this.hashEmailVerificationToken(dto.token),
      },
      include: {
        user: {
          include: {
            roles: {
              include: {
                role: true,
              },
            },
            clientProfile: true,
            psychologistProfile: true,
            twoFactorCredential: {
              select: {
                enabledAt: true,
              },
            },
          },
        },
      },
    });

    if (
      !verificationToken ||
      verificationToken.usedAt ||
      verificationToken.revokedAt ||
      verificationToken.expiresAt < new Date()
    ) {
      throw new UnauthorizedException("Ссылка подтверждения недействительна или истекла");
    }

    if (
      verificationToken.user.status === UserStatus.blocked ||
      verificationToken.user.status === UserStatus.deleted
    ) {
      throw new ForbiddenException("Пользователь не может быть подтверждён");
    }

    const verifiedUser = await this.prisma.$transaction(async (tx) => {
      const now = new Date();

      await tx.emailVerificationToken.update({
        where: { id: verificationToken.id },
        data: {
          usedAt: now,
        },
      });

      await tx.emailVerificationToken.updateMany({
        where: {
          userId: verificationToken.userId,
          id: {
            not: verificationToken.id,
          },
          usedAt: null,
          revokedAt: null,
        },
        data: {
          revokedAt: now,
        },
      });

      return tx.user.update({
        where: {
          id: verificationToken.userId,
        },
        data: {
          emailVerifiedAt: verificationToken.user.emailVerifiedAt ?? now,
          status:
            verificationToken.user.status === UserStatus.pending
              ? UserStatus.active
              : verificationToken.user.status,
        },
        include: {
          roles: {
            include: {
              role: true,
            },
          },
          clientProfile: true,
          psychologistProfile: true,
          twoFactorCredential: {
            select: {
              enabledAt: true,
            },
          },
        },
      });
    });

    await this.auditService.log({
      actorUserId: verifiedUser.id,
      actorRole: this.roleCodes(verifiedUser)[0] ?? null,
      action: "auth.verify_email",
      entityType: "user",
      entityId: verifiedUser.id,
      requestId: (request as any).requestId ?? null,
      ip: request.ip,
      userAgent: request.headers["user-agent"] ?? null,
    });

    return this.issueAuthSession(verifiedUser, request, response);
  }

  async resendEmailVerification(dto: ResendEmailVerificationDto, request: Request) {
    const user = await this.prisma.user.findUnique({
      where: {
        email: dto.email.toLowerCase(),
      },
      select: {
        id: true,
        email: true,
        status: true,
        emailVerifiedAt: true,
      },
    });

    let debugVerificationLink: string | null = null;

    if (user && !user.emailVerifiedAt && user.status !== UserStatus.deleted && user.status !== UserStatus.blocked) {
      const verification = await this.issueEmailVerification(user.id, user.email);
      debugVerificationLink = verification.debugVerificationLink;
    }

    await this.auditService.log({
      actorUserId: user?.id ?? null,
      actorRole: null,
      action: "auth.resend_verification",
      entityType: "user",
      entityId: user?.id ?? dto.email.toLowerCase(),
      requestId: (request as any).requestId ?? null,
      ip: request.ip,
      userAgent: request.headers["user-agent"] ?? null,
      metadataJson: {
        email: dto.email.toLowerCase(),
        accountFound: Boolean(user),
      },
    });

    return {
      success: true,
      message: "Если аккаунт существует и email ещё не подтверждён, мы отправили новое письмо.",
      ...(debugVerificationLink ? { debugVerificationLink } : {}),
    };
  }

  async refresh(request: Request, response: Response) {
    const refreshToken = request.cookies?.[this.refreshCookieName];

    if (!refreshToken) {
      throw new UnauthorizedException("Отсутствует refresh token");
    }

    const payload = await this.verifyRefreshToken(refreshToken);
    const session = await this.prisma.refreshToken.findUnique({
      where: { id: payload.sessionId },
      include: {
        user: {
          include: {
            roles: {
              include: { role: true },
            },
            clientProfile: true,
            psychologistProfile: true,
            twoFactorCredential: {
              select: {
                enabledAt: true,
              },
            },
          },
        },
      },
    });

    if (!session || session.userId !== payload.sub || session.revokedAt || session.expiresAt < new Date()) {
      throw new UnauthorizedException("Сессия обновления недействительна");
    }

    const matches = await bcrypt.compare(refreshToken, session.refreshTokenHash);

    if (!matches) {
      throw new UnauthorizedException("Сессия обновления недействительна");
    }

    await this.prisma.refreshToken.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });
    await this.sessionRevocationService.revokeMany([
      {
        sessionId: session.id,
        userId: session.user.id,
        expiresAt: session.expiresAt,
      },
    ]);

    await this.auditService.log({
      actorUserId: session.user.id,
      actorRole: this.roleCodes(session.user)[0] ?? null,
      action: "auth.refresh",
      entityType: "refresh_token",
      entityId: session.id,
      requestId: (request as any).requestId ?? null,
      ip: request.ip,
      userAgent: request.headers["user-agent"] ?? null,
    });

    return this.issueAuthSession(session.user as AuthIdentity, request, response, session.id);
  }

  async getTwoFactorStatus(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        is2faEnabled: true,
        twoFactorCredential: {
          select: {
            enabledAt: true,
            recoveryCodesJson: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException("Пользователь не найден");
    }

    const pendingSetup = await this.twoFactorStateService.getPendingSetup(userId);

    return {
      enabled: this.isTwoFactorProtected(user),
      enabledAt: user.twoFactorCredential?.enabledAt?.toISOString() ?? null,
      recoveryCodesRemaining: this.countRecoveryCodes(user.twoFactorCredential?.recoveryCodesJson ?? null),
      pendingSetup: Boolean(pendingSetup),
      pendingSetupExpiresAt: pendingSetup?.expiresAt ?? null,
    };
  }

  async startTwoFactorSetup(userId: string, roles: string[], request: Request) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        status: true,
        is2faEnabled: true,
        twoFactorCredential: {
          select: {
            enabledAt: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException("Пользователь не найден");
    }

    if (this.isTwoFactorProtected(user)) {
      throw new BadRequestException("2FA уже включена");
    }

    if (user.status !== UserStatus.active) {
      throw new ForbiddenException("2FA можно включить только для активного аккаунта");
    }

    const secret = this.twoFactorService.generateSecret();
    const pendingSetup = await this.twoFactorStateService.storePendingSetup(userId, secret);

    await this.auditService.log({
      actorUserId: userId,
      actorRole: roles[0] ?? null,
      action: "auth.2fa_setup_started",
      entityType: "user",
      entityId: userId,
      requestId: (request as any).requestId ?? null,
      ip: request.ip,
      userAgent: request.headers["user-agent"] ?? null,
    });

    return {
      manualEntryKey: secret,
      manualEntryKeyDisplay: this.twoFactorService.formatSecretForDisplay(secret),
      otpauthUri: this.twoFactorService.buildOtpAuthUri(user.email, secret),
      issuer: this.twoFactorService.issuer(),
      accountLabel: user.email,
      expiresAt: pendingSetup.expiresAt.toISOString(),
    };
  }

  async enableTwoFactor(
    userId: string,
    sessionId: string,
    roles: string[],
    dto: EnableTwoFactorDto,
    request: Request,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        passwordHash: true,
        status: true,
        is2faEnabled: true,
        twoFactorCredential: {
          select: {
            enabledAt: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException("Пользователь не найден");
    }

    if (this.isTwoFactorProtected(user)) {
      throw new BadRequestException("2FA уже включена");
    }

    if (!(await bcrypt.compare(dto.currentPassword, user.passwordHash))) {
      throw new UnauthorizedException("Неверный текущий пароль");
    }

    const pendingSetup = await this.twoFactorStateService.getPendingSetup(userId);

    if (!pendingSetup || new Date(pendingSetup.expiresAt) < new Date()) {
      await this.twoFactorStateService.clearPendingSetup(userId);
      throw new BadRequestException("Секрет 2FA истёк. Сгенерируйте его заново");
    }

    if (!this.twoFactorService.verifyTotp(pendingSetup.secret, dto.code)) {
      throw new BadRequestException("Неверный TOTP-код");
    }

    const recoveryCodes = this.twoFactorService.generateRecoveryCodes();
    const enabledAt = new Date();
    const encryptedSecret = this.twoFactorService.encryptSecret(pendingSetup.secret);
    const recoveryCodeHashes = recoveryCodes.map((code) => this.twoFactorService.hashRecoveryCode(code));

    await this.prisma.$transaction(async (tx) => {
      await tx.userTwoFactorCredential.upsert({
        where: { userId },
        update: {
          totpSecretEncrypted: encryptedSecret,
          recoveryCodesJson: recoveryCodeHashes,
          enabledAt,
        },
        create: {
          userId,
          totpSecretEncrypted: encryptedSecret,
          recoveryCodesJson: recoveryCodeHashes,
          enabledAt,
        },
      });

      await tx.user.update({
        where: { id: userId },
        data: {
          is2faEnabled: true,
        },
      });
    });

    await this.twoFactorStateService.clearPendingSetup(userId);
    const revokedSessions = await this.revokeOtherSessions(userId, sessionId);

    await this.auditService.log({
      actorUserId: userId,
      actorRole: roles[0] ?? null,
      action: "auth.2fa_enabled",
      entityType: "user",
      entityId: userId,
      requestId: (request as any).requestId ?? null,
      ip: request.ip,
      userAgent: request.headers["user-agent"] ?? null,
      metadataJson: {
        recoveryCodesCount: recoveryCodes.length,
        revokedSessions,
      },
    });

    return {
      success: true,
      enabledAt: enabledAt.toISOString(),
      recoveryCodes,
      recoveryCodesCount: recoveryCodes.length,
    };
  }

  async disableTwoFactor(
    userId: string,
    sessionId: string,
    roles: string[],
    dto: DisableTwoFactorDto,
    request: Request,
  ) {
    if (!dto.code && !dto.recoveryCode) {
      throw new BadRequestException("Введите TOTP-код или recovery code");
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        passwordHash: true,
        is2faEnabled: true,
        twoFactorCredential: true,
      },
    });

    if (!user) {
      throw new NotFoundException("Пользователь не найден");
    }

    if (!(await bcrypt.compare(dto.currentPassword, user.passwordHash))) {
      throw new UnauthorizedException("Неверный текущий пароль");
    }

    if (!this.isTwoFactorProtected(user) || !user.twoFactorCredential) {
      throw new BadRequestException("2FA уже отключена");
    }

    let verified = false;
    let usedRecoveryCode = false;

    if (dto.code) {
      verified = this.twoFactorService.verifyTotp(
        this.twoFactorService.decryptSecret(user.twoFactorCredential.totpSecretEncrypted),
        dto.code,
      );
    } else if (dto.recoveryCode) {
      verified = Boolean(this.consumeRecoveryCode(user.twoFactorCredential.recoveryCodesJson, dto.recoveryCode));
      usedRecoveryCode = verified;
    }

    if (!verified) {
      throw new UnauthorizedException("Неверный код подтверждения");
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.userTwoFactorCredential.delete({
        where: { userId },
      });

      await tx.user.update({
        where: { id: userId },
        data: {
          is2faEnabled: false,
        },
      });
    });

    await this.twoFactorStateService.clearPendingSetup(userId);
    const revokedSessions = await this.revokeOtherSessions(userId, sessionId);

    await this.auditService.log({
      actorUserId: userId,
      actorRole: roles[0] ?? null,
      action: "auth.2fa_disabled",
      entityType: "user",
      entityId: userId,
      requestId: (request as any).requestId ?? null,
      ip: request.ip,
      userAgent: request.headers["user-agent"] ?? null,
      metadataJson: {
        usedRecoveryCode,
        revokedSessions,
      },
    });

    return {
      success: true,
      revokedSessions,
    };
  }

  async logout(request: Request, response: Response) {
    const refreshToken = request.cookies?.[this.refreshCookieName];

    if (refreshToken) {
      const payload = await this.verifyRefreshToken(refreshToken).catch(() => null);

      if (payload) {
        const currentSession = await this.prisma.refreshToken.findUnique({
          where: { id: payload.sessionId },
          select: {
            id: true,
            userId: true,
            expiresAt: true,
            revokedAt: true,
          },
        });

        await this.prisma.refreshToken.updateMany({
          where: {
            id: payload.sessionId,
            userId: payload.sub,
            revokedAt: null,
          },
          data: {
            revokedAt: new Date(),
          },
        });

        if (currentSession && !currentSession.revokedAt) {
          await this.sessionRevocationService.revokeMany([
            {
              sessionId: currentSession.id,
              userId: currentSession.userId,
              expiresAt: currentSession.expiresAt,
            },
          ]);
        }
      }
    }

    this.clearRefreshCookie(response);
    return { success: true };
  }

  async logoutAll(userId: string, request: Request, role: string | null) {
    const activeSessions = await this.prisma.refreshToken.findMany({
      where: {
        userId,
        revokedAt: null,
      },
      select: {
        id: true,
        userId: true,
        expiresAt: true,
      },
    });

    await this.prisma.refreshToken.updateMany({
      where: {
        userId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
    await this.sessionRevocationService.revokeMany(
      activeSessions.map((session) => ({
        sessionId: session.id,
        userId: session.userId,
        expiresAt: session.expiresAt,
      })),
    );

    await this.auditService.log({
      actorUserId: userId,
      actorRole: role,
      action: "auth.logout_all",
      entityType: "user",
      entityId: userId,
      requestId: (request as any).requestId ?? null,
      ip: request.ip,
      userAgent: request.headers["user-agent"] ?? null,
    });

    return { success: true };
  }

  private async issueAuthSession(
    user: AuthIdentity,
    request: Request,
    response: Response,
    rotatedFromId?: string,
  ) {
    const sessionId = randomUUID();
    const roleCodes = this.roleCodes(user);
    const accessTtl = this.configService.get<number>("JWT_ACCESS_TTL", 900);
    const refreshTtlDays = this.configService.get<number>("JWT_REFRESH_TTL_DAYS", 14);

    const accessToken = await this.jwtService.signAsync(
      {
        sub: user.id,
        email: user.email,
        roles: roleCodes,
        sessionId,
      },
      {
        secret: this.configService.getOrThrow<string>("JWT_ACCESS_SECRET"),
        expiresIn: accessTtl,
      },
    );

    const refreshToken = await this.jwtService.signAsync(
      {
        sub: user.id,
        sessionId,
        tokenType: "refresh",
      },
      {
        secret: this.configService.getOrThrow<string>("JWT_REFRESH_SECRET"),
        expiresIn: `${refreshTtlDays}d`,
      },
    );

    await this.prisma.refreshToken.create({
      data: {
        id: sessionId,
        userId: user.id,
        refreshTokenHash: await bcrypt.hash(refreshToken, 10),
        deviceInfoHash: this.hash(`${request.headers["user-agent"] ?? "unknown"}|${request.ip}`),
        ipHash: this.hash(request.ip),
        userAgentHash: this.hash(request.headers["user-agent"] ?? "unknown"),
        expiresAt: new Date(Date.now() + refreshTtlDays * 24 * 60 * 60 * 1000),
        rotatedFromId: rotatedFromId ?? null,
      },
    });

    this.setRefreshCookie(response, refreshToken, refreshTtlDays);

    return {
      accessToken,
      user: this.serializeUser(user),
    };
  }

  private async issueEmailVerification(userId: string, email: string) {
    const now = new Date();
    await this.prisma.emailVerificationToken.updateMany({
      where: {
        userId,
        usedAt: null,
        revokedAt: null,
        expiresAt: {
          gt: now,
        },
      },
      data: {
        revokedAt: now,
      },
    });

    const rawToken = this.generateEmailVerificationToken();
    const expiresAt = new Date(Date.now() + this.getEmailVerificationTtlMs());
    const tokenHash = this.hashEmailVerificationToken(rawToken);
    const created = await this.prisma.emailVerificationToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
      },
      select: {
        id: true,
      },
    });
    const verificationLink = this.buildEmailVerificationLink(rawToken);

    await this.notificationsService.createQueuedNotifications([
      {
        userId,
        channel: NotificationChannel.email,
        type: "auth.email_verification",
        title: "Подтвердите email",
        body: [
          "Для завершения регистрации подтвердите email по ссылке:",
          verificationLink,
          "",
          `Ссылка действует до ${expiresAt.toISOString()}.`,
        ].join("\n"),
        dedupKey: `auth.email_verification:${created.id}`,
        payloadJson: {
          verificationLink,
          expiresAt: expiresAt.toISOString(),
          recipientEmail: email,
        },
      },
    ]);

    return {
      expiresAt,
      debugVerificationLink: this.isEmailVerificationDebugEnabled() ? verificationLink : null,
    };
  }

  private async verifyRefreshToken(token: string) {
    const payload = await this.jwtService.verifyAsync<RefreshTokenPayload>(token, {
      secret: this.configService.getOrThrow<string>("JWT_REFRESH_SECRET"),
    });

    if (payload.tokenType !== "refresh") {
      throw new UnauthorizedException("Недействительный refresh token");
    }

    return payload;
  }

  private setRefreshCookie(response: Response, token: string, refreshTtlDays: number) {
    response.cookie(this.refreshCookieName, token, {
      httpOnly: true,
      secure: this.configService.get<string>("NODE_ENV", "development") === "production",
      sameSite: "strict",
      maxAge: refreshTtlDays * 24 * 60 * 60 * 1000,
      path: "/api/v1/auth",
      ...(this.cookieDomainOption() ? { domain: this.cookieDomainOption() } : {}),
    });
  }

  private clearRefreshCookie(response: Response) {
    response.clearCookie(this.refreshCookieName, {
      httpOnly: true,
      secure: this.configService.get<string>("NODE_ENV", "development") === "production",
      sameSite: "strict",
      path: "/api/v1/auth",
      ...(this.cookieDomainOption() ? { domain: this.cookieDomainOption() } : {}),
    });
  }

  private roleCodes(user: AuthIdentity) {
    return user.roles.map((item) => item.role.code);
  }

  private serializeUser(user: AuthIdentity) {
    return {
      id: user.id,
      email: user.email,
      status: user.status,
      emailVerifiedAt: user.emailVerifiedAt,
      roles: this.roleCodes(user),
      twoFactorEnabled: this.isTwoFactorProtected(user),
      clientProfile: user.clientProfile,
      psychologistProfile: user.psychologistProfile,
    };
  }

  private hash(value: string | null | undefined) {
    return value ? createHash("sha256").update(value).digest("hex") : null;
  }

  private cookieDomainOption() {
    const domain = this.configService.get<string>("COOKIE_DOMAIN", "");
    return domain && domain !== "localhost" ? domain : undefined;
  }

  private generateEmailVerificationToken() {
    return randomBytes(32).toString("base64url");
  }

  private hashEmailVerificationToken(token: string) {
    return createHash("sha256").update(token).digest("hex");
  }

  private getEmailVerificationTtlMs() {
    const ttlHours = this.configService.get<number>("EMAIL_VERIFICATION_TTL_HOURS", 24);
    return ttlHours * 60 * 60 * 1000;
  }

  private buildEmailVerificationLink(token: string) {
    const webOrigin = this.configService.get<string>("WEB_APP_ORIGIN", "http://localhost:3000");
    const url = new URL("/auth/verify-email", webOrigin);
    url.searchParams.set("token", token);
    return url.toString();
  }

  private isEmailVerificationDebugEnabled() {
    return this.configService.get<string>("AUTH_DEBUG_EMAIL_VERIFICATION_LINKS", "false") === "true";
  }

  private isTwoFactorProtected(user: {
    is2faEnabled?: boolean;
    twoFactorCredential?: { enabledAt?: Date | null } | null;
  }) {
    return Boolean(user.is2faEnabled && user.twoFactorCredential?.enabledAt);
  }

  private consumeRecoveryCode(recoveryCodesJson: Prisma.JsonValue, recoveryCode: string) {
    const recoveryCodes = Array.isArray(recoveryCodesJson)
      ? recoveryCodesJson.filter((item): item is string => typeof item === "string")
      : [];
    const recoveryHash = this.twoFactorService.hashRecoveryCode(recoveryCode);
    const matchedIndex = recoveryCodes.findIndex((candidate) => candidate === recoveryHash);

    if (matchedIndex === -1) {
      return null;
    }

    return recoveryCodes.filter((_, index) => index !== matchedIndex);
  }

  private countRecoveryCodes(recoveryCodesJson: Prisma.JsonValue | null) {
    return Array.isArray(recoveryCodesJson)
      ? recoveryCodesJson.filter((item): item is string => typeof item === "string").length
      : 0;
  }

  private async revokeOtherSessions(userId: string, currentSessionId?: string) {
    const activeSessions = await this.prisma.refreshToken.findMany({
      where: {
        userId,
        revokedAt: null,
        ...(currentSessionId
          ? {
              id: {
                not: currentSessionId,
              },
            }
          : {}),
      },
      select: {
        id: true,
        userId: true,
        expiresAt: true,
      },
    });

    if (activeSessions.length === 0) {
      return 0;
    }

    await this.prisma.refreshToken.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(currentSessionId
          ? {
              id: {
                not: currentSessionId,
              },
            }
          : {}),
      },
      data: {
        revokedAt: new Date(),
      },
    });

    await this.sessionRevocationService.revokeMany(
      activeSessions.map((session) => ({
        sessionId: session.id,
        userId: session.userId,
        expiresAt: session.expiresAt,
      })),
    );

    return activeSessions.length;
  }
}
