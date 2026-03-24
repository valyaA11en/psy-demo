import { ApiProperty } from "@nestjs/swagger";
import { IsOptional, IsString, Matches, MaxLength } from "class-validator";

export class ConsumeTelegramLinkDto {
  @ApiProperty()
  @IsString()
  @MaxLength(128)
  token!: string;

  @ApiProperty({ example: "123456789" })
  @IsString()
  @Matches(/^-?\d{5,32}$/)
  chatId!: string;

  @ApiProperty({ example: "123456789", required: false })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  telegramUserId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  username?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  firstName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  lastName?: string;
}
