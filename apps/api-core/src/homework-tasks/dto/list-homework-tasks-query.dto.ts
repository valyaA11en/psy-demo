import { ApiPropertyOptional } from "@nestjs/swagger";
import { HomeworkTaskStatus } from "prisma-client-generated";
import { Type } from "class-transformer";
import { IsEnum, IsInt, IsOptional, Max, Min } from "class-validator";

export class ListHomeworkTasksQueryDto {
  @ApiPropertyOptional({ enum: HomeworkTaskStatus })
  @IsOptional()
  @IsEnum(HomeworkTaskStatus)
  status?: HomeworkTaskStatus;

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
