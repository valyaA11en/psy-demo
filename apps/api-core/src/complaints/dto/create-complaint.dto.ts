import { ApiProperty } from "@nestjs/swagger";
import { IsIn, IsString, IsUUID, MaxLength, MinLength } from "class-validator";

const complaintTypes = [
  "service_quality",
  "no_show",
  "refund_request",
  "privacy",
  "abuse",
  "billing",
  "other",
] as const;

export type ComplaintTypeCode = (typeof complaintTypes)[number];

export class CreateComplaintDto {
  @ApiProperty()
  @IsUUID()
  consultationId!: string;

  @ApiProperty({ enum: complaintTypes })
  @IsString()
  @IsIn(complaintTypes)
  type!: ComplaintTypeCode;

  @ApiProperty()
  @IsString()
  @MinLength(20)
  @MaxLength(2000)
  text!: string;
}
