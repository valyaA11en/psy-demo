import { ApiProperty } from "@nestjs/swagger";
import { IsString, IsUUID, MaxLength } from "class-validator";

export class SendMessageDto {
  @ApiProperty()
  @IsUUID()
  counterpartUserId!: string;

  @ApiProperty({ maxLength: 2000 })
  @IsString()
  @MaxLength(2000)
  body!: string;
}
