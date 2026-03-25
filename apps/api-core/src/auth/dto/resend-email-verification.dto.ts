import { ApiProperty } from "@nestjs/swagger";
import { IsEmail } from "class-validator";

export class ResendEmailVerificationDto {
  @ApiProperty()
  @IsEmail()
  email!: string;
}
