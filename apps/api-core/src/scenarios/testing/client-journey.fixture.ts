import { randomUUID } from "node:crypto";
import {
  AppointmentSlotSource,
  AppointmentSlotStatus,
  ConsultationStatus,
  PsychologistApprovalStatus,
  UserStatus,
} from "prisma-client-generated";

export const CLIENT_JOURNEY_IDS = {
  roleClient: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  rolePsychologist: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  psychologist: "11111111-1111-4111-8111-111111111111",
  slot: "33333333-3333-4333-8333-333333333333",
} as const;

export const makeRequest = (overrides: Record<string, unknown> = {}) =>
  ({
    ip: "127.0.0.1",
    cookies: {},
    headers: { "user-agent": "jest-journey" },
    requestId: "journey-req-1",
    ...overrides,
  }) as any;

export const makeResponse = () => ({
  cookie: jest.fn(),
  clearCookie: jest.fn(),
});

export const extractToken = (link: string) => new URL(link).searchParams.get("token") ?? "";

export const createClientJourneyConfigValues = () => ({
  WEB_APP_ORIGIN: "http://localhost:3000",
  AUTH_DEBUG_EMAIL_VERIFICATION_LINKS: "true",
  EMAIL_VERIFICATION_TTL_HOURS: 24,
  JWT_ACCESS_TTL: 900,
  JWT_REFRESH_TTL_DAYS: 14,
  JWT_ACCESS_SECRET: "access-secret",
  JWT_REFRESH_SECRET: "refresh-secret",
  VIDEO_ACCESS_SECRET: "video-secret",
  VIDEO_PROVIDER: "mock_video",
  VIDEO_ACCESS_TTL: "900",
  NODE_ENV: "test",
  COOKIE_DOMAIN: "localhost",
  REDIS_URL: "",
  NOTIFICATION_QUEUE_KEY: "consultations.notifications.v1",
  AUTH_2FA_CHALLENGE_TTL_SEC: 600,
  AUTH_2FA_SETUP_TTL_SEC: 600,
});

export const createClientJourneyConfig = () => {
  const values = createClientJourneyConfigValues();

  return {
    get: jest.fn((key: string, fallback?: unknown) => values[key as keyof typeof values] ?? fallback),
    getOrThrow: jest.fn((key: string) => values[key as keyof typeof values]),
  };
};

export const createClientJourneyState = () => {
  const now = Date.now();

  return {
    roles: [
      { id: CLIENT_JOURNEY_IDS.roleClient, code: "client" },
      { id: CLIENT_JOURNEY_IDS.rolePsychologist, code: "psychologist" },
    ],
    users: [
      {
        id: CLIENT_JOURNEY_IDS.psychologist,
        email: "psy@example.com",
        passwordHash: "unused",
        status: UserStatus.active,
        emailVerifiedAt: new Date(now - 86_400_000),
        lastLoginAt: null,
        is2faEnabled: false,
        roleCodes: ["psychologist"],
        createdAt: new Date(now - 86_400_000),
        updatedAt: new Date(now - 86_400_000),
      },
    ] as any[],
    clientProfiles: [] as any[],
    psychologistProfiles: [
      {
        userId: CLIENT_JOURNEY_IDS.psychologist,
        publicSlug: "anna-petrova",
        firstName: "Анна",
        lastName: "Петрова",
        publicTitle: "Психолог-консультант",
        approvalStatus: PsychologistApprovalStatus.approved,
        priceFrom: 3200,
        priceTo: 4200,
      },
    ],
    appointmentSlots: [
      {
        id: CLIENT_JOURNEY_IDS.slot,
        psychologistProfileId: CLIENT_JOURNEY_IDS.psychologist,
        startsAt: new Date(now + 10 * 60 * 1000),
        endsAt: new Date(now + 60 * 60 * 1000),
        status: AppointmentSlotStatus.open,
        source: AppointmentSlotSource.generated,
      },
    ],
    consultations: [] as any[],
    consultationStatusHistory: [] as any[],
    emailVerificationTokens: [] as any[],
    refreshTokens: [] as any[],
    payments: [] as any[],
    paymentEvents: [] as any[],
  };
};

