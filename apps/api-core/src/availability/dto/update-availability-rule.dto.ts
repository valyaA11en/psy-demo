import { ApiPropertyOptional } from "@nestjs/swagger";
import { Weekday } from "prisma-client-generated";
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Matches, Max, Min } from "class-validator";

export class UpdateAvailabilityRuleDto {
  @ApiPropertyOptional({ enum: Weekday })
  @IsOptional()
  @IsEnum(Weekday)
  weekday?: Weekday;

  @ApiPropertyOptional({ example: "09:00" })
  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
  startTime?: string;

  @ApiPropertyOptional({ example: "13:00" })
  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
  endTime?: string;

  @ApiPropertyOptional({ example: 50 })
  @IsOptional()
  @IsInt()
  @Min(20)
  @Max(180)
  slotDurationMin?: number;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(120)
  bufferMin?: number;

  @ApiPropertyOptional({ example: "Asia/Yekaterinburg" })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
