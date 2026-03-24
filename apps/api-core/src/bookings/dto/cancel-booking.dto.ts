import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength } from "class-validator";

export class CancelBookingDto {
  @ApiPropertyOptional({ example: "schedule_conflict" })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  reasonCode?: string;
}