export const createClientJourneyPrisma = (state: ReturnType<typeof createClientJourneyState>) => {
  const findUser = (where: any) =>
    state.users.find((item) => (where?.id ? item.id === where.id : item.email === where?.email)) ?? null;

  const buildUser = (userId: string) => {
    const user = state.users.find((item) => item.id === userId);
    if (!user) {
      return null;
    }

    return {
      ...user,
      roles: user.roleCodes.map((code: string) => ({
        role: state.roles.find((role) => role.code === code),
      })),
      clientProfile: state.clientProfiles.find((item) => item.userId === user.id) ?? null,
      psychologistProfile:
        state.psychologistProfiles.find((item) => item.userId === user.id) ?? null,
      twoFactorCredential: null,
    };
  };

  const buildConsultation = (consultationId: string) => {
    const consultation = state.consultations.find((item) => item.id === consultationId);
    if (!consultation) {
      return null;
    }

    const slot = state.appointmentSlots.find((item) => item.id === consultation.slotId)!;
    const psychologistProfile = state.psychologistProfiles.find(
      (item) => item.userId === consultation.psychologistUserId,
    );
    const clientProfile = state.clientProfiles.find(
      (item) => item.userId === consultation.clientUserId,
    );

    return {
      ...consultation,
      slot,
      psychologist: {
        id: consultation.psychologistUserId,
        psychologistProfile,
      },
      client: {
        id: consultation.clientUserId,
        clientProfile: clientProfile ?? null,
      },
      payments: state.payments
        .filter((item) => item.consultationId === consultation.id)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
      review: null,
      statusHistory: state.consultationStatusHistory
        .filter((item) => item.consultationId === consultation.id)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
    };
  };

  const buildPayment = (paymentId: string) => {
    const payment = state.payments.find((item) => item.id === paymentId);
    if (!payment) {
      return null;
    }

    const consultation = buildConsultation(payment.consultationId)!;
    return {
      ...payment,
      consultation: {
        id: consultation.id,
        clientUserId: consultation.clientUserId,
        psychologistUserId: consultation.psychologistUserId,
        scheduledAt: consultation.scheduledAt,
        status: consultation.status,
        psychologist: consultation.psychologist,
        client: consultation.client,
      },
      events: state.paymentEvents
        .filter((item) => item.paymentId === payment.id)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
    };
  };

  const prisma: any = {
    role: {
      findUnique: jest.fn(async ({ where }: any) =>
        state.roles.find((item) => item.code === where.code) ?? null,
      ),
    },
    user: {
      findUnique: jest.fn(async ({ where }: any) => {
        const user = findUser(where);
        return user ? buildUser(user.id) : null;
      }),
      findUniqueOrThrow: jest.fn(async ({ where }: any) => {
        const user = findUser(where);
        if (!user) {
          throw new Error("user not found");
        }
        return buildUser(user.id);
      }),
      create: jest.fn(async ({ data }: any) => {
        const role = state.roles.find((item) => item.id === data.roles.create.roleId)!;
        const user = {
          id: randomUUID(),
          email: data.email,
          passwordHash: data.passwordHash,
          status: data.status,
          emailVerifiedAt: null,
          lastLoginAt: null,
          is2faEnabled: false,
          roleCodes: [role.code],
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        state.users.push(user);
        return buildUser(user.id);
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const user = state.users.find((item) => item.id === where.id)!;
        Object.assign(user, data, { updatedAt: new Date() });
        return buildUser(user.id);
      }),
    },
    clientProfile: {
      create: jest.fn(async ({ data }: any) => {
        const created = {
          userId: data.userId,
          displayName: data.displayName ?? null,
          timezone: "UTC",
        };
        state.clientProfiles.push(created);
        return created;
      }),
      findUnique: jest.fn(async ({ where }: any) =>
        state.clientProfiles.find((item) => item.userId === where.userId) ?? null,
      ),
    },
    psychologistProfile: {
      create: jest.fn(async ({ data }: any) => {
        state.psychologistProfiles.push(data);
        return data;
      }),
    },
    appointmentSlot: {
      findUnique: jest.fn(async ({ where }: any) => {
        const slot = state.appointmentSlots.find((item) => item.id === where.id);
        if (!slot) {
          return null;
        }
        return {
          ...slot,
          psychologistProfile: {
            userId: slot.psychologistProfileId,
            approvalStatus:
              state.psychologistProfiles.find((item) => item.userId === slot.psychologistProfileId)
                ?.approvalStatus ?? PsychologistApprovalStatus.pending_review,
          },
        };
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const slot = state.appointmentSlots.find(
          (item) => item.id === where.id && item.status === where.status,
        );
        if (!slot) {
          return { count: 0 };
        }
        Object.assign(slot, data);
        return { count: 1 };
      }),
    },
    consultation: {
      findFirst: jest.fn(async ({ where }: any) => {
        if (where?.idempotencyKey) {
          const found = state.consultations.find(
            (item) =>
              item.clientUserId === where.clientUserId && item.idempotencyKey === where.idempotencyKey,
          );
          return found ? buildConsultation(found.id) : null;
        }

        if (where?.id && where?.clientUserId) {
          const found = state.consultations.find(
            (item) => item.id === where.id && item.clientUserId === where.clientUserId,
          );
          return found ? buildConsultation(found.id) : null;
        }

        if (where?.slot?.endsAt?.gt) {
          const found = state.consultations.find((item) => {
            const slot = state.appointmentSlots.find((candidate) => candidate.id === item.slotId)!;
            return (
              item.clientUserId === where.clientUserId &&
              where.status.in.includes(item.status) &&
              item.scheduledAt < where.scheduledAt.lt &&
              slot.endsAt > where.slot.endsAt.gt
            );
          });
          return found ? { id: found.id } : null;
        }

        return null;
      }),
      create: jest.fn(async ({ data, select }: any) => {
        const created = {
          id: randomUUID(),
          clientUserId: data.clientUserId,
          psychologistUserId: data.psychologistUserId,
          slotId: data.slotId,
          status: data.status,
          scheduledAt: data.scheduledAt,
          clientMessage: data.clientMessage ?? null,
          idempotencyKey: data.idempotencyKey,
          cancelledAt: null,
          cancellationReasonCode: null,
          meetingProvider: null,
          meetingRoomId: null,
          meetingJoinTokenRef: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        state.consultations.push(created);
        return select?.id ? { id: created.id } : buildConsultation(created.id);
      }),
      findUnique: jest.fn(async ({ where }: any) => buildConsultation(where.id)),
      update: jest.fn(async ({ where, data }: any) => {
        const consultation = state.consultations.find((item) => item.id === where.id)!;
        Object.assign(consultation, data, { updatedAt: new Date() });
        return buildConsultation(consultation.id);
      }),
    },
    consultationStatusHistory: {
      create: jest.fn(async ({ data }: any) => {
        const created = { id: randomUUID(), createdAt: new Date(), ...data };
        state.consultationStatusHistory.push(created);
        return created;
      }),
    },
    emailVerificationToken: {
      updateMany: jest.fn(async ({ where, data }: any) => {
        let count = 0;
        state.emailVerificationTokens.forEach((item) => {
          const matchesUser = !where.userId || item.userId === where.userId;
          const matchesId = !where.id?.not || item.id !== where.id.not;
          const activeOnly = where.usedAt === null ? item.usedAt === null : true;
          const notRevoked = where.revokedAt === null ? item.revokedAt === null : true;
          const futureOnly = where.expiresAt?.gt ? item.expiresAt > where.expiresAt.gt : true;
          if (matchesUser && matchesId && activeOnly && notRevoked && futureOnly) {
            Object.assign(item, data);
            count += 1;
          }
        });
        return { count };
      }),
      create: jest.fn(async ({ data }: any) => {
        const created = { id: randomUUID(), usedAt: null, revokedAt: null, ...data };
        state.emailVerificationTokens.push(created);
        return { id: created.id };
      }),
      findUnique: jest.fn(async ({ where }: any) => {
        const token = state.emailVerificationTokens.find((item) => item.tokenHash === where.tokenHash);
        return token ? { ...token, user: buildUser(token.userId) } : null;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const token = state.emailVerificationTokens.find((item) => item.id === where.id)!;
        Object.assign(token, data);
        return token;
      }),
    },
    refreshToken: {
      create: jest.fn(async ({ data }: any) => {
        state.refreshTokens.push(data);
        return data;
      }),
    },
    payment: {
      findFirst: jest.fn(async ({ where }: any) => {
        const candidates = state.payments
          .filter((item) => item.consultationId === where.consultationId)
          .filter((item) => (where.status ? item.status === where.status : true))
          .filter((item) => (where.idempotencyKey ? item.idempotencyKey === where.idempotencyKey : true))
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return candidates[0] ? buildPayment(candidates[0].id) : null;
      }),
      create: jest.fn(async ({ data, select }: any) => {
        const created = {
          id: randomUUID(),
          paidAt: null,
          refundedAt: null,
          failureCode: null,
          failureMessage: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        state.payments.push(created);
        return select?.id ? { id: created.id } : buildPayment(created.id);
      }),
      findUnique: jest.fn(async ({ where }: any) => buildPayment(where.id)),
      update: jest.fn(async ({ where, data }: any) => {
        const payment = state.payments.find((item) => item.id === where.id)!;
        Object.assign(payment, data, { updatedAt: new Date() });
        return buildPayment(payment.id);
      }),
    },
    paymentEvent: {
      create: jest.fn(async ({ data }: any) => {
        const created = { id: randomUUID(), createdAt: new Date(), ...data };
        state.paymentEvents.push(created);
        return created;
      }),
    },
    userTwoFactorCredential: {
      update: jest.fn(async () => null),
    },
    $transaction: jest.fn(async (input: any) => {
      if (Array.isArray(input)) {
        return Promise.all(input);
      }
      return input(prisma);
    }),
  };

  return prisma;
};
