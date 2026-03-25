import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, Max, Min } from "class-validator";

const complaintStatuses = ["new", "open", "in_review", "resolved", "rejected"] as const;

export class ListMyComplaintsQueryDto {
  @ApiPropertyOptional({ enum: complaintStatuses })
  @IsOptional()
  @IsIn(complaintStatuses)
  status?: (typeof complaintStatuses)[number];

  @ApiPropertyOptional({ default: 1 })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 10 })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 10;
}
