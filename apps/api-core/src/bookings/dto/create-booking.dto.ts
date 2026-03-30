import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, IsUUID, MaxLength } from "class-validator";

export class CreateBookingDto {
  @ApiProperty()
  @IsUUID()
  slotId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  clientMessage?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  sessionPackageId?: string;
}
