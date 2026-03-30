import { createHash } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { Prisma } from "prisma-client-generated";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(input: {
    actorUserId?: string | null;
    actorRole?: string | null;
    action: string;
    entityType: string;
    entityId: string;
    requestId?: string | null;
    ip?: string | null;
    userAgent?: string | null;
    metadataJson?: Record<string, unknown> | null;
  }) {
    await this.prisma.auditLog.create({
      data: {
        actorUserId: input.actorUserId ?? null,
        actorRole: input.actorRole ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        requestId: input.requestId ?? null,
        ipHash: input.ip ? this.hash(input.ip) : null,
        userAgentHash: input.userAgent ? this.hash(input.userAgent) : null,
        metadataJson: (input.metadataJson as Prisma.InputJsonValue | undefined) ?? undefined,
      },
    });
  }

  private hash(value: string) {
    return createHash("sha256").update(value).digest("hex");
  }
}
