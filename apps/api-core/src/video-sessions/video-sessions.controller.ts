import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { JwtUser } from "../auth/interfaces/jwt-user.interface";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { VideoSessionsService } from "./video-sessions.service";

@ApiTags("video-sessions")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("video-sessions")
export class VideoSessionsController {
  constructor(private readonly videoSessionsService: VideoSessionsService) {}

  @Get(":consultationId")
  async getSession(
    @CurrentUser() user: JwtUser,
    @Param("consultationId", ParseUUIDPipe) consultationId: string,
  ) {
    return this.videoSessionsService.getSession(consultationId, user.sub, user.roles);
  }

  @Post(":consultationId/access")
  async issueAccess(
    @CurrentUser() user: JwtUser,
    @Param("consultationId", ParseUUIDPipe) consultationId: string,
    @Req() request: Request,
  ) {
    return this.videoSessionsService.issueAccess(consultationId, user.sub, user.roles, request);
  }
}
