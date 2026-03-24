import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
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
import { BookingsService } from "./bookings.service";
import { CancelBookingDto } from "./dto/cancel-booking.dto";
import { CreateBookingDto } from "./dto/create-booking.dto";
import { ListBookingsQueryDto } from "./dto/list-bookings-query.dto";

@ApiTags("bookings")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("bookings")
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("client")
  @Post()
  async createBooking(
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateBookingDto,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Req() request: Request,
  ) {
    return this.bookingsService.createBooking(user.sub, dto, idempotencyKey, request);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("client")
  @Get("me")
  async listMyBookings(@CurrentUser() user: JwtUser, @Query() query: ListBookingsQueryDto) {
    return this.bookingsService.listClientBookings(user.sub, query);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("psychologist")
  @Get("psychologist/me")
  async listPsychologistBookings(@CurrentUser() user: JwtUser, @Query() query: ListBookingsQueryDto) {
    return this.bookingsService.listPsychologistBookings(user.sub, query);
  }

  @Get(":id")
  async getBooking(
    @CurrentUser() user: JwtUser,
    @Param("id", ParseUUIDPipe) bookingId: string,
  ) {
    return this.bookingsService.getBookingById(bookingId, user.sub, user.roles);
  }

  @Post(":id/cancel")
  async cancelBooking(
    @CurrentUser() user: JwtUser,
    @Param("id", ParseUUIDPipe) bookingId: string,
    @Body() dto: CancelBookingDto,
    @Req() request: Request,
  ) {
    return this.bookingsService.cancelBooking(bookingId, user.sub, user.roles, dto, request);
  }

  @Post(":id/complete")
  async completeBooking(
    @CurrentUser() user: JwtUser,
    @Param("id", ParseUUIDPipe) bookingId: string,
    @Req() request: Request,
  ) {
    return this.bookingsService.completeBooking(bookingId, user.sub, user.roles, request);
  }
}
