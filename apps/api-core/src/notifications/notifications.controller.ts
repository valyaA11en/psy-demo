import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { JwtUser } from "../auth/interfaces/jwt-user.interface";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { ListNotificationsQueryDto } from "./dto/list-notifications-query.dto";
import { UpdateNotificationPreferencesDto } from "./dto/update-notification-preferences.dto";
import { NotificationsService } from "./notifications.service";

@ApiTags("notifications")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("notifications")
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get("me")
  async listMyNotifications(
    @CurrentUser() user: JwtUser,
    @Query() query: ListNotificationsQueryDto,
  ) {
    return this.notificationsService.listMyNotifications(user.sub, query);
  }

  @Get("me/preferences")
  async getMyPreferences(@CurrentUser() user: JwtUser) {
    return this.notificationsService.getMyPreferences(user.sub);
  }

  @Patch("me/preferences")
  async updateMyPreferences(
    @CurrentUser() user: JwtUser,
    @Body() dto: UpdateNotificationPreferencesDto,
    @Req() request: Request,
  ) {
    return this.notificationsService.updateMyPreferences(user.sub, dto, request);
  }

  @Post("me/preferences/telegram-link")
  async createTelegramLink(
    @CurrentUser() user: JwtUser,
    @Req() request: Request,
  ) {
    return this.notificationsService.createTelegramLink(user.sub, request);
  }

  @Post("me/read-all")
  async markAllRead(@CurrentUser() user: JwtUser) {
    return this.notificationsService.markAllRead(user.sub);
  }

  @Post(":id/read")
  async markRead(
    @CurrentUser() user: JwtUser,
    @Param("id", ParseUUIDPipe) notificationId: string,
  ) {
    return this.notificationsService.markRead(notificationId, user.sub);
  }
}
