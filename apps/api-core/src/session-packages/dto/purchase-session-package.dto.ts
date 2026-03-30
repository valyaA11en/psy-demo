import { ApiProperty } from "@nestjs/swagger";
import { IsUUID } from "class-validator";

export class PurchaseSessionPackageDto {
  @ApiProperty()
  @IsUUID()
  offerId!: string;
}
