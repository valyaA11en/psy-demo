import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength } from "class-validator";

export class MockFailPaymentDto {
  @ApiPropertyOptional({ example: "card_declined" })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  failureCode?: string;

  @ApiPropertyOptional({ example: "Тестовый отказ из сценария оплаты" })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  failureMessage?: string;
}
