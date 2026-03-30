import { Body, Controller, Get, Headers, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { JwtUser } from "../auth/interfaces/jwt-user.interface";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { ListMySessionPackagesQueryDto } from "./dto/list-my-session-packages-query.dto";
import { PurchaseSessionPackageDto } from "./dto/purchase-session-package.dto";
import { SessionPackagesService } from "./session-packages.service";

@ApiTags("session-packages")
@Controller("session-packages")
export class SessionPackagesController {
  constructor(private readonly sessionPackagesService: SessionPackagesService) {}

  @Get("offers/psychologists/:slug")
  async listPublicOffers(@Param("slug") slug: string) {
    return this.sessionPackagesService.listPublicOffers(slug);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("client")
  @Get("me")
  async listMyPackages(@CurrentUser() user: JwtUser, @Query() query: ListMySessionPackagesQueryDto) {
    return this.sessionPackagesService.listMyPackages(user.sub, query);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("client")
  @Post("purchases")
  async purchasePackage(
    @CurrentUser() user: JwtUser,
    @Body() dto: PurchaseSessionPackageDto,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Req() request: Request,
  ) {
    return this.sessionPackagesService.purchasePackage(user.sub, dto, idempotencyKey, request);
  }
}
