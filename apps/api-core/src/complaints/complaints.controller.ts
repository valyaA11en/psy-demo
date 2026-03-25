import { Body, Controller, Get, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { JwtUser } from "../auth/interfaces/jwt-user.interface";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { ComplaintsService } from "./complaints.service";
import { CreateComplaintDto } from "./dto/create-complaint.dto";
import { ListMyComplaintsQueryDto } from "./dto/list-my-complaints-query.dto";

@ApiTags("complaints")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("client", "psychologist")
@Controller("complaints")
export class ComplaintsController {
  constructor(private readonly complaintsService: ComplaintsService) {}

  @Get("me")
  async listMyComplaints(@CurrentUser() user: JwtUser, @Query() query: ListMyComplaintsQueryDto) {
    return this.complaintsService.listMyComplaints(user.sub, query);
  }

  @Post()
  async createComplaint(
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateComplaintDto,
    @Req() request: Request,
  ) {
    return this.complaintsService.createComplaint(user.sub, user.roles, dto, request);
  }
}
