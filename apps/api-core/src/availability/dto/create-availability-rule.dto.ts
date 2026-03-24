import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Weekday } from "@prisma/client";
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Matches, Max, Min } from "class-validator";

export class CreateAvailabilityRuleDto {
  @ApiProperty({ enum: Weekday })
  @IsEnum(Weekday)
  weekday!: Weekday;

  @ApiProperty({ example: "09:00" })
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
  startTime!: string;

  @ApiProperty({ example: "13:00" })
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
  endTime!: string;

  @ApiProperty({ example: 50 })
  @IsInt()
  @Min(20)
  @Max(180)
  slotDurationMin!: number;

  @ApiPropertyOptional({ example: 10, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(120)
  bufferMin?: number = 0;

  @ApiProperty({ example: "Asia/Yekaterinburg" })
  @IsString()
  timezone!: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean = true;
}
