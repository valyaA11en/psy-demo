import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtUser } from "../auth/interfaces/jwt-user.interface";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { AnalyticsService } from "./analytics.service";
import { GetPsychologistAnalyticsQueryDto } from "./dto/get-psychologist-analytics-query.dto";

@ApiTags("analytics")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("analytics")
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get("psychologist/me")
  @Roles("psychologist")
  async getPsychologistAnalytics(
    @CurrentUser() user: JwtUser,
    @Query() query: GetPsychologistAnalyticsQueryDto,
  ) {
    return this.analyticsService.getPsychologistAnalytics(user.sub, query);
  }
}
