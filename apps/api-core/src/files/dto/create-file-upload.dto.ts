import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsIn, IsInt, IsString, Max, MaxLength, Min } from "class-validator";
import { filePurposeValues } from "../files.constants";

export class CreateFileUploadDto {
  @ApiProperty({
    enum: filePurposeValues,
    example: "psychologist_diploma",
  })
  @IsString()
  @IsIn(filePurposeValues)
  purpose!: string;

  @ApiProperty({
    example: "diploma.pdf",
  })
  @IsString()
  @MaxLength(255)
  originalFilename!: string;

  @ApiProperty({
    example: "application/pdf",
  })
  @IsString()
  @MaxLength(128)
  mimeType!: string;

  @ApiProperty({
    example: 2457600,
    description: "Размер файла в байтах. Проверяется повторно на этапе complete upload.",
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10 * 1024 * 1024)
  sizeBytes!: number;
}
