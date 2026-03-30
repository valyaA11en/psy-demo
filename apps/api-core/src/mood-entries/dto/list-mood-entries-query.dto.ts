import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, IsOptional, Matches, Max, Min } from "class-validator";

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class ListMoodEntriesQueryDto {
  @ApiPropertyOptional({ example: "2026-03-01" })
  @IsOptional()
  @Matches(DATE_ONLY_PATTERN)
  dateFrom?: string;

  @ApiPropertyOptional({ example: "2026-03-30" })
  @IsOptional()
  @Matches(DATE_ONLY_PATTERN)
  dateTo?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 90, default: 14 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  limit?: number;
}
