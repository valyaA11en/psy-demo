import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { JwtUser } from "../auth/interfaces/jwt-user.interface";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { ListMoodEntriesQueryDto } from "./dto/list-mood-entries-query.dto";
import { UpsertMoodEntryDto } from "./dto/upsert-mood-entry.dto";
import { MoodEntriesService } from "./mood-entries.service";

@ApiTags("mood-entries")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("mood-entries")
export class MoodEntriesController {
  constructor(private readonly moodEntriesService: MoodEntriesService) {}

  @Get("me")
  @Roles("client")
  async listMyEntries(@CurrentUser() user: JwtUser, @Query() query: ListMoodEntriesQueryDto) {
    return this.moodEntriesService.listClientEntries(user.sub, query);
  }

  @Post("me")
  @Roles("client")
  async upsertMyEntry(
    @CurrentUser() user: JwtUser,
    @Body() dto: UpsertMoodEntryDto,
    @Req() request: Request,
  ) {
    return this.moodEntriesService.upsertClientEntry(user.sub, dto, request);
  }

  @Get("psychologist/client/:clientUserId")
  @Roles("psychologist")
  async listClientEntriesForPsychologist(
    @CurrentUser() user: JwtUser,
    @Param("clientUserId") clientUserId: string,
    @Query() query: ListMoodEntriesQueryDto,
  ) {
    return this.moodEntriesService.listPsychologistClientEntries(user.sub, clientUserId, query);
  }
}
