import {
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { JwtUser } from "../auth/interfaces/jwt-user.interface";
import { UpdateMeDto } from "./dto/update-me.dto";
import { UsersService } from "./users.service";
import { Body } from "@nestjs/common";

@ApiTags("users")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get("me")
  async getMe(@CurrentUser() user: JwtUser) {
    return this.usersService.getCurrentUser(user.sub);
  }

  @Patch("me")
  async updateMe(
    @CurrentUser() user: JwtUser,
    @Body() dto: UpdateMeDto,
    @Req() request: Request,
  ) {
    return this.usersService.updateCurrentUser(user.sub, user.roles, dto, request);
  }

  @Get("me/sessions")
  async listMySessions(@CurrentUser() user: JwtUser) {
    return this.usersService.listSessions(user.sub, user.sessionId);
  }

  @Delete("me/sessions/:id")
  async revokeSession(
    @CurrentUser() user: JwtUser,
    @Param("id") sessionId: string,
    @Req() request: Request,
  ) {
    return this.usersService.revokeSession(user.sub, sessionId, user.roles, request);
  }
}
