import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { JwtUser } from "./interfaces/jwt-user.interface";
import { AuthService } from "./auth.service";
import { DisableTwoFactorDto } from "./dto/disable-two-factor.dto";
import { EnableTwoFactorDto } from "./dto/enable-two-factor.dto";
import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";
import { ResendEmailVerificationDto } from "./dto/resend-email-verification.dto";
import { VerifyEmailDto } from "./dto/verify-email.dto";
import { VerifyTwoFactorLoginDto } from "./dto/verify-two-factor-login.dto";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Throttle({ auth: {} })
  @Post("register")
  async register(
    @Body() dto: RegisterDto,
    @Req() request: Request,
  ) {
    return this.authService.register(dto, request);
  }

  @Throttle({ auth: {} })
  @HttpCode(HttpStatus.OK)
  @Post("verify-email")
  async verifyEmail(
    @Body() dto: VerifyEmailDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.authService.verifyEmail(dto, request, response);
  }

  @Throttle({ auth: {} })
  @HttpCode(HttpStatus.OK)
  @Post("resend-verification")
  async resendVerification(
    @Body() dto: ResendEmailVerificationDto,
    @Req() request: Request,
  ) {
    return this.authService.resendEmailVerification(dto, request);
  }

  @Throttle({ auth: {} })
  @HttpCode(HttpStatus.OK)
  @Post("login")
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.authService.login(dto, request, response);
  }

  @Throttle({ auth: {} })
  @HttpCode(HttpStatus.OK)
  @Post("2fa/verify-login")
  async verifyTwoFactorLogin(
    @Body() dto: VerifyTwoFactorLoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.authService.verifyTwoFactorLogin(dto, request, response);
  }

  @Throttle({ auth: {} })
  @HttpCode(HttpStatus.OK)
  @Post("refresh")
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.authService.refresh(request, response);
  }

  @HttpCode(HttpStatus.OK)
  @Post("logout")
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.authService.logout(request, response);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get("2fa")
  async getTwoFactorStatus(@CurrentUser() user: JwtUser) {
    return this.authService.getTwoFactorStatus(user.sub);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post("2fa/setup")
  async startTwoFactorSetup(
    @CurrentUser() user: JwtUser,
    @Req() request: Request,
  ) {
    return this.authService.startTwoFactorSetup(user.sub, user.roles, request);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post("2fa/enable")
  async enableTwoFactor(
    @CurrentUser() user: JwtUser,
    @Body() dto: EnableTwoFactorDto,
    @Req() request: Request,
  ) {
    return this.authService.enableTwoFactor(user.sub, user.sessionId, user.roles, dto, request);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post("2fa/disable")
  async disableTwoFactor(
    @CurrentUser() user: JwtUser,
    @Body() dto: DisableTwoFactorDto,
    @Req() request: Request,
  ) {
    return this.authService.disableTwoFactor(user.sub, user.sessionId, user.roles, dto, request);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post("logout-all")
  async logoutAll(
    @CurrentUser() user: JwtUser,
    @Req() request: Request,
  ) {
    return this.authService.logoutAll(user.sub, request, user.roles[0] ?? null);
  }
}
