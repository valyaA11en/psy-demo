import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserStatus } from '@prisma/client';
import { AuthService } from './auth.service';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';

// ---------------------------------------------------------------------------
// Helper factories
// ---------------------------------------------------------------------------

const makeUser = (overrides: Partial<any> = {}) => ({
  id: 'user-1',
  email: 'test@example.com',
  passwordHash: '$2a$10$hashed',
  status: UserStatus.active,
  emailVerifiedAt: null,
  lastLoginAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  roles: [{ role: { id: 'role-1', code: 'client' } }],
  clientProfile: { userId: 'user-1', displayName: 'Test User', timezone: 'UTC' },
  psychologistProfile: null,
  ...overrides,
});

const makeRequest = (overrides: Partial<any> = {}) => ({
  ip: '127.0.0.1',
  cookies: {},
  headers: { 'user-agent': 'jest-test' },
  requestId: 'req-1',
  ...overrides,
});

const makeResponse = () => ({
  cookie: jest.fn(),
  clearCookie: jest.fn(),
});

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

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
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  $transaction: jest.fn(),
};

const mockJwt = {
  signAsync: jest.fn().mockResolvedValue('signed-token'),
  verifyAsync: jest.fn(),
};

const mockConfig = {
  get: jest.fn((key: string, def?: any) => def),
  getOrThrow: jest.fn((key: string) => `secret-${key}`),
};

