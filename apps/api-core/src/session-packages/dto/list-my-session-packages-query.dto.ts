import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";

export class ListMySessionPackagesQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  psychologistSlug?: string;

  @ApiPropertyOptional({
    enum: ["active", "completed", "cancelled"],
  })
  @IsOptional()
  @IsString()
  @IsIn(["active", "completed", "cancelled"])
  status?: string;
}
