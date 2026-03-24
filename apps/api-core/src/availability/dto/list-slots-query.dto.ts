import { ApiPropertyOptional } from "@nestjs/swagger";
import { AppointmentSlotStatus } from "@prisma/client";
import { Type } from "class-transformer";
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

export class ListSlotsQueryDto {
  @ApiPropertyOptional({ example: "2026-03-24" })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ example: "2026-04-07" })
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional({ example: "Asia/Yekaterinburg" })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  @ApiPropertyOptional({ enum: AppointmentSlotStatus })
  @IsOptional()
  @IsEnum(AppointmentSlotStatus)
  status?: AppointmentSlotStatus;

  @ApiPropertyOptional({ default: 50 })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 50;
}
