import { randomUUID } from "node:crypto";
import { Injectable, UnauthorizedException, ConflictException, ForbiddenException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { ClientProfile, PsychologistApprovalStatus, Prisma, UserStatus } from "@prisma/client";
import bcrypt from "bcryptjs";
import type { Request, Response } from "express";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";
import { RefreshTokenPayload } from "./interfaces/refresh-token-payload.interface";

type AuthIdentity = Prisma.UserGetPayload<{
  include: {
    roles: { include: { role: true } };
    clientProfile: true;
    psychologistProfile: true;
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
  ) {}

  async register(dto: RegisterDto, request: Request, response: Response) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (existing) {
      throw new ConflictException("User already exists");
    }

    const role = await this.prisma.role.findUnique({
      where: {
        code: dto.accountType,
      },
    });

    if (!role) {
      throw new ForbiddenException("Registration role is unavailable");
    }

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: dto.email.toLowerCase(),
          passwordHash: await bcrypt.hash(dto.password, 10),
          status: UserStatus.active,
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
            firstName: dto.firstName ?? "New",
            lastName: dto.lastName ?? "Psychologist",
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

    return this.issueAuthSession(user, request, response);
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
      },
    });

    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException("Invalid credentials");
    }

    if (user.status !== UserStatus.active) {
      throw new ForbiddenException("User is not active");
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

  async refresh(request: Request, response: Response) {
    const refreshToken = request.cookies?.[this.refreshCookieName];

    if (!refreshToken) {
      throw new UnauthorizedException("Refresh token is missing");
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
          },
        },
      },
    });

    if (!session || session.userId !== payload.sub || session.revokedAt || session.expiresAt < new Date()) {
      throw new UnauthorizedException("Refresh session is invalid");
    }

    const matches = await bcrypt.compare(refreshToken, session.refreshTokenHash);

    if (!matches) {
      throw new UnauthorizedException("Refresh session is invalid");
    }

    await this.prisma.refreshToken.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });

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

  async logout(request: Request, response: Response) {
    const refreshToken = request.cookies?.[this.refreshCookieName];

    if (refreshToken) {
      const payload = await this.verifyRefreshToken(refreshToken).catch(() => null);

      if (payload) {
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
      }
    }

    this.clearRefreshCookie(response);
    return { success: true };
  }

  async logoutAll(userId: string, request: Request, role: string | null) {
    await this.prisma.refreshToken.updateMany({
      where: {
        userId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

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

  private async verifyRefreshToken(token: string) {
    const payload = await this.jwtService.verifyAsync<RefreshTokenPayload>(token, {
      secret: this.configService.getOrThrow<string>("JWT_REFRESH_SECRET"),
    });

    if (payload.tokenType !== "refresh") {
      throw new UnauthorizedException("Invalid refresh token");
    }

    return payload;
  }

  private setRefreshCookie(response: Response, token: string, refreshTtlDays: number) {
    response.cookie(this.refreshCookieName, token, {
      httpOnly: true,
      secure: this.configService.get<string>("NODE_ENV", "development") === "production",
      sameSite: "lax",
      maxAge: refreshTtlDays * 24 * 60 * 60 * 1000,
      path: "/api/v1/auth",
      ...(this.cookieDomainOption() ? { domain: this.cookieDomainOption() } : {}),
    });
  }

  private clearRefreshCookie(response: Response) {
    response.clearCookie(this.refreshCookieName, {
      httpOnly: true,
      secure: this.configService.get<string>("NODE_ENV", "development") === "production",
      sameSite: "lax",
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
      clientProfile: user.clientProfile,
      psychologistProfile: user.psychologistProfile,
    };
  }

  private hash(value: string | null | undefined) {
    return value ? require("node:crypto").createHash("sha256").update(value).digest("hex") : null;
  }

  private cookieDomainOption() {
    const domain = this.configService.get<string>("COOKIE_DOMAIN", "");
    return domain && domain !== "localhost" ? domain : undefined;
  }
}
