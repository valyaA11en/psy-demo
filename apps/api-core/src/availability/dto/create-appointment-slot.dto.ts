import { ApiProperty } from "@nestjs/swagger";
import { IsDateString } from "class-validator";

export class CreateAppointmentSlotDto {
  @ApiProperty({ example: "2026-03-25T09:00:00.000Z" })
  @IsDateString()
  startsAt!: string;

  @ApiProperty({ example: "2026-03-25T09:50:00.000Z" })
  @IsDateString()
  endsAt!: string;
}
