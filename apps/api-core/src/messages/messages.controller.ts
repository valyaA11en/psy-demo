import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { JwtUser } from "../auth/interfaces/jwt-user.interface";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { ListThreadQueryDto } from "./dto/list-thread-query.dto";
import { SendMessageDto } from "./dto/send-message.dto";
import { MessagesService } from "./messages.service";

@ApiTags("messages")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("client", "psychologist")
@Controller("messages")
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get("me/thread/:counterpartUserId")
  async getThread(
    @CurrentUser() user: JwtUser,
    @Param("counterpartUserId") counterpartUserId: string,
    @Query() query: ListThreadQueryDto,
  ) {
    return this.messagesService.getThread(user.sub, user.roles, counterpartUserId, query);
  }

  @Post()
  async sendMessage(
    @CurrentUser() user: JwtUser,
    @Body() dto: SendMessageDto,
    @Req() request: Request,
  ) {
    return this.messagesService.sendMessage(user.sub, user.roles, dto, request);
  }

  @Post("me/thread/:counterpartUserId/read")
  async markThreadRead(
    @CurrentUser() user: JwtUser,
    @Param("counterpartUserId") counterpartUserId: string,
    @Req() request: Request,
  ) {
    return this.messagesService.markThreadRead(user.sub, user.roles, counterpartUserId, request);
  }
}
