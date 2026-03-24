import {
  Body,
  Controller,
  Delete,
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
import { Roles } from "../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { AvailabilityService } from "./availability.service";
import { CreateAppointmentSlotDto } from "./dto/create-appointment-slot.dto";
import { CreateAvailabilityRuleDto } from "./dto/create-availability-rule.dto";
import { GenerateAppointmentSlotsDto } from "./dto/generate-appointment-slots.dto";
import { ListSlotsQueryDto } from "./dto/list-slots-query.dto";
import { UpdateAvailabilityRuleDto } from "./dto/update-availability-rule.dto";

@ApiTags("availability")
@Controller("availability")
export class AvailabilityController {
  constructor(private readonly availabilityService: AvailabilityService) {}

  @Get("psychologists/:slug/slots")
  async listPublicSlots(@Param("slug") slug: string, @Query() query: ListSlotsQueryDto) {
    return this.availabilityService.listPublicSlots(slug, query);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("psychologist")
  @Get("me/rules")
  async listMyRules(@CurrentUser() user: JwtUser) {
    return this.availabilityService.listMyRules(user.sub);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("psychologist")
  @Post("me/rules")
  async createRule(
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateAvailabilityRuleDto,
    @Req() request: Request,
  ) {
    return this.availabilityService.createRule(user.sub, dto, request);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("psychologist")
  @Patch("me/rules/:id")
  async updateRule(
    @CurrentUser() user: JwtUser,
    @Param("id", ParseUUIDPipe) ruleId: string,
    @Body() dto: UpdateAvailabilityRuleDto,
    @Req() request: Request,
  ) {
    return this.availabilityService.updateRule(user.sub, ruleId, dto, request);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("psychologist")
  @Delete("me/rules/:id")
  async deleteRule(
    @CurrentUser() user: JwtUser,
    @Param("id", ParseUUIDPipe) ruleId: string,
    @Req() request: Request,
  ) {
    return this.availabilityService.deleteRule(user.sub, ruleId, request);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("psychologist")
  @Get("me/slots")
  async listMySlots(@CurrentUser() user: JwtUser, @Query() query: ListSlotsQueryDto) {
    return this.availabilityService.listMySlots(user.sub, query);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("psychologist")
  @Post("me/slots")
  async createManualSlot(
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateAppointmentSlotDto,
    @Req() request: Request,
  ) {
    return this.availabilityService.createManualSlot(user.sub, dto, request);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("psychologist")
  @Delete("me/slots/:id")
  async cancelSlot(
    @CurrentUser() user: JwtUser,
    @Param("id", ParseUUIDPipe) slotId: string,
    @Req() request: Request,
  ) {
    return this.availabilityService.cancelSlot(user.sub, slotId, request);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("psychologist")
  @Post("me/slots/generate")
  async generateSlots(
    @CurrentUser() user: JwtUser,
    @Body() dto: GenerateAppointmentSlotsDto,
    @Req() request: Request,
  ) {
    return this.availabilityService.generateSlots(user.sub, dto, request);
  }
}
