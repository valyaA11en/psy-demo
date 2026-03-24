import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsDateString, IsOptional, IsString, MaxLength } from "class-validator";

export class CreateAvailabilityExceptionDto {
  @ApiProperty({ example: "2026-03-30T00:00:00.000Z" })
  @IsDateString()
  startsAt!: string;

  @ApiProperty({ example: "2026-04-02T23:59:59.999Z" })
  @IsDateString()
  endsAt!: string;

  @ApiPropertyOptional({ example: "Отпуск" })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean = true;
}
