import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { JwtUser } from "../auth/interfaces/jwt-user.interface";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { CreateReviewDto } from "./dto/create-review.dto";
import { ListPublicReviewsQueryDto } from "./dto/list-public-reviews-query.dto";
import { ReviewsService } from "./reviews.service";

@ApiTags("reviews")
@Controller("reviews")
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get("psychologists/:slug")
  async listPublicPsychologistReviews(
    @Param("slug") slug: string,
    @Query() query: ListPublicReviewsQueryDto,
  ) {
    return this.reviewsService.listPublicPsychologistReviews(slug, query);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("client")
  @Post()
  async createReview(
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateReviewDto,
    @Req() request: Request,
  ) {
    return this.reviewsService.createReview(user.sub, dto, request);
  }
}
