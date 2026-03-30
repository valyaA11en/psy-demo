import {
  AppointmentSlotSource,
  AppointmentSlotStatus,
  ClientSessionPackageStatus,
  ConsultationStatus,
  HomeworkTaskStatus,
  NotificationChannel,
  NotificationStatus,
  PrismaClient,
  PsychologistApprovalStatus,
  UserStatus,
  Weekday,
} from "prisma-client-generated";
import bcrypt from "bcryptjs";
import { DateTime } from "luxon";

const prisma = new PrismaClient();

function envFlag(name: string, defaultValue = false) {
  const rawValue = process.env[name];

  if (!rawValue) {
    return defaultValue;
  }

  return ["1", "true", "yes", "on"].includes(rawValue.toLowerCase());
}

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

function toUtcDateOnly(value: DateTime) {
  return new Date(`${value.toFormat("yyyy-MM-dd")}T00:00:00.000Z`);
}

async function main() {
  const [clientRole, psychologistRole, adminRole, superadminRole] = await Promise.all([
    ensureRole("client", "Клиент"),
    ensureRole("psychologist", "Психолог"),
    ensureRole("admin", "Администратор"),
    ensureRole("superadmin", "Суперадмин"),
  ]);

  if (!envFlag("SEED_DEMO_DATA", false)) {
    console.log("SEED_DEMO_DATA=false, seeded only base reference roles.");
    return;
  }

  const adminPassword = await bcrypt.hash("Admin12345!", 10);
  const psychologistPassword = await bcrypt.hash("Psychologist123!", 10);
  const clientPassword = await bcrypt.hash("Client12345!", 10);

  const admin = await prisma.user.upsert({
    where: { email: "admin@example.com" },
    update: {
      status: UserStatus.active,
      is2faEnabled: false,
    },
    create: {
      email: "admin@example.com",
      passwordHash: adminPassword,
      status: UserStatus.active,
      is2faEnabled: false,
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

  await prisma.notificationPreference.upsert({
    where: { userId: client.id },
    update: {
      inAppEnabled: true,
      emailEnabled: true,
      telegramEnabled: true,
      bookingUpdatesEnabled: true,
      paymentUpdatesEnabled: true,
      sessionUpdatesEnabled: true,
      systemUpdatesEnabled: true,
      telegramChatId: "123456789",
      telegramLinkedAt: new Date(),
    },
    create: {
      userId: client.id,
      inAppEnabled: true,
      emailEnabled: true,
      telegramEnabled: true,
      bookingUpdatesEnabled: true,
      paymentUpdatesEnabled: true,
      sessionUpdatesEnabled: true,
      systemUpdatesEnabled: true,
      telegramChatId: "123456789",
      telegramLinkedAt: new Date(),
    },
  });

  await prisma.notificationPreference.upsert({
    where: { userId: psychologist.id },
    update: {
      inAppEnabled: true,
      emailEnabled: true,
      telegramEnabled: false,
      bookingUpdatesEnabled: true,
      paymentUpdatesEnabled: true,
      sessionUpdatesEnabled: true,
      systemUpdatesEnabled: true,
      telegramChatId: null,
      telegramLinkedAt: null,
    },
    create: {
      userId: psychologist.id,
      inAppEnabled: true,
      emailEnabled: true,
      telegramEnabled: false,
      bookingUpdatesEnabled: true,
      paymentUpdatesEnabled: true,
      sessionUpdatesEnabled: true,
      systemUpdatesEnabled: true,
      telegramChatId: null,
      telegramLinkedAt: null,
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

  await prisma.clientSessionPackage.deleteMany({
    where: {
      OR: [
        {
          clientUserId: client.id,
        },
        {
          psychologistUserId: psychologist.id,
        },
      ],
    },
  });

  await prisma.sessionPackageOffer.deleteMany({
    where: {
      psychologistUserId: psychologist.id,
    },
  });

  await prisma.review.deleteMany({
    where: {
      psychologistUserId: psychologist.id,
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

  const completedSlot = await prisma.appointmentSlot.create({
    data: {
      psychologistProfileId: psychologist.id,
      startsAt: localBase.minus({ days: 5 }).set({ hour: 12, minute: 0 }).toUTC().toJSDate(),
      endsAt: localBase.minus({ days: 5 }).set({ hour: 12, minute: 50 }).toUTC().toJSDate(),
      status: AppointmentSlotStatus.booked,
      source: AppointmentSlotSource.manual,
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

  const completedConsultation = await prisma.consultation.create({
    data: {
      clientUserId: client.id,
      psychologistUserId: psychologist.id,
      slotId: completedSlot.id,
      status: ConsultationStatus.completed,
      scheduledAt: completedSlot.startsAt,
      clientMessage: "Хотела разобраться с тревогой и постоянным напряжением.",
      idempotencyKey: "seed-booking-completed-0001",
    },
  });

  const scheduledConsultation = await prisma.consultation.create({
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

  const focusedOffer = await prisma.sessionPackageOffer.create({
    data: {
      psychologistUserId: psychologist.id,
      title: "Фокус на 4 встречи",
      description: "Подходит для краткосрочной работы, когда нужен ритм и понятный план нескольких встреч подряд.",
      sessionCount: 4,
      discountPercent: 10,
      totalPrice: 12600,
      currency: "RUB",
      isActive: true,
    },
  });

  await prisma.sessionPackageOffer.create({
    data: {
      psychologistUserId: psychologist.id,
      title: "Поддержка на 8 встреч",
      description: "Для более длинного цикла работы с тревогой, выгоранием и устойчивыми паттернами стресса.",
      sessionCount: 8,
      discountPercent: 15,
      totalPrice: 23800,
      currency: "RUB",
      isActive: true,
    },
  });

  await prisma.clientSessionPackage.create({
    data: {
      offerId: focusedOffer.id,
      clientUserId: client.id,
      psychologistUserId: psychologist.id,
      title: focusedOffer.title,
      totalSessions: focusedOffer.sessionCount,
      remainingSessions: focusedOffer.sessionCount,
      discountPercent: focusedOffer.discountPercent,
      priceAmount: focusedOffer.totalPrice,
      currency: focusedOffer.currency,
      status: ClientSessionPackageStatus.active,
      idempotencyKey: "seed-session-package-0001",
      purchasedAt: localBase.minus({ days: 2 }).set({ hour: 10, minute: 15 }).toUTC().toJSDate(),
    },
  });

  await prisma.consultationStatusHistory.create({
    data: {
      consultationId: completedConsultation.id,
      fromStatus: null,
      toStatus: ConsultationStatus.scheduled,
      changedByUserId: client.id,
      changedByRole: "client",
      reasonCode: "booking_created",
    },
  });

  await prisma.consultationStatusHistory.create({
    data: {
      consultationId: completedConsultation.id,
      fromStatus: ConsultationStatus.scheduled,
      toStatus: ConsultationStatus.completed,
      changedByUserId: psychologist.id,
      changedByRole: "psychologist",
      reasonCode: "consultation_completed",
    },
  });

  await prisma.consultationStatusHistory.create({
    data: {
      consultationId: scheduledConsultation.id,
      fromStatus: null,
      toStatus: ConsultationStatus.scheduled,
      changedByUserId: client.id,
      changedByRole: "client",
      reasonCode: "booking_created",
    },
  });

  await prisma.review.create({
    data: {
      consultationId: completedConsultation.id,
      clientUserId: client.id,
      psychologistUserId: psychologist.id,
      rating: 5,
      text: "Очень спокойная и бережная консультация. После встречи стало проще структурировать мысли.",
      status: "published",
    },
  });

  await prisma.psychologistProfile.update({
    where: {
      userId: psychologist.id,
    },
    data: {
      ratingAvg: 5,
      reviewsCount: 1,
    },
  });

  await prisma.moodEntry.deleteMany({
    where: {
      clientUserId: client.id,
    },
  });

  await prisma.moodEntry.createMany({
    data: [
      {
        clientUserId: client.id,
        recordedForDate: toUtcDateOnly(localBase.minus({ days: 6 })),
        moodScore: 4,
        emotionsJson: ["тревога", "усталость"],
        note: "Сложно было собраться после насыщенной рабочей недели.",
      },
      {
        clientUserId: client.id,
        recordedForDate: toUtcDateOnly(localBase.minus({ days: 5 })),
        moodScore: 5,
        emotionsJson: ["напряжение", "надежда"],
        note: "После консультации стало чуть спокойнее и понятнее, что делать дальше.",
      },
      {
        clientUserId: client.id,
        recordedForDate: toUtcDateOnly(localBase.minus({ days: 3 })),
        moodScore: 6,
        emotionsJson: ["спокойствие"],
        note: "Получилось выделить время на отдых и прогулку.",
      },
      {
        clientUserId: client.id,
        recordedForDate: toUtcDateOnly(localBase.minus({ days: 1 })),
        moodScore: 7,
        emotionsJson: ["уверенность", "интерес"],
        note: "Было больше энергии, чем обычно. Помогла структура дня.",
      },
    ],
  });

  await prisma.homeworkTask.deleteMany({
    where: {
      OR: [
        {
          clientUserId: client.id,
        },
        {
          psychologistUserId: psychologist.id,
        },
      ],
    },
  });

  await prisma.homeworkTask.create({
    data: {
      consultationId: completedConsultation.id,
      clientUserId: client.id,
      psychologistUserId: psychologist.id,
      title: "Вести короткий дневник эмоций три раза до следующей встречи",
      description: "Отмечайте ключевую эмоцию дня, телесные ощущения и что помогло снизить напряжение.",
      dueAt: localBase.plus({ days: 2 }).set({ hour: 20, minute: 0 }).toUTC().toJSDate(),
      status: HomeworkTaskStatus.assigned,
    },
  });

  await prisma.chatMessage.deleteMany({
    where: {
      OR: [
        {
          clientUserId: client.id,
        },
        {
          psychologistUserId: psychologist.id,
        },
      ],
    },
  });

  await prisma.chatMessage.createMany({
    data: [
      {
        clientUserId: client.id,
        psychologistUserId: psychologist.id,
        senderUserId: psychologist.id,
        body: "После встречи попробуйте коротко фиксировать эмоцию дня и то, что помогло снизить напряжение.",
        createdAt: localBase.minus({ days: 4 }).set({ hour: 18, minute: 15 }).toUTC().toJSDate(),
      },
      {
        clientUserId: client.id,
        psychologistUserId: psychologist.id,
        senderUserId: client.id,
        body: "Хорошо, сделаю. Уже вчера заметила, что прогулка помогает быстрее успокоиться.",
        createdAt: localBase.minus({ days: 4 }).set({ hour: 19, minute: 5 }).toUTC().toJSDate(),
      },
      {
        clientUserId: client.id,
        psychologistUserId: psychologist.id,
        senderUserId: psychologist.id,
        body: "Отличное наблюдение. На следующей встрече обсудим, в какие моменты это работает лучше всего.",
        createdAt: localBase.minus({ days: 3 }).set({ hour: 10, minute: 20 }).toUTC().toJSDate(),
        readAt: localBase.minus({ days: 3 }).set({ hour: 11, minute: 0 }).toUTC().toJSDate(),
      },
    ],
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

  await prisma.notification.deleteMany({
    where: {
      userId: {
        in: [client.id, psychologist.id],
      },
    },
  });

  await prisma.notification.createMany({
    data: [
      {
        userId: client.id,
        channel: NotificationChannel.in_app,
        type: "booking.created",
        title: "Бронирование создано",
        body: "Запись на консультацию успешно создана.",
        dedupKey: "seed:booking-created:client",
        status: NotificationStatus.sent,
        attempts: 1,
        queuedAt: new Date(),
        sentAt: new Date(),
      },
      {
        userId: psychologist.id,
        channel: NotificationChannel.in_app,
        type: "booking.created",
        title: "Новая консультация",
        body: "У вас появилась новая запланированная консультация.",
        dedupKey: "seed:booking-created:psychologist",
        status: NotificationStatus.sent,
        attempts: 1,
        queuedAt: new Date(),
        sentAt: new Date(),
      },
      {
        userId: client.id,
        channel: NotificationChannel.in_app,
        type: "payment.created",
        title: "Платёж ожидает подтверждения",
        body: "Для консультации создан тестовый платёж.",
        dedupKey: "seed:payment-created:client",
        status: NotificationStatus.queued,
        attempts: 0,
        queuedAt: new Date(),
      },
      {
        userId: client.id,
        channel: NotificationChannel.email,
        type: "booking.created",
        title: "Подтверждение записи",
        body: "На вашу почту отправлено подтверждение записи на консультацию.",
        dedupKey: "seed:booking-created:client-email",
        status: NotificationStatus.queued,
        attempts: 0,
        queuedAt: new Date(),
      },
      {
        userId: client.id,
        channel: NotificationChannel.telegram,
        type: "booking.created",
        title: "Напоминание в Telegram",
        body: "Тестовое уведомление о записи готово к отправке в Telegram.",
        dedupKey: "seed:booking-created:client-telegram",
        status: NotificationStatus.queued,
        attempts: 0,
        queuedAt: new Date(),
        payloadJson: {
          telegramChatId: "123456789",
        },
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
