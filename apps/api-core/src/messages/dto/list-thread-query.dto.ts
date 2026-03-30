import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsISO8601, IsInt, IsOptional, Max, Min } from "class-validator";

export class ListThreadQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 40 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  before?: string;
}
