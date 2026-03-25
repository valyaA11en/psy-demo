import { timingSafeEqual } from "node:crypto";
import {
  Body,
  Controller,
  ForbiddenException,
  Headers,
  Post,
  Req,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiExcludeController } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import type { Request } from "express";
import { ConsumeTelegramLinkDto } from "./dto/consume-telegram-link.dto";
import { NotificationsService } from "./notifications.service";

@ApiExcludeController()
@Controller("internal/telegram-link")
export class NotificationsInternalController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly configService: ConfigService,
  ) {}

  @Throttle({ webhook: {} })
  @Post("consume")
  async consumeTelegramLink(
    @Headers("x-webhook-secret") webhookSecret: string | undefined,
    @Body() dto: ConsumeTelegramLinkDto,
    @Req() request: Request,
  ) {
    const expectedSecret = this.configService.get<string>("WEBHOOK_SIGNING_SECRET");
    if (!this.isValidWebhookSecret(webhookSecret, expectedSecret)) {
      throw new ForbiddenException("Недопустимый webhook secret");
    }

    return this.notificationsService.consumeTelegramLink(dto, request);
  }

  private isValidWebhookSecret(
    receivedSecret: string | undefined,
    expectedSecret: string | undefined,
  ) {
    if (!receivedSecret || !expectedSecret) {
      return false;
    }

    const receivedBuffer = Buffer.from(receivedSecret, "utf8");
    const expectedBuffer = Buffer.from(expectedSecret, "utf8");

    if (receivedBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return timingSafeEqual(receivedBuffer, expectedBuffer);
  }
}
