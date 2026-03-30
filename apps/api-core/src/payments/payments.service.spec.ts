import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ConsultationStatus, PaymentStatus } from 'prisma-client-generated';
import { PaymentsService } from './payments.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RealtimeService } from '../realtime/realtime.service';
import { NotificationsService } from '../notifications/notifications.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const futureDate = () => new Date(Date.now() + 2 * 60 * 60 * 1000);

const makeConsultation = (overrides: Partial<any> = {}) => ({
  id: 'consult-1',
  clientUserId: 'client-1',
  psychologistUserId: 'psy-1',
  scheduledAt: futureDate(),
  status: ConsultationStatus.scheduled,
  psychologist: {
    id: 'psy-1',
    psychologistProfile: {
      priceFrom: 2000,
      publicSlug: 'dr-doe',
      firstName: 'Jane',
      lastName: 'Doe',
      publicTitle: 'PhD',
    },
  },
  client: {
    id: 'client-1',
    clientProfile: { displayName: 'Client One', timezone: 'UTC' },
  },
  ...overrides,
});

const makePayment = (overrides: Partial<any> = {}) => ({
  id: 'pay-1',
  consultationId: 'consult-1',
  provider: 'mock',
  providerPaymentId: 'mock_abc',
  amount: 2000,
  currency: 'RUB',
  status: PaymentStatus.pending,
  paidAt: null,
  refundedAt: null,
  failureCode: null,
  failureMessage: null,
  idempotencyKey: 'idem-key-12345678',
  createdAt: new Date(),
  updatedAt: new Date(),
  consultation: makeConsultation(),
  events: [],
  ...overrides,
});

const makeRequest = () => ({
  ip: '127.0.0.1',
  headers: { 'user-agent': 'jest' },
  requestId: 'req-1',
});

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockPrisma = {
  payment: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  consultation: { findFirst: jest.fn() },
  paymentEvent: { create: jest.fn() },
  $transaction: jest.fn(),
};