const mockAudit = {
  log: jest.fn().mockResolvedValue(undefined),
};

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('AuthService', () => {
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
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  // -------------------------------------------------------------------------
  // register
  // -------------------------------------------------------------------------

  describe('register', () => {
    const dto: any = {
      email: 'new@example.com',
      password: 'password123',
      accountType: 'client',
      displayName: 'New User',
      acceptPrivacyPolicy: true,
      acceptPlatformTerms: true,
    };

    it('throws ConflictException when email already exists', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(makeUser());

      await expect(
        service.register(dto, makeRequest() as any, makeResponse() as any),
      ).rejects.toThrow(ConflictException);
    });

    it('throws ForbiddenException when role not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.role.findUnique.mockResolvedValue(null);

      await expect(
        service.register(dto, makeRequest() as any, makeResponse() as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('registers a client and returns accessToken + user', async () => {
      const user = makeUser({ email: 'new@example.com' });

      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.role.findUnique.mockResolvedValue({ id: 'role-client', code: 'client' });

      // Simulate $transaction: call fn and return result
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

      mockPrisma.refreshToken.create.mockResolvedValue({});
      mockConfig.get.mockReturnValue(900);
      mockConfig.getOrThrow.mockReturnValue('secret');

      const res = makeResponse();
      const result = await service.register(dto, makeRequest() as any, res as any);

      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'auth.register' }),
      );
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('user');
    });

    it('registers a psychologist and creates psychologist profile', async () => {
      const psy = makeUser({
        email: 'psy@example.com',
        roles: [{ role: { id: 'role-psy', code: 'psychologist' } }],
        clientProfile: null,
        psychologistProfile: { publicSlug: 'psychologist-abcd1234' },
      });
      const psyDto: any = {
        email: 'psy@example.com',
        password: 'pass',
        accountType: 'psychologist',
        firstName: 'Jane',
        lastName: 'Doe',
        publicTitle: 'PhD',
        acceptPrivacyPolicy: true,
        acceptPlatformTerms: true,
      };

      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.role.findUnique.mockResolvedValue({ id: 'role-psy', code: 'psychologist' });
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
      mockPrisma.refreshToken.create.mockResolvedValue({});

      const result = await service.register(psyDto, makeRequest() as any, makeResponse() as any);
      expect(result).toHaveProperty('accessToken');
    });
  });

  // -------------------------------------------------------------------------
  // login
  // -------------------------------------------------------------------------

  describe('login', () => {
    const dto = { email: 'test@example.com', password: 'password' };

    it('throws UnauthorizedException when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login(dto, makeRequest() as any, makeResponse() as any),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when password is wrong', async () => {
      // Real bcrypt compare — wrong password will return false
      const user = makeUser({ passwordHash: '$2a$10$invalid_hash_for_testing' });
      mockPrisma.user.findUnique.mockResolvedValue(user);

      await expect(
        service.login(dto, makeRequest() as any, makeResponse() as any),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws ForbiddenException when user is not active', async () => {
      // Use bcryptjs to create a real hash so compare passes
      const bcrypt = await import('bcryptjs');
      const hash = await bcrypt.hash('password', 1);
      const user = makeUser({ passwordHash: hash, status: UserStatus.blocked });
      mockPrisma.user.findUnique.mockResolvedValue(user);

      await expect(
        service.login(dto, makeRequest() as any, makeResponse() as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('returns accessToken + user on success', async () => {
      const bcrypt = await import('bcryptjs');
      const hash = await bcrypt.hash('password', 1);
      const user = makeUser({ passwordHash: hash });

      mockPrisma.user.findUnique.mockResolvedValue(user);
      mockPrisma.user.update.mockResolvedValue(user);
      mockPrisma.refreshToken.create.mockResolvedValue({});

      const result = await service.login(dto, makeRequest() as any, makeResponse() as any);

      expect(result).toHaveProperty('accessToken', 'signed-token');
      expect(result.user).toHaveProperty('email', 'test@example.com');
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'auth.login' }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // refresh
  // -------------------------------------------------------------------------

  describe('refresh', () => {
    it('throws UnauthorizedException when no refresh cookie', async () => {
      const req = makeRequest({ cookies: {} });
      await expect(
        service.refresh(req as any, makeResponse() as any),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when session not found', async () => {
      mockJwt.verifyAsync.mockResolvedValue({
        sub: 'user-1',
        sessionId: 'sess-1',
        tokenType: 'refresh',
      });
      mockPrisma.refreshToken.findUnique.mockResolvedValue(null);

      const req = makeRequest({ cookies: { refresh_token: 'token' } });
      await expect(
        service.refresh(req as any, makeResponse() as any),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when session is revoked', async () => {
      mockJwt.verifyAsync.mockResolvedValue({
        sub: 'user-1',
        sessionId: 'sess-1',
        tokenType: 'refresh',
      });
      mockPrisma.refreshToken.findUnique.mockResolvedValue({
        id: 'sess-1',
        userId: 'user-1',
        refreshTokenHash: '$hash',
        revokedAt: new Date(), // already revoked
        expiresAt: new Date(Date.now() + 999999),
        user: makeUser(),
      });

      const req = makeRequest({ cookies: { refresh_token: 'token' } });
      await expect(
        service.refresh(req as any, makeResponse() as any),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('returns new tokens on valid refresh', async () => {
      const bcrypt = await import('bcryptjs');
      const rawToken = 'my-refresh-token';
      const hash = await bcrypt.hash(rawToken, 1);

      mockJwt.verifyAsync.mockResolvedValue({
        sub: 'user-1',
        sessionId: 'sess-1',
        tokenType: 'refresh',
      });
      mockPrisma.refreshToken.findUnique.mockResolvedValue({
        id: 'sess-1',
        userId: 'user-1',
        refreshTokenHash: hash,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 9_999_999),
        user: makeUser(),
      });
      mockPrisma.refreshToken.update.mockResolvedValue({});
      mockPrisma.refreshToken.create.mockResolvedValue({});

      const req = makeRequest({ cookies: { refresh_token: rawToken } });
      const result = await service.refresh(req as any, makeResponse() as any);

      expect(result).toHaveProperty('accessToken');
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'auth.refresh' }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // logout
  // -------------------------------------------------------------------------

  describe('logout', () => {
    it('returns success even without cookie', async () => {
      const req = makeRequest({ cookies: {} });
      const res = makeResponse();
      const result = await service.logout(req as any, res as any);
      expect(result).toEqual({ success: true });
      expect(res.clearCookie).toHaveBeenCalled();
    });

    it('revokes session when valid cookie present', async () => {
      mockJwt.verifyAsync.mockResolvedValue({
        sub: 'user-1',
        sessionId: 'sess-1',
        tokenType: 'refresh',
      });
      mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });

      const req = makeRequest({ cookies: { refresh_token: 'valid-token' } });
      const res = makeResponse();
      const result = await service.logout(req as any, res as any);

      expect(result).toEqual({ success: true });
      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ revokedAt: null }),
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // logoutAll
  // -------------------------------------------------------------------------

  describe('logoutAll', () => {
    it('revokes all sessions for user', async () => {
      mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 3 });
      const req = makeRequest();

      const result = await service.logoutAll('user-1', req as any, 'client');

      expect(result).toEqual({ success: true });
      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1', revokedAt: null },
        }),
      );
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'auth.logout_all' }),
      );
    });
  });
});
