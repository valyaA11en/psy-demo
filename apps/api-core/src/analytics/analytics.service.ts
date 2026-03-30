import { Injectable, NotFoundException } from "@nestjs/common";
import { ConsultationStatus } from "prisma-client-generated";
import { PrismaService } from "../prisma/prisma.service";
import { GetPsychologistAnalyticsQueryDto } from "./dto/get-psychologist-analytics-query.dto";

type MonthlyBucket = {
  monthKey: string;
  label: string;
  completedSessions: number;
  scheduledSessions: number;
  cancelledSessions: number;
  grossRevenue: number;
  currency: string;
};

const monthLabelFormatter = new Intl.DateTimeFormat("ru-RU", {
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getPsychologistAnalytics(psychologistUserId: string, query: GetPsychologistAnalyticsQueryDto) {
    const months = this.normalizeMonths(query.months);
    const now = new Date();
    const periodEnd = now;
    const currentMonthStart = this.startOfUtcMonth(now);
    const periodStart = this.addUtcMonths(currentMonthStart, -(months - 1));
    const activeClientsSince = this.addUtcDays(now, -90);
    const moodTrackedSince = this.addUtcDays(now, -30);

    const profile = await this.prisma.user.findFirst({
      where: {
        id: psychologistUserId,
        psychologistProfile: {
          isNot: null,
        },
      },
      select: {
        id: true,
        psychologistProfile: {
          select: {
            publicSlug: true,
            firstName: true,
            lastName: true,
            publicTitle: true,
            ratingAvg: true,
            reviewsCount: true,
            specializations: {
              select: {
                specialization: {
                  select: {
                    id: true,
                    slug: true,
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!profile?.psychologistProfile) {
      throw new NotFoundException("Психолог не найден");
    }

    const [consultations, payments, homeworkTasks, unreadMessagesCount, periodReviews, activeClients] = await Promise.all([
      this.prisma.consultation.findMany({
        where: {
          psychologistUserId,
          scheduledAt: {
            gte: periodStart,
            lte: periodEnd,
          },
        },
        select: {
          id: true,
          clientUserId: true,
          status: true,
          scheduledAt: true,
        },
        orderBy: {
          scheduledAt: "asc",
        },
      }),
      this.prisma.payment.findMany({
        where: {
          status: "succeeded",
          paidAt: {
            gte: periodStart,
            lte: periodEnd,
          },
          consultation: {
            psychologistUserId,
          },
        },
        select: {
          amount: true,
          currency: true,
          paidAt: true,
        },
        orderBy: {
          paidAt: "asc",
        },
      }),
      this.prisma.homeworkTask.findMany({
        where: {
          psychologistUserId,
          createdAt: {
            gte: periodStart,
            lte: periodEnd,
          },
        },
        select: {
          status: true,
          dueAt: true,
        },
      }),
      this.prisma.chatMessage.count({
        where: {
          psychologistUserId,
          senderUserId: {
            not: psychologistUserId,
          },
          readAt: null,
        },
      }),
      this.prisma.review.findMany({
        where: {
          psychologistUserId,
          status: "published",
          createdAt: {
            gte: periodStart,
            lte: periodEnd,
          },
        },
        select: {
          rating: true,
        },
      }),
      this.prisma.consultation.findMany({
        where: {
          psychologistUserId,
          scheduledAt: {
            gte: activeClientsSince,
          },
        },
        select: {
          clientUserId: true,
        },
        distinct: ["clientUserId"],
      }),
    ]);

    const moodTrackedClients = activeClients.length
      ? await this.prisma.moodEntry.findMany({
          where: {
            clientUserId: {
              in: activeClients.map((item) => item.clientUserId),
            },
            recordedForDate: {
              gte: moodTrackedSince,
            },
          },
          select: {
            clientUserId: true,
          },
          distinct: ["clientUserId"],
        })
      : [];

    const monthly = this.createMonthlyBuckets(periodStart, months, payments[0]?.currency ?? "RUB");
    const monthlyMap = new Map(monthly.map((bucket) => [bucket.monthKey, bucket]));

    let completedSessions = 0;
    let scheduledSessions = 0;
    let cancelledSessions = 0;

    const uniqueClients = new Set<string>();

    for (const consultation of consultations) {
      uniqueClients.add(consultation.clientUserId);

      const monthKey = this.toMonthKey(consultation.scheduledAt);
      const bucket = monthlyMap.get(monthKey);

      if (consultation.status === ConsultationStatus.completed) {
        completedSessions += 1;
        if (bucket) {
          bucket.completedSessions += 1;
        }
        continue;
      }

      if (consultation.status === ConsultationStatus.scheduled) {
        scheduledSessions += 1;
        if (bucket) {
          bucket.scheduledSessions += 1;
        }
        continue;
      }

      cancelledSessions += 1;
      if (bucket) {
        bucket.cancelledSessions += 1;
      }
    }

    let grossRevenue = 0;
    for (const payment of payments) {
      grossRevenue += payment.amount;
      const monthKey = this.toMonthKey(payment.paidAt ?? periodEnd);
      const bucket = monthlyMap.get(monthKey);
      if (bucket) {
        bucket.grossRevenue += payment.amount;
        bucket.currency = payment.currency;
      }
    }

    const completedHomeworkTasks = homeworkTasks.filter((task) => task.status === "completed").length;
    const assignedHomeworkTasks = homeworkTasks.filter((task) => task.status === "assigned").length;
    const overdueHomeworkTasks = homeworkTasks.filter(
      (task) => task.status === "assigned" && Boolean(task.dueAt && task.dueAt < now),
    ).length;
    const homeworkCompletionRate =
      homeworkTasks.length > 0 ? Number(((completedHomeworkTasks / homeworkTasks.length) * 100).toFixed(1)) : 0;
    const periodAverageRating =
      periodReviews.length > 0
        ? Number((periodReviews.reduce((sum, review) => sum + review.rating, 0) / periodReviews.length).toFixed(1))
        : null;

    return {
      psychologist: {
        userId: profile.id,
        fullName: `${profile.psychologistProfile.firstName} ${profile.psychologistProfile.lastName}`.trim(),
        publicSlug: profile.psychologistProfile.publicSlug,
        publicTitle: profile.psychologistProfile.publicTitle,
        ratingAvg: profile.psychologistProfile.ratingAvg ? Number(profile.psychologistProfile.ratingAvg) : 0,
        reviewsCount: profile.psychologistProfile.reviewsCount,
        specializations: profile.psychologistProfile.specializations.map((item) => item.specialization),
      },
      period: {
        months,
        from: periodStart.toISOString(),
        to: periodEnd.toISOString(),
      },
      summary: {
        completedSessions,
        scheduledSessions,
        cancelledSessions,
        uniqueClients: uniqueClients.size,
        grossRevenue,
        revenueCurrency: payments[0]?.currency ?? "RUB",
        succeededPayments: payments.length,
        averageRating: profile.psychologistProfile.ratingAvg ? Number(profile.psychologistProfile.ratingAvg) : 0,
        reviewsCount: profile.psychologistProfile.reviewsCount,
        periodReviewCount: periodReviews.length,
        periodAverageRating,
        homeworkAssigned: homeworkTasks.length,
        homeworkCompleted: completedHomeworkTasks,
        homeworkCompletionRate,
      },
      engagement: {
        activeClientsLast90Days: activeClients.length,
        clientsWithMoodEntriesLast30Days: moodTrackedClients.length,
        unreadMessagesCount,
        activeHomeworkTasks: assignedHomeworkTasks,
        overdueHomeworkTasks,
      },
      monthly,
    };
  }

  private normalizeMonths(value: number | undefined) {
    if (!value) {
      return 6;
    }

    return Math.min(12, Math.max(1, Math.trunc(value)));
  }

  private createMonthlyBuckets(periodStart: Date, months: number, currency: string): MonthlyBucket[] {
    return Array.from({ length: months }, (_, index) => {
      const monthDate = this.addUtcMonths(periodStart, index);

      return {
        monthKey: this.toMonthKey(monthDate),
        label: monthLabelFormatter.format(monthDate),
        completedSessions: 0,
        scheduledSessions: 0,
        cancelledSessions: 0,
        grossRevenue: 0,
        currency,
      };
    });
  }

  private startOfUtcMonth(value: Date) {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1, 0, 0, 0, 0));
  }

  private addUtcMonths(value: Date, diff: number) {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + diff, 1, 0, 0, 0, 0));
  }

  private addUtcDays(value: Date, diff: number) {
    return new Date(value.getTime() + diff * 24 * 60 * 60 * 1000);
  }

  private toMonthKey(value: Date) {
    return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}`;
  }
}