const mockAudit = { log: jest.fn().mockResolvedValue(undefined) };
const mockRealtime = { publishSafe: jest.fn().mockResolvedValue(undefined) };
const mockNotifications = {
  createQueuedNotifications: jest.fn().mockResolvedValue(undefined),
};

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('PaymentsService', () => {
  let service: PaymentsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    // Reset findFirst queue to prevent leakage between tests
    mockPrisma.payment.findFirst.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
        { provide: RealtimeService, useValue: mockRealtime },
        { provide: NotificationsService, useValue: mockNotifications },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
  });

  // -------------------------------------------------------------------------
  // createPayment
  // -------------------------------------------------------------------------

  describe('createPayment', () => {
    const dto = { consultationId: 'consult-1' };
    const idempKey = 'idem-key-12345678';

    it('throws BadRequestException when idempotency key is missing', async () => {
      await expect(
        service.createPayment('client-1', dto as any, undefined, makeRequest() as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when idempotency key format is invalid', async () => {
      await expect(
        service.createPayment('client-1', dto as any, '!!bad!!', makeRequest() as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('returns existing payment when idempotency key matches', async () => {
      const existing = makePayment();
      mockPrisma.payment.findFirst.mockResolvedValue(existing);

      const result = await service.createPayment(
        'client-1', dto as any, idempKey, makeRequest() as any,
      );
      expect(result).toHaveProperty('id', 'pay-1');
    });

    it('throws ForbiddenException when payment idempotency matches but different client', async () => {
      const existing = makePayment();
      // consultation.clientUserId = 'client-1', but actor = 'client-2'
      mockPrisma.payment.findFirst.mockResolvedValue(existing);

      await expect(
        service.createPayment('client-2', dto as any, idempKey, makeRequest() as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when consultation not found', async () => {
      mockPrisma.payment.findFirst.mockResolvedValue(null);
      mockPrisma.consultation.findFirst.mockResolvedValue(null);

      await expect(
        service.createPayment('client-1', dto as any, idempKey, makeRequest() as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when consultation is not scheduled', async () => {
      mockPrisma.payment.findFirst.mockResolvedValue(null);
      mockPrisma.consultation.findFirst.mockResolvedValue(
        makeConsultation({ status: ConsultationStatus.completed }),
      );

      await expect(
        service.createPayment('client-1', dto as any, idempKey, makeRequest() as any),
      ).rejects.toThrow(ConflictException);
    });

    it('throws BadRequestException when priceFrom is not set', async () => {
      mockPrisma.payment.findFirst.mockResolvedValue(null);
      mockPrisma.consultation.findFirst.mockResolvedValue(
        makeConsultation({
          psychologist: {
            id: 'psy-1',
            psychologistProfile: { priceFrom: null, publicSlug: 'dr', firstName: 'A', lastName: 'B', publicTitle: null },
          },
        }),
      );

      await expect(
        service.createPayment('client-1', dto as any, idempKey, makeRequest() as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('returns existing succeeded payment without creating a new one', async () => {
      const succeeded = makePayment({ status: PaymentStatus.succeeded });
      // First findFirst (idempotency) returns null, second (succeeded) returns payment
      mockPrisma.payment.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(succeeded)
        .mockResolvedValueOnce(null); // no pending
      mockPrisma.consultation.findFirst.mockResolvedValue(makeConsultation());

      const result = await service.createPayment(
        'client-1', dto as any, idempKey, makeRequest() as any,
      );
      expect(result).toHaveProperty('status', PaymentStatus.succeeded);
    });

    it('returns existing pending payment without creating a new one', async () => {
      const pending = makePayment();
      mockPrisma.payment.findFirst
        .mockResolvedValueOnce(null) // idempotency
        .mockResolvedValueOnce(null) // succeeded
        .mockResolvedValueOnce(pending); // pending
      mockPrisma.consultation.findFirst.mockResolvedValue(makeConsultation());

      const result = await service.createPayment(
        'client-1', dto as any, idempKey, makeRequest() as any,
      );
      expect(result).toHaveProperty('status', PaymentStatus.pending);
    });

    it('creates new payment and returns serialized result', async () => {
      const payment = makePayment();
      // all findFirst return null initially
      mockPrisma.payment.findFirst.mockResolvedValue(null);
      mockPrisma.consultation.findFirst.mockResolvedValue(makeConsultation());

      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          payment: {
            create: jest.fn().mockResolvedValue({ id: 'pay-1' }),
          },
          paymentEvent: { create: jest.fn().mockResolvedValue({}) },
        };
        return fn(tx);
      });

      mockPrisma.payment.findUnique.mockResolvedValue(payment);

      const result = await service.createPayment(
        'client-1', dto as any, idempKey, makeRequest() as any,
      );
      expect(result).toHaveProperty('id', 'pay-1');
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'payments.create' }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // confirmMockPayment
  // -------------------------------------------------------------------------

  describe('confirmMockPayment', () => {
    it('returns payment immediately when already succeeded', async () => {
      mockPrisma.payment.findUnique.mockResolvedValue(
        makePayment({ status: PaymentStatus.succeeded, paidAt: new Date() }),
      );

      const result = await service.confirmMockPayment(
        'pay-1', 'client-1', ['client'], makeRequest() as any,
      );
      expect(result).toHaveProperty('status', PaymentStatus.succeeded);
      // No transaction should be called
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('throws ConflictException when consultation is not scheduled', async () => {
      mockPrisma.payment.findUnique.mockResolvedValue(
        makePayment({
          consultation: makeConsultation({ status: ConsultationStatus.completed }),
        }),
      );

      await expect(
        service.confirmMockPayment('pay-1', 'client-1', ['client'], makeRequest() as any),
      ).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException when payment is not pending', async () => {
      mockPrisma.payment.findUnique.mockResolvedValue(
        makePayment({ status: PaymentStatus.failed }),
      );

      await expect(
        service.confirmMockPayment('pay-1', 'client-1', ['client'], makeRequest() as any),
      ).rejects.toThrow(ConflictException);
    });

    it('confirms payment and sets status to succeeded', async () => {
      const payment = makePayment();
      mockPrisma.payment.findUnique
        .mockResolvedValueOnce(payment)
        .mockResolvedValueOnce({ ...payment, status: PaymentStatus.succeeded, paidAt: new Date() });

      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          payment: { update: jest.fn().mockResolvedValue({}) },
          paymentEvent: { create: jest.fn().mockResolvedValue({}) },
        };
        return fn(tx);
      });

      const result = await service.confirmMockPayment(
        'pay-1', 'client-1', ['client'], makeRequest() as any,
      );
      expect(result).toHaveProperty('status', PaymentStatus.succeeded);
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'payments.mock_confirm' }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // failMockPayment
  // -------------------------------------------------------------------------

  describe('failMockPayment', () => {
    const failDto = { failureCode: 'card_declined', failureMessage: 'Insufficient funds' };

    it('returns payment immediately when already failed', async () => {
      mockPrisma.payment.findUnique.mockResolvedValue(
        makePayment({ status: PaymentStatus.failed }),
      );

      const result = await service.failMockPayment(
        'pay-1', 'client-1', ['client'], failDto as any, makeRequest() as any,
      );
      expect(result).toHaveProperty('status', PaymentStatus.failed);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('throws ConflictException when payment is not pending', async () => {
      mockPrisma.payment.findUnique.mockResolvedValue(
        makePayment({ status: PaymentStatus.succeeded }),
      );

      await expect(
        service.failMockPayment('pay-1', 'client-1', ['client'], failDto as any, makeRequest() as any),
      ).rejects.toThrow(ConflictException);
    });

    it('fails payment and sets status to failed', async () => {
      const payment = makePayment();
      mockPrisma.payment.findUnique
        .mockResolvedValueOnce(payment)
        .mockResolvedValueOnce({ ...payment, status: PaymentStatus.failed, failureCode: 'card_declined' });

      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          payment: { update: jest.fn().mockResolvedValue({}) },
          paymentEvent: { create: jest.fn().mockResolvedValue({}) },
        };
        return fn(tx);
      });

      const result = await service.failMockPayment(
        'pay-1', 'client-1', ['client'], failDto as any, makeRequest() as any,
      );
      expect(result).toHaveProperty('status', PaymentStatus.failed);
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'payments.mock_fail' }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // cancelMockPayment
  // -------------------------------------------------------------------------

  describe('cancelMockPayment', () => {
    it('returns payment immediately when already cancelled', async () => {
      mockPrisma.payment.findUnique.mockResolvedValue(
        makePayment({ status: PaymentStatus.cancelled }),
      );

      const result = await service.cancelMockPayment(
        'pay-1', 'client-1', ['client'], makeRequest() as any,
      );
      expect(result).toHaveProperty('status', PaymentStatus.cancelled);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('throws ConflictException when payment is not pending', async () => {
      mockPrisma.payment.findUnique.mockResolvedValue(
        makePayment({ status: PaymentStatus.succeeded }),
      );

      await expect(
        service.cancelMockPayment('pay-1', 'client-1', ['client'], makeRequest() as any),
      ).rejects.toThrow(ConflictException);
    });

    it('cancels payment and sets status to cancelled', async () => {
      const payment = makePayment();
      mockPrisma.payment.findUnique
        .mockResolvedValueOnce(payment)
        .mockResolvedValueOnce({ ...payment, status: PaymentStatus.cancelled });

      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          payment: { update: jest.fn().mockResolvedValue({}) },
          paymentEvent: { create: jest.fn().mockResolvedValue({}) },
        };
        return fn(tx);
      });

      const result = await service.cancelMockPayment(
        'pay-1', 'client-1', ['client'], makeRequest() as any,
      );
      expect(result).toHaveProperty('status', PaymentStatus.cancelled);
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'payments.mock_cancel' }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // getPaymentById
  // -------------------------------------------------------------------------

  describe('getPaymentById', () => {
    it('throws NotFoundException when payment not found', async () => {
      mockPrisma.payment.findUnique.mockResolvedValue(null);

      await expect(
        service.getPaymentById('nonexistent', 'client-1', ['client']),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when viewer has no access', async () => {
      mockPrisma.payment.findUnique.mockResolvedValue(makePayment());

      await expect(
        service.getPaymentById('pay-1', 'stranger', ['user']),
      ).rejects.toThrow(ForbiddenException);
    });

    it('returns payment for the client owner', async () => {
      mockPrisma.payment.findUnique.mockResolvedValue(makePayment());

      const result = await service.getPaymentById('pay-1', 'client-1', ['client']);
      expect(result).toHaveProperty('id', 'pay-1');
    });

    it('returns payment for admin', async () => {
      mockPrisma.payment.findUnique.mockResolvedValue(makePayment());

      const result = await service.getPaymentById('pay-1', 'admin-1', ['admin']);
      expect(result).toHaveProperty('id', 'pay-1');
    });
  });
});
