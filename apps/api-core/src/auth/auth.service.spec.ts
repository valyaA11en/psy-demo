import { Test, TestingModule } from "@nestjs/testing";
import {
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { UserStatus } from "prisma-client-generated";
import { AuditService } from "../audit/audit.service";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { AuthService } from "./auth.service";
import { SessionRevocationService } from "./session-revocation.service";
import { TwoFactorService } from "./two-factor.service";
import { TwoFactorStateService } from "./two-factor-state.service";

const makeUser = (overrides: Partial<any> = {}) => ({
  id: "user-1",
  email: "test@example.com",
  passwordHash: "$2a$10$hashed",
  status: UserStatus.active,
  emailVerifiedAt: new Date(),
  lastLoginAt: null,
  is2faEnabled: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  roles: [{ role: { id: "role-1", code: "client" } }],
  clientProfile: { userId: "user-1", displayName: "Test User", timezone: "UTC" },
  psychologistProfile: null,
  twoFactorCredential: null,
  ...overrides,
});

const makeRequest = (overrides: Partial<any> = {}) =>
  ({
    ip: "127.0.0.1",
    cookies: {},
    headers: { "user-agent": "jest-test" },
    requestId: "req-1",
    ...overrides,
  }) as any;

const makeResponse = () => ({
  cookie: jest.fn(),
  clearCookie: jest.fn(),
});

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  role: {
    findUnique: jest.fn(),
  },
  refreshToken: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  userTwoFactorCredential: {
    update: jest.fn(),
    upsert: jest.fn(),
    delete: jest.fn(),
  },
  emailVerificationToken: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  $transaction: jest.fn(),
};

const mockJwt = {
  signAsync: jest.fn().mockResolvedValue("signed-token"),
  verifyAsync: jest.fn(),
};

const mockConfig = {
  get: jest.fn((_: string, def?: any) => def),
  getOrThrow: jest.fn((key: string) => `secret-${key}`),
};

const mockAudit = {
  log: jest.fn().mockResolvedValue(undefined),
};

const mockNotifications = {
  createQueuedNotifications: jest.fn().mockResolvedValue(["notification-1"]),
};

const mockSessionRevocation = {
  revokeMany: jest.fn().mockResolvedValue(true),
};

const mockTwoFactor = {
  generateSecret: jest.fn().mockReturnValue("ABCDEFGHIJKLMNOPQRSTUV"),
  formatSecretForDisplay: jest.fn().mockReturnValue("ABCD EFGH IJKL MNOP QRST UV"),
  buildOtpAuthUri: jest.fn().mockReturnValue("otpauth://totp/Consultations:test@example.com"),
  issuer: jest.fn().mockReturnValue("Consultations"),
  verifyTotp: jest.fn().mockReturnValue(true),
  decryptSecret: jest.fn().mockReturnValue("ABCDEFGHIJKLMNOPQRSTUV"),
  generateRecoveryCodes: jest.fn().mockReturnValue(["ABCD-EFGH", "JKLM-NPQR"]),
  hashRecoveryCode: jest.fn((code: string) => `hash:${code}`),
  encryptSecret: jest.fn().mockReturnValue("encrypted-secret"),
};

const mockTwoFactorState = {
  createLoginChallenge: jest.fn().mockResolvedValue({
    token: "challenge-token",
    expiresAt: new Date(Date.now() + 600_000),
  }),
  getLoginChallenge: jest.fn(),
  deleteLoginChallenge: jest.fn().mockResolvedValue(undefined),
  storePendingSetup: jest.fn().mockResolvedValue({
    expiresAt: new Date(Date.now() + 600_000),
  }),
  getPendingSetup: jest.fn(),
  clearPendingSetup: jest.fn().mockResolvedValue(undefined),
};

