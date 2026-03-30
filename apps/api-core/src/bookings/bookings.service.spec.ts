import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  AppointmentSlotStatus,
  ConsultationStatus,
  PsychologistApprovalStatus,
} from 'prisma-client-generated';
import { BookingsService } from './bookings.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RealtimeService } from '../realtime/realtime.service';
import { NotificationsService } from '../notifications/notifications.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const future = () => new Date(Date.now() + 2 * 60 * 60 * 1000); // +2h
const past = () => new Date(Date.now() - 2 * 60 * 60 * 1000); // -2h

const makeSlot = (overrides: Partial<any> = {}) => ({
  id: 'slot-1',
  status: AppointmentSlotStatus.open,
  startsAt: future(),
  endsAt: new Date(Date.now() + 3 * 60 * 60 * 1000),
  source: 'manual',
  psychologistProfileId: 'psy-user-1',
  psychologistProfile: {
    userId: 'psy-user-1',
    approvalStatus: PsychologistApprovalStatus.approved,
  },
  ...overrides,
});

const makeBooking = (overrides: Partial<any> = {}) => ({
  id: 'booking-1',
  status: ConsultationStatus.scheduled,
  clientUserId: 'client-1',
  psychologistUserId: 'psy-user-1',
  slotId: 'slot-1',
  scheduledAt: future(),
  cancelledAt: null,
  cancellationReasonCode: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  clientMessage: null,
  idempotencyKey: 'idem-key-1',
  slot: {
    id: 'slot-1',
    startsAt: future(),
    endsAt: new Date(Date.now() + 3 * 60 * 60 * 1000),
    status: AppointmentSlotStatus.booked,
    source: 'manual',
  },
  psychologist: {
    id: 'psy-user-1',
    psychologistProfile: {
      publicSlug: 'dr-doe',
      firstName: 'Jane',
      lastName: 'Doe',
      publicTitle: 'PhD',
    },
  },
  client: {
    id: 'client-1',
    clientProfile: { displayName: 'John Client', timezone: 'UTC' },
  },
  payments: [],
  statusHistory: [],
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
  clientProfile: { findUnique: jest.fn() },
  consultation: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  appointmentSlot: { findUnique: jest.fn(), updateMany: jest.fn() },
  consultationStatusHistory: { create: jest.fn() },
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

describe('BookingsService', () => {
  let service: BookingsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
        { provide: RealtimeService, useValue: mockRealtime },
        { provide: NotificationsService, useValue: mockNotifications },
      ],
    }).compile();

    service = module.get<BookingsService>(BookingsService);
  });

  // -------------------------------------------------------------------------
  // createBooking
  // -------------------------------------------------------------------------

  describe('createBooking', () => {
    const dto = { slotId: 'slot-1', clientMessage: 'Hello' };
    const idempKey = 'idem-key-12345678';

    it('throws ForbiddenException when client profile not found', async () => {
      mockPrisma.clientProfile.findUnique.mockResolvedValue(null);

      await expect(
        service.createBooking('client-1', dto as any, idempKey, makeRequest() as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('returns existing booking when idempotency key matches', async () => {
      mockPrisma.clientProfile.findUnique.mockResolvedValue({ userId: 'client-1' });
      const existing = makeBooking();
      mockPrisma.consultation.findFirst.mockResolvedValue(existing);

      const result = await service.createBooking(
        'client-1', dto as any, idempKey, makeRequest() as any,
      );
      expect(result).toHaveProperty('id', 'booking-1');
    });

    it('throws NotFoundException when slot not found in transaction', async () => {
      mockPrisma.clientProfile.findUnique.mockResolvedValue({ userId: 'client-1' });
      mockPrisma.consultation.findFirst.mockResolvedValue(null);

      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          appointmentSlot: { findUnique: jest.fn().mockResolvedValue(null) },
          consultation: { findFirst: jest.fn().mockResolvedValue(null) },
        };
        return fn(tx);
      });

      await expect(
        service.createBooking('client-1', dto as any, idempKey, makeRequest() as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when slot is not open', async () => {
      mockPrisma.clientProfile.findUnique.mockResolvedValue({ userId: 'client-1' });
      mockPrisma.consultation.findFirst.mockResolvedValue(null);

      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          appointmentSlot: {
            findUnique: jest.fn().mockResolvedValue(
              makeSlot({ status: AppointmentSlotStatus.booked }),
            ),
          },
        };
        return fn(tx);
      });

      await expect(
        service.createBooking('client-1', dto as any, idempKey, makeRequest() as any),
      ).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException when psychologist is not approved', async () => {
      mockPrisma.clientProfile.findUnique.mockResolvedValue({ userId: 'client-1' });
      mockPrisma.consultation.findFirst.mockResolvedValue(null);

      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          appointmentSlot: {
            findUnique: jest.fn().mockResolvedValue(
              makeSlot({
                psychologistProfile: {
                  userId: 'psy-user-1',
                  approvalStatus: PsychologistApprovalStatus.pending_review,
                },
              }),
            ),
          },
        };
        return fn(tx);
      });

      await expect(
        service.createBooking('client-1', dto as any, idempKey, makeRequest() as any),
      ).rejects.toThrow(ConflictException);
    });

    it('throws BadRequestException when slot is in the past', async () => {
      mockPrisma.clientProfile.findUnique.mockResolvedValue({ userId: 'client-1' });
      mockPrisma.consultation.findFirst.mockResolvedValue(null);

      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          appointmentSlot: {
            findUnique: jest.fn().mockResolvedValue(makeSlot({ startsAt: past() })),
          },
        };
        return fn(tx);
      });

      await expect(
        service.createBooking('client-1', dto as any, idempKey, makeRequest() as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws ForbiddenException when client tries to book own psychologist slot', async () => {
      mockPrisma.clientProfile.findUnique.mockResolvedValue({ userId: 'psy-user-1' });
      mockPrisma.consultation.findFirst.mockResolvedValue(null);

      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          appointmentSlot: {
            findUnique: jest.fn().mockResolvedValue(
              makeSlot({ psychologistProfile: { userId: 'psy-user-1', approvalStatus: PsychologistApprovalStatus.approved } }),
            ),
          },
        };
        return fn(tx);
      });

      await expect(
        service.createBooking('psy-user-1', dto as any, idempKey, makeRequest() as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ConflictException when overlapping consultation exists', async () => {
      mockPrisma.clientProfile.findUnique.mockResolvedValue({ userId: 'client-1' });
      mockPrisma.consultation.findFirst.mockResolvedValue(null);

      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          appointmentSlot: {
            findUnique: jest.fn().mockResolvedValue(makeSlot()),
          },
          consultation: {
            findFirst: jest.fn().mockResolvedValue({ id: 'overlap-1' }),
          },
        };
        return fn(tx);
      });

      await expect(
        service.createBooking('client-1', dto as any, idempKey, makeRequest() as any),
      ).rejects.toThrow(ConflictException);
    });

    it('throws BadRequestException when idempotency key is missing', async () => {
      mockPrisma.clientProfile.findUnique.mockResolvedValue({ userId: 'client-1' });

      await expect(
        service.createBooking('client-1', dto as any, undefined, makeRequest() as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when idempotency key has invalid format', async () => {
      mockPrisma.clientProfile.findUnique.mockResolvedValue({ userId: 'client-1' });

      await expect(
        service.createBooking('client-1', dto as any, '!!bad!!', makeRequest() as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates booking successfully and returns serialized result', async () => {
      const booking = makeBooking();
      mockPrisma.clientProfile.findUnique.mockResolvedValue({ userId: 'client-1' });
      // No existing idempotency match
      mockPrisma.consultation.findFirst.mockResolvedValue(null);

      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          appointmentSlot: {
            findUnique: jest.fn().mockResolvedValue(makeSlot()),
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          },
          consultation: {
            findFirst: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockResolvedValue({ id: 'booking-1' }),
          },
          consultationStatusHistory: { create: jest.fn().mockResolvedValue({}) },
        };
        return fn(tx);
      });

      // getBookingRecord after creation
      mockPrisma.consultation.findUnique.mockResolvedValue(booking);

      const result = await service.createBooking(
        'client-1', dto as any, idempKey, makeRequest() as any,
      );

      expect(result).toHaveProperty('id', 'booking-1');
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'bookings.create' }),
      );
      expect(mockRealtime.publishSafe).toHaveBeenCalled();
      expect(mockNotifications.createQueuedNotifications).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // cancelBooking
  // -------------------------------------------------------------------------

  describe('cancelBooking', () => {
    const cancelDto = { reasonCode: 'test_cancel' };

    it('throws ConflictException when booking is not scheduled', async () => {
      mockPrisma.consultation.findUnique.mockResolvedValue(
        makeBooking({ status: ConsultationStatus.completed }),
      );

      await expect(
        service.cancelBooking('booking-1', 'client-1', ['client'], cancelDto as any, makeRequest() as any),
      ).rejects.toThrow(ConflictException);
    });

    it('throws ForbiddenException when actor has no access', async () => {
      mockPrisma.consultation.findUnique.mockResolvedValue(makeBooking());

      await expect(
        service.cancelBooking('booking-1', 'other-user', ['user'], cancelDto as any, makeRequest() as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('cancels booking as client', async () => {
      const booking = makeBooking();
      mockPrisma.consultation.findUnique
        .mockResolvedValueOnce(booking)
        .mockResolvedValueOnce({ ...booking, status: ConsultationStatus.cancelled_by_client });

      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          consultation: { update: jest.fn().mockResolvedValue({}) },
          consultationStatusHistory: { create: jest.fn().mockResolvedValue({}) },
          appointmentSlot: { updateMany: jest.fn().mockResolvedValue({}) },
        };
        return fn(tx);
      });

      const result = await service.cancelBooking(
        'booking-1', 'client-1', ['client'], cancelDto as any, makeRequest() as any,
      );
      expect(result).toHaveProperty('status', ConsultationStatus.cancelled_by_client);
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'bookings.cancel' }),
      );
    });

    it('cancels booking as psychologist', async () => {
      const booking = makeBooking();
      mockPrisma.consultation.findUnique
        .mockResolvedValueOnce(booking)
        .mockResolvedValueOnce({ ...booking, status: ConsultationStatus.cancelled_by_psychologist });

      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          consultation: { update: jest.fn().mockResolvedValue({}) },
          consultationStatusHistory: { create: jest.fn().mockResolvedValue({}) },
          appointmentSlot: { updateMany: jest.fn().mockResolvedValue({}) },
        };
        return fn(tx);
      });

      const result = await service.cancelBooking(
        'booking-1', 'psy-user-1', ['psychologist'], cancelDto as any, makeRequest() as any,
      );
      expect(result).toHaveProperty('status', ConsultationStatus.cancelled_by_psychologist);
    });

    it('cancels booking as admin', async () => {
      const booking = makeBooking();
      mockPrisma.consultation.findUnique
        .mockResolvedValueOnce(booking)
        .mockResolvedValueOnce({ ...booking, status: ConsultationStatus.cancelled_by_admin });

      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          consultation: { update: jest.fn().mockResolvedValue({}) },
          consultationStatusHistory: { create: jest.fn().mockResolvedValue({}) },
          appointmentSlot: { updateMany: jest.fn().mockResolvedValue({}) },
        };
        return fn(tx);
      });

      const result = await service.cancelBooking(
        'booking-1', 'admin-1', ['admin'], cancelDto as any, makeRequest() as any,
      );
      expect(result).toHaveProperty('status', ConsultationStatus.cancelled_by_admin);
    });
  });

  // -------------------------------------------------------------------------
  // completeBooking
  // -------------------------------------------------------------------------

  describe('completeBooking', () => {
    it('throws ConflictException when booking is not scheduled', async () => {
      mockPrisma.consultation.findUnique.mockResolvedValue(
        makeBooking({ status: ConsultationStatus.completed }),
      );

      await expect(
        service.completeBooking('booking-1', 'psy-user-1', ['psychologist'], makeRequest() as any),
      ).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException when slot has not ended yet', async () => {
      // slot endsAt is in the future
      mockPrisma.consultation.findUnique.mockResolvedValue(makeBooking());

      await expect(
        service.completeBooking('booking-1', 'psy-user-1', ['psychologist'], makeRequest() as any),
      ).rejects.toThrow(ConflictException);
    });

    it('throws ForbiddenException when non-psychologist/admin tries to complete', async () => {
      const booking = makeBooking({
        slot: {
          id: 'slot-1',
          startsAt: past(),
          endsAt: past(),
          status: AppointmentSlotStatus.booked,
          source: 'manual',
        },
      });
      mockPrisma.consultation.findUnique.mockResolvedValue(booking);

      await expect(
        service.completeBooking('booking-1', 'client-1', ['client'], makeRequest() as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('completes booking when slot has ended', async () => {
      const booking = makeBooking({
        slot: {
          id: 'slot-1',
          startsAt: past(),
          endsAt: past(),
          status: AppointmentSlotStatus.booked,
          source: 'manual',
        },
      });
      mockPrisma.consultation.findUnique
        .mockResolvedValueOnce(booking)
        .mockResolvedValueOnce({ ...booking, status: ConsultationStatus.completed });

      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          consultation: { update: jest.fn().mockResolvedValue({}) },
          consultationStatusHistory: { create: jest.fn().mockResolvedValue({}) },
        };
        return fn(tx);
      });

      const result = await service.completeBooking(
        'booking-1', 'psy-user-1', ['psychologist'], makeRequest() as any,
      );
      expect(result).toHaveProperty('status', ConsultationStatus.completed);
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'bookings.complete' }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // getBookingById
  // -------------------------------------------------------------------------

  describe('getBookingById', () => {
    it('throws NotFoundException when booking not found', async () => {
      mockPrisma.consultation.findUnique.mockResolvedValue(null);

      await expect(
        service.getBookingById('nonexistent', 'client-1', ['client']),
      ).rejects.toThrow(NotFoundException);
    });

    it('returns booking for the owner client', async () => {
      mockPrisma.consultation.findUnique.mockResolvedValue(makeBooking());

      const result = await service.getBookingById('booking-1', 'client-1', ['client']);
      expect(result).toHaveProperty('id', 'booking-1');
    });
  });

  // -------------------------------------------------------------------------
  // listBookings (date range validation)
  // -------------------------------------------------------------------------

  describe('listClientBookings - date range validation', () => {
    it('throws BadRequestException for invalid timezone', async () => {
      await expect(
        service.listClientBookings('client-1', {
          dateFrom: '2025-01-01',
          timezone: 'Not/A/Valid/Timezone',
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when dateTo is before dateFrom', async () => {
      await expect(
        service.listClientBookings('client-1', {
          dateFrom: '2025-12-31',
          dateTo: '2025-01-01',
          timezone: 'UTC',
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('returns paginated list without date filter', async () => {
      const booking = makeBooking();
      mockPrisma.$transaction.mockResolvedValue([[booking], 1]);

      const result = await service.listClientBookings('client-1', {} as any);
      expect(result.items).toHaveLength(1);
      expect(result.pagination.total).toBe(1);
    });
  });
});
