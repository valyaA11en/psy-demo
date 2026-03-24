import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  Equals,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

export class RegisterDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @ApiProperty({ enum: ["client", "psychologist"] })
  @IsIn(["client", "psychologist"])
  accountType!: "client" | "psychologist";

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  displayName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  lastName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  publicTitle?: string;

  @ApiProperty()
  @Equals(true)
  acceptPrivacyPolicy!: true;

  @ApiProperty()
  @Equals(true)
  acceptPlatformTerms!: true;
}