describe("AuthService", () => {
  let service: AuthService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwt },
        { provide: ConfigService, useValue: mockConfig },
        { provide: AuditService, useValue: mockAudit },
        { provide: NotificationsService, useValue: mockNotifications },
        { provide: SessionRevocationService, useValue: mockSessionRevocation },
        { provide: TwoFactorService, useValue: mockTwoFactor },
        { provide: TwoFactorStateService, useValue: mockTwoFactorState },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe("register", () => {
    const dto: any = {
      email: "new@example.com",
      password: "Password123",
      accountType: "client",
      displayName: "New User",
      acceptPrivacyPolicy: true,
      acceptPlatformTerms: true,
    };

    it("throws ConflictException when email already exists", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(makeUser());

      await expect(service.register(dto, makeRequest())).rejects.toThrow(ConflictException);
    });

    it("throws ForbiddenException when role not found", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.role.findUnique.mockResolvedValue(null);

      await expect(service.register(dto, makeRequest())).rejects.toThrow(ForbiddenException);
    });

    it("registers a client and returns verification payload", async () => {
      const user = makeUser({
        email: "new@example.com",
        status: UserStatus.pending,
        emailVerifiedAt: null,
      });

      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.role.findUnique.mockResolvedValue({ id: "role-client", code: "client" });
      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          user: {
            create: jest.fn().mockResolvedValue(user),
            findUniqueOrThrow: jest.fn().mockResolvedValue(user),
          },
          clientProfile: { create: jest.fn().mockResolvedValue({}) },
        };
        return fn(tx);
      });
      mockPrisma.emailVerificationToken.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.emailVerificationToken.create.mockResolvedValue({ id: "verify-1" });

      const result = await service.register(dto, makeRequest());

      expect(result).toMatchObject({
        success: true,
        requiresEmailVerification: true,
        email: "new@example.com",
      });
      expect(mockNotifications.createQueuedNotifications).toHaveBeenCalledTimes(1);
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: "auth.register" }),
      );
    });

    it("registers a psychologist and keeps account pending", async () => {
      const psy = makeUser({
        email: "psy@example.com",
        status: UserStatus.pending,
        emailVerifiedAt: null,
        roles: [{ role: { id: "role-psy", code: "psychologist" } }],
        clientProfile: null,
        psychologistProfile: { publicSlug: "psychologist-abcd1234" },
      });
      const psyDto: any = {
        email: "psy@example.com",
        password: "Password123",
        accountType: "psychologist",
        firstName: "Jane",
        lastName: "Doe",
        publicTitle: "PhD",
        acceptPrivacyPolicy: true,
        acceptPlatformTerms: true,
      };

      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.role.findUnique.mockResolvedValue({ id: "role-psy", code: "psychologist" });
      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          user: {
            create: jest.fn().mockResolvedValue(psy),
            findUniqueOrThrow: jest.fn().mockResolvedValue(psy),
          },
          psychologistProfile: { create: jest.fn().mockResolvedValue({}) },
        };
        return fn(tx);
      });
      mockPrisma.emailVerificationToken.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.emailVerificationToken.create.mockResolvedValue({ id: "verify-psy" });

      const result = await service.register(psyDto, makeRequest());

      expect(result).toHaveProperty("requiresEmailVerification", true);
      expect(mockNotifications.createQueuedNotifications).toHaveBeenCalledTimes(1);
    });
  });

  describe("login", () => {
    const dto = { email: "test@example.com", password: "password" };

    it("throws UnauthorizedException when user not found", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.login(dto, makeRequest(), makeResponse() as any)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it("throws UnauthorizedException when password is wrong", async () => {
      const user = makeUser({ passwordHash: "$2a$10$invalid_hash_for_testing" });
      mockPrisma.user.findUnique.mockResolvedValue(user);

      await expect(service.login(dto, makeRequest(), makeResponse() as any)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it("throws ForbiddenException when email is not verified", async () => {
      const bcrypt = await import("bcryptjs");
      const hash = await bcrypt.hash("password", 1);
      const user = makeUser({
        passwordHash: hash,
        status: UserStatus.pending,
        emailVerifiedAt: null,
      });
      mockPrisma.user.findUnique.mockResolvedValue(user);

      await expect(service.login(dto, makeRequest(), makeResponse() as any)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it("throws ForbiddenException when user is blocked", async () => {
      const bcrypt = await import("bcryptjs");
      const hash = await bcrypt.hash("password", 1);
      const user = makeUser({ passwordHash: hash, status: UserStatus.blocked });
      mockPrisma.user.findUnique.mockResolvedValue(user);

      await expect(service.login(dto, makeRequest(), makeResponse() as any)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it("returns accessToken + user on success", async () => {
      const bcrypt = await import("bcryptjs");
      const hash = await bcrypt.hash("password", 1);
      const user = makeUser({ passwordHash: hash });

      mockPrisma.user.findUnique.mockResolvedValue(user);
      mockPrisma.user.update.mockResolvedValue(user);
      mockPrisma.refreshToken.create.mockResolvedValue({});

      const result = await service.login(dto, makeRequest(), makeResponse() as any);

      expect(result).toHaveProperty("accessToken", "signed-token");
      if (!("accessToken" in result)) {
        throw new Error("Expected auth session payload");
      }
      expect(result.user).toHaveProperty("email", "test@example.com");
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: "auth.login" }),
      );
    });

    it("returns two-factor challenge when 2fa is enabled", async () => {
      const bcrypt = await import("bcryptjs");
      const hash = await bcrypt.hash("password", 1);
      const user = makeUser({
        passwordHash: hash,
        is2faEnabled: true,
        twoFactorCredential: {
          enabledAt: new Date(),
        },
      });

      mockPrisma.user.findUnique.mockResolvedValue(user);

      const result = await service.login(dto, makeRequest(), makeResponse() as any);

      expect(result).toMatchObject({
        requiresTwoFactor: true,
        challengeToken: "challenge-token",
      });
      expect(mockTwoFactorState.createLoginChallenge).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "user-1",
        }),
      );
      expect(mockPrisma.refreshToken.create).not.toHaveBeenCalled();
    });
  });

  describe("verifyTwoFactorLogin", () => {
    it("verifies challenge and returns a session", async () => {
      mockTwoFactorState.getLoginChallenge.mockResolvedValue({
        userId: "user-1",
        expiresAt: new Date(Date.now() + 600_000).toISOString(),
      });
      mockPrisma.user.findUnique.mockResolvedValue(
        makeUser({
          is2faEnabled: true,
          twoFactorCredential: {
            userId: "user-1",
            totpSecretEncrypted: "encrypted-secret",
            recoveryCodesJson: ["hash:ABCD-EFGH"],
            enabledAt: new Date(),
          },
        }),
      );
      mockPrisma.user.update.mockResolvedValue(
        makeUser({
          is2faEnabled: true,
          twoFactorCredential: {
            enabledAt: new Date(),
          },
        }),
      );
      mockPrisma.refreshToken.create.mockResolvedValue({});

      const result = await service.verifyTwoFactorLogin(
        {
          challengeToken: "challenge-token",
          code: "123456",
        } as any,
        makeRequest(),
        makeResponse() as any,
      );

      expect(result).toHaveProperty("accessToken");
      expect(mockTwoFactor.verifyTotp).toHaveBeenCalled();
      expect(mockTwoFactorState.deleteLoginChallenge).toHaveBeenCalledWith("challenge-token");
    });
  });

  describe("verifyEmail", () => {
    it("marks token as used, activates user and returns session", async () => {
      const verificationUser = makeUser({
        status: UserStatus.pending,
        emailVerifiedAt: null,
      });

      mockPrisma.emailVerificationToken.findUnique.mockResolvedValue({
        id: "verify-1",
        userId: "user-1",
        tokenHash: "hash",
        expiresAt: new Date(Date.now() + 9_999_999),
        usedAt: null,
        revokedAt: null,
        user: verificationUser,
      });
      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          emailVerificationToken: {
            update: jest.fn().mockResolvedValue({}),
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          },
          user: {
            update: jest.fn().mockResolvedValue(
              makeUser({
                status: UserStatus.active,
                emailVerifiedAt: new Date(),
              }),
            ),
          },
        };
        return fn(tx);
      });
      mockPrisma.refreshToken.create.mockResolvedValue({});

      const result = await service.verifyEmail(
        { token: "raw-token-value-that-is-long-enough" } as any,
        makeRequest(),
        makeResponse() as any,
      );

      expect(result).toHaveProperty("accessToken");
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: "auth.verify_email" }),
      );
    });
  });

  describe("resendEmailVerification", () => {
    it("returns generic success payload", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await service.resendEmailVerification(
        { email: "missing@example.com" } as any,
        makeRequest(),
      );

      expect(result).toMatchObject({
        success: true,
      });
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: "auth.resend_verification" }),
      );
    });
  });

  describe("refresh", () => {
    it("throws UnauthorizedException when no refresh cookie", async () => {
      const req = makeRequest({ cookies: {} });
      await expect(service.refresh(req, makeResponse() as any)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it("throws UnauthorizedException when session not found", async () => {
      mockJwt.verifyAsync.mockResolvedValue({
        sub: "user-1",
        sessionId: "sess-1",
        tokenType: "refresh",
      });
      mockPrisma.refreshToken.findUnique.mockResolvedValue(null);

      const req = makeRequest({ cookies: { refresh_token: "token" } });
      await expect(service.refresh(req, makeResponse() as any)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it("throws UnauthorizedException when session is revoked", async () => {
      mockJwt.verifyAsync.mockResolvedValue({
        sub: "user-1",
        sessionId: "sess-1",
        tokenType: "refresh",
      });
      mockPrisma.refreshToken.findUnique.mockResolvedValue({
        id: "sess-1",
        userId: "user-1",
        refreshTokenHash: "$hash",
        revokedAt: new Date(),
        expiresAt: new Date(Date.now() + 999999),
        user: makeUser(),
      });

      const req = makeRequest({ cookies: { refresh_token: "token" } });
      await expect(service.refresh(req, makeResponse() as any)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it("returns new tokens on valid refresh", async () => {
      const bcrypt = await import("bcryptjs");
      const rawToken = "my-refresh-token";
      const hash = await bcrypt.hash(rawToken, 1);

      mockJwt.verifyAsync.mockResolvedValue({
        sub: "user-1",
        sessionId: "sess-1",
        tokenType: "refresh",
      });
      mockPrisma.refreshToken.findUnique.mockResolvedValue({
        id: "sess-1",
        userId: "user-1",
        refreshTokenHash: hash,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 9_999_999),
        user: makeUser(),
      });
      mockPrisma.refreshToken.update.mockResolvedValue({});
      mockPrisma.refreshToken.create.mockResolvedValue({});

      const req = makeRequest({ cookies: { refresh_token: rawToken } });
      const result = await service.refresh(req, makeResponse() as any);

      expect(result).toHaveProperty("accessToken");
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: "auth.refresh" }),
      );
      expect(mockSessionRevocation.revokeMany).toHaveBeenCalled();
    });
  });

  describe("logout", () => {
    it("returns success even without cookie", async () => {
      const req = makeRequest({ cookies: {} });
      const res = makeResponse();
      const result = await service.logout(req, res as any);
      expect(result).toEqual({ success: true });
      expect(res.clearCookie).toHaveBeenCalled();
    });

    it("revokes session when valid cookie present", async () => {
      mockJwt.verifyAsync.mockResolvedValue({
        sub: "user-1",
        sessionId: "sess-1",
        tokenType: "refresh",
      });
      mockPrisma.refreshToken.findUnique.mockResolvedValue({
        id: "sess-1",
        userId: "user-1",
        expiresAt: new Date(Date.now() + 999999),
        revokedAt: null,
      });
      mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });

      const req = makeRequest({ cookies: { refresh_token: "valid-token" } });
      const res = makeResponse();
      const result = await service.logout(req, res as any);

      expect(result).toEqual({ success: true });
      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ revokedAt: null }),
        }),
      );
      expect(mockSessionRevocation.revokeMany).toHaveBeenCalled();
    });
  });

  describe("logoutAll", () => {
    it("revokes all sessions for user", async () => {
      mockPrisma.refreshToken.findMany.mockResolvedValue([
        {
          id: "sess-1",
          userId: "user-1",
          expiresAt: new Date(Date.now() + 9_999_999),
        },
        {
          id: "sess-2",
          userId: "user-1",
          expiresAt: new Date(Date.now() + 19_999_999),
        },
      ]);
      mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 3 });
      const req = makeRequest();

      const result = await service.logoutAll("user-1", req, "client");

      expect(result).toEqual({ success: true });
      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: "user-1", revokedAt: null },
        }),
      );
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: "auth.logout_all" }),
      );
      expect(mockSessionRevocation.revokeMany).toHaveBeenCalledWith([
        expect.objectContaining({ sessionId: "sess-1", userId: "user-1" }),
        expect.objectContaining({ sessionId: "sess-2", userId: "user-1" }),
      ]);
    });
  });
});
