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

  @Post("consume")
  async consumeTelegramLink(
    @Headers("x-webhook-secret") webhookSecret: string | undefined,
    @Body() dto: ConsumeTelegramLinkDto,
    @Req() request: Request,
  ) {
    const expectedSecret = this.configService.get<string>("WEBHOOK_SIGNING_SECRET");
    if (!expectedSecret || webhookSecret !== expectedSecret) {
      throw new ForbiddenException("Недопустимый webhook secret");
    }

    return this.notificationsService.consumeTelegramLink(dto, request);
  }
}
