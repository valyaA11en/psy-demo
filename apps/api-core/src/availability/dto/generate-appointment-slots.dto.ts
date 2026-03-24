import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsBoolean, IsDateString, IsOptional } from "class-validator";

export class GenerateAppointmentSlotsDto {
  @ApiProperty({ example: "2026-03-24" })
  @IsDateString()
  dateFrom!: string;

  @ApiProperty({ example: "2026-04-07" })
  @IsDateString()
  dateTo!: string;

  @ApiPropertyOptional({ default: false })
  @Type(() => Boolean)
  @IsOptional()
  @IsBoolean()
  clearOpenGeneratedSlots?: boolean = false;
}
