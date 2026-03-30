import { ApiPropertyOptional } from "@nestjs/swagger";
import { HomeworkTaskStatus } from "prisma-client-generated";
import { IsEnum, IsISO8601, IsOptional, IsString, MaxLength } from "class-validator";

export class UpdatePsychologistHomeworkTaskDto {
  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  dueAt?: string;

  @ApiPropertyOptional({ enum: [HomeworkTaskStatus.assigned, HomeworkTaskStatus.cancelled] })
  @IsOptional()
  @IsEnum(HomeworkTaskStatus)
  status?: "assigned" | "cancelled";
}
