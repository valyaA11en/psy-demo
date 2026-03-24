import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsBoolean, IsOptional, IsString, Matches, MaxLength } from "class-validator";

export class UpdateNotificationPreferencesDto {
  @ApiPropertyOptional()
  @Type(() => Boolean)
  @IsOptional()
  @IsBoolean()
  inAppEnabled?: boolean;

  @ApiPropertyOptional()
  @Type(() => Boolean)
  @IsOptional()
  @IsBoolean()
  emailEnabled?: boolean;

  @ApiPropertyOptional()
  @Type(() => Boolean)
  @IsOptional()
  @IsBoolean()
  telegramEnabled?: boolean;

  @ApiPropertyOptional()
  @Type(() => Boolean)
  @IsOptional()
  @IsBoolean()
  bookingUpdatesEnabled?: boolean;

  @ApiPropertyOptional()
  @Type(() => Boolean)
  @IsOptional()
  @IsBoolean()
  paymentUpdatesEnabled?: boolean;

  @ApiPropertyOptional()
  @Type(() => Boolean)
  @IsOptional()
  @IsBoolean()
  sessionUpdatesEnabled?: boolean;

  @ApiPropertyOptional()
  @Type(() => Boolean)
  @IsOptional()
  @IsBoolean()
  systemUpdatesEnabled?: boolean;

  @ApiPropertyOptional({
    description: "Telegram chat id для персональных уведомлений. Поддерживается числовой chat id.",
    example: "123456789",
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Matches(/^-?\d{5,32}$/)
  telegramChatId?: string | null;

  @ApiPropertyOptional({
    description: "Разорвать привязку Telegram и отключить telegram-уведомления.",
  })
  @Type(() => Boolean)
  @IsOptional()
  @IsBoolean()
  unlinkTelegram?: boolean;
}
