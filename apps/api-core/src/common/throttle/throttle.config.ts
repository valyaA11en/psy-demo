import type { ExecutionContext } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import type { ThrottlerModuleOptions } from "@nestjs/throttler";

const THROTTLER_LIMIT_METADATA_PREFIX = "THROTTLER:LIMIT";
const THROTTLER_TTL_METADATA_PREFIX = "THROTTLER:TTL";

export function hasNamedThrottleMetadata(context: ExecutionContext, name: string) {
  const handler = context.getHandler();
  const classRef = context.getClass();

  return (
    Reflect.hasMetadata(`${THROTTLER_LIMIT_METADATA_PREFIX}${name}`, handler) ||
    Reflect.hasMetadata(`${THROTTLER_TTL_METADATA_PREFIX}${name}`, handler) ||
    Reflect.hasMetadata(`${THROTTLER_LIMIT_METADATA_PREFIX}${name}`, classRef) ||
    Reflect.hasMetadata(`${THROTTLER_TTL_METADATA_PREFIX}${name}`, classRef)
  );
}

export function createThrottlerOptions(configService: Pick<ConfigService, "get">): ThrottlerModuleOptions {
  return {
    throttlers: [
      {
        name: "default",
        ttl: configService.get<number>("THROTTLE_TTL", 60) * 1000,
        limit: configService.get<number>("THROTTLE_LIMIT", 20),
      },
      {
        name: "auth",
        ttl: configService.get<number>("AUTH_THROTTLE_TTL", 60) * 1000,
        limit: configService.get<number>("AUTH_THROTTLE_LIMIT", 5),
        setHeaders: false,
        skipIf: (context: ExecutionContext) => !hasNamedThrottleMetadata(context, "auth"),
      },
      {
        name: "webhook",
        ttl: configService.get<number>("WEBHOOK_THROTTLE_TTL", 60) * 1000,
        limit: configService.get<number>("WEBHOOK_THROTTLE_LIMIT", 15),
        setHeaders: false,
        skipIf: (context: ExecutionContext) => !hasNamedThrottleMetadata(context, "webhook"),
      },
    ],
  };
}
