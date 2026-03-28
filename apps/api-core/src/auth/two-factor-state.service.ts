import { createHash, randomBytes } from "node:crypto";
import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";

type LoginChallengeState = {
  userId: string;
  email: string;
  roles: string[];
  expiresAt: string;
};

type PendingSetupState = {
  secret: string;
  expiresAt: string;
};

type MemoryStateRecord = {
  payload: string;
  expiresAt: number;
};

@Injectable()
export class TwoFactorStateService implements OnModuleDestroy {
  private readonly logger = new Logger(TwoFactorStateService.name);
  private readonly redis: Redis | null;
  private readonly memoryState = new Map<string, MemoryStateRecord>();

  constructor(private readonly configService: ConfigService) {
    const redisUrl = this.configService.get<string>("REDIS_URL");

    if (!redisUrl) {
      this.redis = null;
      return;
    }

    this.redis = new Redis(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });

    this.redis.on("error", (error) => {
      this.logger.error(`two-factor state redis error: ${error.message}`);
    });
  }

  async createLoginChallenge(payload: {
    userId: string;
    email: string;
    roles: string[];
  }) {
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + this.getLoginChallengeTtlMs());

    await this.setJson(
      this.loginChallengeKey(token),
      {
        ...payload,
        expiresAt: expiresAt.toISOString(),
      },
      this.getLoginChallengeTtlSec(),
    );

    return {
      token,
      expiresAt,
    };
  }

  async getLoginChallenge(token: string) {
    return this.getJson<LoginChallengeState>(this.loginChallengeKey(token));
  }

  async deleteLoginChallenge(token: string) {
    await this.deleteKey(this.loginChallengeKey(token));
  }

  async storePendingSetup(userId: string, secret: string) {
    const expiresAt = new Date(Date.now() + this.getSetupTtlMs());

    await this.setJson(
      this.pendingSetupKey(userId),
      {
        secret,
        expiresAt: expiresAt.toISOString(),
      },
      this.getSetupTtlSec(),
    );

    return {
      expiresAt,
    };
  }

  async getPendingSetup(userId: string) {
    return this.getJson<PendingSetupState>(this.pendingSetupKey(userId));
  }

  async clearPendingSetup(userId: string) {
    await this.deleteKey(this.pendingSetupKey(userId));
  }

  async onModuleDestroy() {
    if (!this.redis) {
      return;
    }

    await this.redis.quit().catch(() => null);
  }

  private loginChallengeKey(token: string) {
    return `consultations:auth:2fa:login:${this.hashToken(token)}`;
  }

  private pendingSetupKey(userId: string) {
    return `consultations:auth:2fa:setup:${userId}`;
  }

  private hashToken(value: string) {
    return createHash("sha256").update(value).digest("hex");
  }

  private getLoginChallengeTtlSec() {
    return this.configService.get<number>("AUTH_2FA_CHALLENGE_TTL_SEC", 600);
  }

  private getLoginChallengeTtlMs() {
    return this.getLoginChallengeTtlSec() * 1000;
  }

  private getSetupTtlSec() {
    return this.configService.get<number>("AUTH_2FA_SETUP_TTL_SEC", 600);
  }

  private getSetupTtlMs() {
    return this.getSetupTtlSec() * 1000;
  }

  private async setJson(key: string, value: unknown, ttlSeconds: number) {
    const payload = JSON.stringify(value);

    if (this.redis) {
      await this.redis.set(key, payload, "EX", ttlSeconds);
      return;
    }

    this.memoryState.set(key, {
      payload,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  private async getJson<T>(key: string): Promise<T | null> {
    if (this.redis) {
      const payload = await this.redis.get(key);
      return payload ? (JSON.parse(payload) as T) : null;
    }

    const existing = this.memoryState.get(key);

    if (!existing) {
      return null;
    }

    if (existing.expiresAt <= Date.now()) {
      this.memoryState.delete(key);
      return null;
    }

    return JSON.parse(existing.payload) as T;
  }

  private async deleteKey(key: string) {
    if (this.redis) {
      await this.redis.del(key);
      return;
    }

    this.memoryState.delete(key);
  }
}
