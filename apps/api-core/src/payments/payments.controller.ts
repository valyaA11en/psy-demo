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
import { CreatePaymentDto } from "./dto/create-payment.dto";
import { ListPaymentsQueryDto } from "./dto/list-payments-query.dto";
import { MockFailPaymentDto } from "./dto/mock-fail-payment.dto";
import { PaymentsService } from "./payments.service";

@ApiTags("payments")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("payments")
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("client")
  @Post()
  async createPayment(
    @CurrentUser() user: JwtUser,
    @Body() dto: CreatePaymentDto,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Req() request: Request,
  ) {
    return this.paymentsService.createPayment(user.sub, dto, idempotencyKey, request);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("client")
  @Get("me")
  async listMyPayments(@CurrentUser() user: JwtUser, @Query() query: ListPaymentsQueryDto) {
    return this.paymentsService.listClientPayments(user.sub, query);
  }

  @Get(":id")
  async getPayment(
    @CurrentUser() user: JwtUser,
    @Param("id", ParseUUIDPipe) paymentId: string,
  ) {
    return this.paymentsService.getPaymentById(paymentId, user.sub, user.roles);
  }

  @Post(":id/mock/confirm")
  async confirmPayment(
    @CurrentUser() user: JwtUser,
    @Param("id", ParseUUIDPipe) paymentId: string,
    @Req() request: Request,
  ) {
    return this.paymentsService.confirmMockPayment(paymentId, user.sub, user.roles, request);
  }

  @Post(":id/mock/fail")
  async failPayment(
    @CurrentUser() user: JwtUser,
    @Param("id", ParseUUIDPipe) paymentId: string,
    @Body() dto: MockFailPaymentDto,
    @Req() request: Request,
  ) {
    return this.paymentsService.failMockPayment(paymentId, user.sub, user.roles, dto, request);
  }

  @Post(":id/mock/cancel")
  async cancelPayment(
    @CurrentUser() user: JwtUser,
    @Param("id", ParseUUIDPipe) paymentId: string,
    @Req() request: Request,
  ) {
    return this.paymentsService.cancelMockPayment(paymentId, user.sub, user.roles, request);
  }
}
