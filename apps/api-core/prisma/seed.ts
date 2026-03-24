import {
  AppointmentSlotSource,
  AppointmentSlotStatus,
  ConsultationStatus,
  PrismaClient,
  PsychologistApprovalStatus,
  UserStatus,
  Weekday,
} from "@prisma/client";
import bcrypt from "bcryptjs";
import { DateTime } from "luxon";

const prisma = new PrismaClient();

async function ensureRole(code: string, name: string) {
  return prisma.role.upsert({
    where: { code },
    update: { name },
    create: { code, name },
  });
}

async function assignRole(userId: string, roleId: string) {
  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId,
        roleId,
      },
    },
    update: {},
    create: {
      userId,
      roleId,
    },
  });
}

async function main() {
  const [clientRole, psychologistRole, adminRole, superadminRole] = await Promise.all([
    ensureRole("client", "Клиент"),
    ensureRole("psychologist", "Психолог"),
    ensureRole("admin", "Администратор"),
    ensureRole("superadmin", "Суперадмин"),
  ]);

  const adminPassword = await bcrypt.hash("Admin12345!", 10);
  const psychologistPassword = await bcrypt.hash("Psychologist123!", 10);
  const clientPassword = await bcrypt.hash("Client12345!", 10);

  const admin = await prisma.user.upsert({
    where: { email: "admin@example.com" },
    update: {
      status: UserStatus.active,
      is2faEnabled: true,
    },
    create: {
      email: "admin@example.com",
      passwordHash: adminPassword,
      status: UserStatus.active,
      is2faEnabled: true,
      emailVerifiedAt: new Date(),
    },
  });

  const psychologist = await prisma.user.upsert({
    where: { email: "psychologist@example.com" },
    update: {
      status: UserStatus.active,
      emailVerifiedAt: new Date(),
    },
    create: {
      email: "psychologist@example.com",
      passwordHash: psychologistPassword,
      status: UserStatus.active,
      emailVerifiedAt: new Date(),
    },
  });

  const client = await prisma.user.upsert({
    where: { email: "client@example.com" },
    update: {
      status: UserStatus.active,
      emailVerifiedAt: new Date(),
    },
    create: {
      email: "client@example.com",
      passwordHash: clientPassword,
      status: UserStatus.active,
      emailVerifiedAt: new Date(),
    },
  });

  await Promise.all([
    assignRole(admin.id, adminRole.id),
    assignRole(admin.id, superadminRole.id),
    assignRole(psychologist.id, psychologistRole.id),
    assignRole(client.id, clientRole.id),
  ]);

  await prisma.clientProfile.upsert({
    where: { userId: client.id },
    update: {
      displayName: "Irina",
      timezone: "Asia/Yekaterinburg",
      preferencesJson: {
        communicationLanguage: "ru",
      },
    },
    create: {
      userId: client.id,
      displayName: "Irina",
      timezone: "Asia/Yekaterinburg",
      preferencesJson: {
        communicationLanguage: "ru",
      },
    },
  });

  await prisma.psychologistProfile.upsert({
    where: { userId: psychologist.id },
    update: {
      publicSlug: "anna-kovaleva",
      firstName: "Anna",
      lastName: "Kovaleva",
      publicTitle: "Психолог, КПТ",
      bio: "Работает с тревогой, выгоранием и вопросами самооценки.",
      experienceYears: 6,
      priceFrom: 3500,
      priceTo: 5000,
      languagesJson: ["ru", "en"],
      formatsJson: ["online"],
      approvalStatus: PsychologistApprovalStatus.approved,
      moderatedByUserId: admin.id,
    },
    create: {
      userId: psychologist.id,
      publicSlug: "anna-kovaleva",
      firstName: "Anna",
      lastName: "Kovaleva",
      publicTitle: "Психолог, КПТ",
      bio: "Работает с тревогой, выгоранием и вопросами самооценки.",
      experienceYears: 6,
      priceFrom: 3500,
      priceTo: 5000,
      languagesJson: ["ru", "en"],
      formatsJson: ["online"],
      approvalStatus: PsychologistApprovalStatus.approved,
      moderatedByUserId: admin.id,
    },
  });

  const anxiety = await prisma.specialization.upsert({
    where: { slug: "anxiety" },
    update: { name: "Тревога" },
    create: {
      slug: "anxiety",
      name: "Тревога",
    },
  });

  const burnout = await prisma.specialization.upsert({
    where: { slug: "burnout" },
    update: { name: "Выгорание" },
    create: {
      slug: "burnout",
      name: "Выгорание",
    },
  });

  await prisma.psychologistSpecialization.upsert({
    where: {
      psychologistProfileId_specializationId: {
        psychologistProfileId: psychologist.id,
        specializationId: anxiety.id,
      },
    },
    update: {},
    create: {
      psychologistProfileId: psychologist.id,
      specializationId: anxiety.id,
    },
  });

  await prisma.psychologistSpecialization.upsert({
    where: {
      psychologistProfileId_specializationId: {
        psychologistProfileId: psychologist.id,
        specializationId: burnout.id,
      },
    },
    update: {},
    create: {
      psychologistProfileId: psychologist.id,
      specializationId: burnout.id,
    },
  });

  await prisma.consultationStatusHistory.deleteMany({
    where: {
      consultation: {
        psychologistUserId: psychologist.id,
      },
    },
  });

  await prisma.consultation.deleteMany({
    where: {
      psychologistUserId: psychologist.id,
    },
  });

  await prisma.availabilityRule.deleteMany({
    where: {
      psychologistProfileId: psychologist.id,
    },
  });

  await prisma.appointmentSlot.deleteMany({
    where: {
      psychologistProfileId: psychologist.id,
    },
  });

  await prisma.availabilityRule.createMany({
    data: [
      {
        psychologistProfileId: psychologist.id,
        weekday: Weekday.monday,
        startTime: "09:00",
        endTime: "13:00",
        slotDurationMin: 50,
        bufferMin: 10,
        timezone: "Asia/Yekaterinburg",
        isActive: true,
      },
      {
        psychologistProfileId: psychologist.id,
        weekday: Weekday.wednesday,
        startTime: "14:00",
        endTime: "18:00",
        slotDurationMin: 50,
        bufferMin: 10,
        timezone: "Asia/Yekaterinburg",
        isActive: true,
      },
      {
        psychologistProfileId: psychologist.id,
        weekday: Weekday.friday,
        startTime: "10:00",
        endTime: "15:00",
        slotDurationMin: 50,
        bufferMin: 10,
        timezone: "Asia/Yekaterinburg",
        isActive: true,
      },
    ],
  });

  const localBase = DateTime.now()
    .setZone("Asia/Yekaterinburg")
    .plus({ days: 1 })
    .startOf("day");

  await prisma.appointmentSlot.create({
    data: {
      psychologistProfileId: psychologist.id,
      startsAt: localBase.set({ hour: 9, minute: 0 }).toUTC().toJSDate(),
      endsAt: localBase.set({ hour: 9, minute: 50 }).toUTC().toJSDate(),
      status: AppointmentSlotStatus.open,
      source: AppointmentSlotSource.manual,
    },
  });

  await prisma.appointmentSlot.create({
    data: {
      psychologistProfileId: psychologist.id,
      startsAt: localBase.set({ hour: 10, minute: 0 }).toUTC().toJSDate(),
      endsAt: localBase.set({ hour: 10, minute: 50 }).toUTC().toJSDate(),
      status: AppointmentSlotStatus.open,
      source: AppointmentSlotSource.manual,
    },
  });

  await prisma.appointmentSlot.create({
    data: {
      psychologistProfileId: psychologist.id,
      startsAt: localBase.plus({ days: 2 }).set({ hour: 14, minute: 0 }).toUTC().toJSDate(),
      endsAt: localBase.plus({ days: 2 }).set({ hour: 14, minute: 50 }).toUTC().toJSDate(),
      status: AppointmentSlotStatus.open,
      source: AppointmentSlotSource.generated,
    },
  });

  const bookedSlot = await prisma.appointmentSlot.create({
    data: {
      psychologistProfileId: psychologist.id,
      startsAt: localBase.plus({ days: 3 }).set({ hour: 11, minute: 0 }).toUTC().toJSDate(),
      endsAt: localBase.plus({ days: 3 }).set({ hour: 11, minute: 50 }).toUTC().toJSDate(),
      status: AppointmentSlotStatus.booked,
      source: AppointmentSlotSource.manual,
    },
  });

  const consultation = await prisma.consultation.create({
    data: {
      clientUserId: client.id,
      psychologistUserId: psychologist.id,
      slotId: bookedSlot.id,
      status: ConsultationStatus.scheduled,
      scheduledAt: bookedSlot.startsAt,
      clientMessage: "Нужна помощь с выгоранием и рабочим стрессом.",
      idempotencyKey: "seed-booking-0001",
    },
  });

  await prisma.consultationStatusHistory.create({
    data: {
      consultationId: consultation.id,
      fromStatus: null,
      toStatus: ConsultationStatus.scheduled,
      changedByUserId: client.id,
      changedByRole: "client",
      reasonCode: "booking_created",
    },
  });

  await prisma.consentRecord.deleteMany({
    where: {
      OR: [
        {
          userId: client.id,
          consentType: "privacy_policy",
          version: "2026-03-01",
        },
        {
          userId: psychologist.id,
          consentType: "platform_terms",
          version: "2026-03-01",
        },
      ],
    },
  });

  await prisma.consentRecord.createMany({
    data: [
      {
        userId: client.id,
        consentType: "privacy_policy",
        version: "2026-03-01",
        granted: true,
        grantedAt: new Date(),
        source: "web-register",
      },
      {
        userId: psychologist.id,
        consentType: "platform_terms",
        version: "2026-03-01",
        granted: true,
        grantedAt: new Date(),
        source: "psychologist-application",
      },
    ],
  });

  await prisma.auditLog.deleteMany({
    where: {
      action: "seed.bootstrap",
      entityType: "system",
      entityId: "bootstrap",
    },
  });

  await prisma.auditLog.create({
    data: {
      actorUserId: admin.id,
      actorRole: "superadmin",
      action: "seed.bootstrap",
      entityType: "system",
      entityId: "bootstrap",
      metadataJson: {
        users: [admin.email, psychologist.email, client.email],
      },
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
