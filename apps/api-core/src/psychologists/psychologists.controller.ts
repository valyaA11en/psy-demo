import { Body, Controller, Get, Patch, Put, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { JwtUser } from "../auth/interfaces/jwt-user.interface";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { SetSpecializationsDto } from "./dto/set-specializations.dto";
import { UpdatePsychologistProfileDto } from "./dto/update-psychologist-profile.dto";
import { PsychologistsService } from "./psychologists.service";

@ApiTags("psychologists")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("psychologist")
@Controller("psychologists")
export class PsychologistsController {
  constructor(private readonly psychologistsService: PsychologistsService) {}

  @Get("me")
  async getMe(@CurrentUser() user: JwtUser) {
    return this.psychologistsService.getMe(user.sub);
  }

  @Patch("me")
  async updateMe(
    @CurrentUser() user: JwtUser,
    @Body() dto: UpdatePsychologistProfileDto,
    @Req() request: Request,
  ) {
    return this.psychologistsService.updateMe(user.sub, dto, request);
  }

  @Put("me/specializations")
  async setSpecializations(
    @CurrentUser() user: JwtUser,
    @Body() dto: SetSpecializationsDto,
    @Req() request: Request,
  ) {
    return this.psychologistsService.setSpecializations(user.sub, dto, request);
  }
}
