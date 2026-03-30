import { Injectable } from "@nestjs/common";
import {
  AppointmentSlotStatus,
  Prisma,
  PsychologistApprovalStatus,
} from "prisma-client-generated";
import { DateTime } from "luxon";
import { PrismaService } from "../prisma/prisma.service";
import { ListPsychologistsQueryDto } from "./dto/list-psychologists-query.dto";

const publicPsychologistInclude = {
  specializations: {
    include: {
      specialization: true,
    },
  },
} satisfies Prisma.PsychologistProfileInclude;

type PublicPsychologistRecord = Prisma.PsychologistProfileGetPayload<{
  include: typeof publicPsychologistInclude;
}>;

type UpcomingSlotRecord = {
  psychologistProfileId: string;
  startsAt: Date;
  endsAt: Date;
};

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async listPsychologists(query: ListPsychologistsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 12;
    const skip = (page - 1) * limit;
    const where = this.buildWhere(query);

    const [items, total] = await this.prisma.$transaction([
      this.prisma.psychologistProfile.findMany({
        where,
        include: publicPsychologistInclude,
        orderBy: this.buildOrderBy(query.sort),
        skip,
        take: limit,
      }),
      this.prisma.psychologistProfile.count({ where }),
    ]);

    const upcomingSlotsByPsychologist = await this.getUpcomingSlotsMap(items.map((item) => item.userId), 3);

    return {
      items: items.map((item) =>
        this.serializePublicPsychologist(item, {
          upcomingSlots: upcomingSlotsByPsychologist.get(item.userId) ?? [],
        }),
      ),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
      filters: {
        q: query.q ?? null,
        specialization: query.specialization ?? null,
        language: query.language ?? null,
        format: query.format ?? null,
        priceMin: query.priceMin ?? null,
        priceMax: query.priceMax ?? null,
        sort: query.sort ?? "rating_desc",
      },
    };
  }

  async getPsychologistBySlug(slug: string) {
    const profile = await this.prisma.psychologistProfile.findFirst({
      where: {
        publicSlug: slug,
        approvalStatus: PsychologistApprovalStatus.approved,
      },
      include: publicPsychologistInclude,
    });

    if (!profile) {
      return null;
    }

    const upcomingSlotsByPsychologist = await this.getUpcomingSlotsMap([profile.userId], 5);

    return this.serializePublicPsychologist(profile, {
      includeBio: true,
      upcomingSlots: upcomingSlotsByPsychologist.get(profile.userId) ?? [],
    });
  }

  async listSpecializations() {
    const items = await this.prisma.specialization.findMany({
      where: {
        isActive: true,
      },
      orderBy: {
        name: "asc",
      },
    });

    return items.map((item) => ({
      id: item.id,
      slug: item.slug,
      name: item.name,
    }));
  }

  private buildWhere(query: ListPsychologistsQueryDto): Prisma.PsychologistProfileWhereInput {
    const and: Prisma.PsychologistProfileWhereInput[] = [
      {
        approvalStatus: PsychologistApprovalStatus.approved,
      },
    ];

    if (query.q) {
      and.push({
        OR: [
          {
            firstName: {
              contains: query.q,
              mode: "insensitive",
            },
          },
          {
            lastName: {
              contains: query.q,
              mode: "insensitive",
            },
          },
          {
            publicTitle: {
              contains: query.q,
              mode: "insensitive",
            },
          },
          {
            bio: {
              contains: query.q,
              mode: "insensitive",
            },
          },
        ],
      });
    }

    if (query.specialization) {
      and.push({
        specializations: {
          some: {
            specialization: {
              slug: query.specialization,
            },
          },
        },
      });
    }

    if (query.language) {
      and.push({
        languagesJson: {
          array_contains: [query.language],
        },
      });
    }

    if (query.format) {
      and.push({
        formatsJson: {
          array_contains: [query.format],
        },
      });
    }

    if (typeof query.priceMin !== "undefined") {
      and.push({
        OR: [
          { priceTo: null },
          {
            priceTo: {
              gte: query.priceMin,
            },
          },
        ],
      });
    }

    if (typeof query.priceMax !== "undefined") {
      and.push({
        OR: [
          { priceFrom: null },
          {
            priceFrom: {
              lte: query.priceMax,
            },
          },
        ],
      });
    }

    return { AND: and };
  }

  private buildOrderBy(sort?: ListPsychologistsQueryDto["sort"]): Prisma.PsychologistProfileOrderByWithRelationInput[] {
    switch (sort) {
      case "price_asc":
        return [{ priceFrom: "asc" }, { ratingAvg: "desc" }, { createdAt: "desc" }];
      case "price_desc":
        return [{ priceFrom: "desc" }, { ratingAvg: "desc" }, { createdAt: "desc" }];
      case "experience_desc":
        return [{ experienceYears: "desc" }, { ratingAvg: "desc" }, { createdAt: "desc" }];
      case "latest":
        return [{ createdAt: "desc" }];
      case "rating_desc":
      default:
        return [{ ratingAvg: "desc" }, { reviewsCount: "desc" }, { createdAt: "desc" }];
    }
  }

  private async getUpcomingSlotsMap(psychologistIds: string[], perPsychologistLimit: number) {
    if (psychologistIds.length === 0) {
      return new Map<string, UpcomingSlotRecord[]>();
    }

    const now = DateTime.utc();
    const horizon = now.plus({ days: 30 });
    const slots = await this.prisma.appointmentSlot.findMany({
      where: {
        psychologistProfileId: {
          in: psychologistIds,
        },
        status: AppointmentSlotStatus.open,
        startsAt: {
          gte: now.toJSDate(),
          lte: horizon.toJSDate(),
        },
      },
      orderBy: [{ psychologistProfileId: "asc" }, { startsAt: "asc" }],
      select: {
        psychologistProfileId: true,
        startsAt: true,
        endsAt: true,
      },
    });

    const result = new Map<string, UpcomingSlotRecord[]>();

    for (const slot of slots) {
      const bucket = result.get(slot.psychologistProfileId) ?? [];
      if (bucket.length < perPsychologistLimit) {
        bucket.push(slot);
        result.set(slot.psychologistProfileId, bucket);
      }
    }

    return result;
  }

  private serializePublicPsychologist(
    profile: PublicPsychologistRecord,
    options?: { includeBio?: boolean; upcomingSlots?: UpcomingSlotRecord[] },
  ) {
    const upcomingSlots = options?.upcomingSlots ?? [];
    return {
      id: profile.userId,
      slug: profile.publicSlug,
      firstName: profile.firstName,
      lastName: profile.lastName,
      fullName: `${profile.firstName} ${profile.lastName}`.trim(),
      publicTitle: profile.publicTitle,
      bio: options?.includeBio ? profile.bio : undefined,
      experienceYears: profile.experienceYears,
      priceFrom: profile.priceFrom,
      priceTo: profile.priceTo,
      languages: Array.isArray(profile.languagesJson) ? profile.languagesJson : [],
      formats: Array.isArray(profile.formatsJson) ? profile.formatsJson : [],
      ratingAvg: profile.ratingAvg ? Number(profile.ratingAvg) : 0,
      reviewsCount: profile.reviewsCount,
      specializations: profile.specializations.map((item) => ({
        id: item.specialization.id,
        slug: item.specialization.slug,
        name: item.specialization.name,
      })),
      nextAvailableAt: upcomingSlots[0]?.startsAt.toISOString() ?? null,
      upcomingSlots: upcomingSlots.map((slot) => ({
        startsAt: slot.startsAt.toISOString(),
        endsAt: slot.endsAt.toISOString(),
      })),
    };
  }
}
