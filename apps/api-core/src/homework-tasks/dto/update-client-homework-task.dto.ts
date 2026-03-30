import { ApiPropertyOptional } from "@nestjs/swagger";
import { HomeworkTaskStatus } from "prisma-client-generated";
import { IsEnum, IsOptional, IsString, MaxLength } from "class-validator";

export class UpdateClientHomeworkTaskDto {
  @ApiPropertyOptional({ enum: [HomeworkTaskStatus.assigned, HomeworkTaskStatus.completed] })
  @IsOptional()
  @IsEnum(HomeworkTaskStatus)
  status?: "assigned" | "completed";

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  clientNote?: string;
}
