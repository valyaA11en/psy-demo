import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from "class-validator";

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class UpsertMoodEntryDto {
  @ApiProperty({ example: "2026-03-30" })
  @Matches(DATE_ONLY_PATTERN)
  recordedForDate!: string;

  @ApiProperty({ minimum: 1, maximum: 10, example: 7 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  moodScore!: number;

  @ApiPropertyOptional({
    type: [String],
    example: ["спокойствие", "усталость"],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  @MaxLength(32, { each: true })
  emotions?: string[];

  @ApiPropertyOptional({ maxLength: 1500 })
  @IsOptional()
  @IsString()
  @MaxLength(1500)
  note?: string;
}
