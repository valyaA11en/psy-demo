import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";
import { filePurposeValues, fileStatusValues } from "../files.constants";

export class ListMyFilesQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({ enum: filePurposeValues })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  @IsIn(filePurposeValues)
  purpose?: string;

  @ApiPropertyOptional({ enum: fileStatusValues })
  @IsOptional()
  @IsString()
  @IsIn(fileStatusValues)
  status?: string;
}
