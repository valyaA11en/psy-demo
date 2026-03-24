import { Controller, Get, NotFoundException, Param, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { CatalogService } from "./catalog.service";
import { ListPsychologistsQueryDto } from "./dto/list-psychologists-query.dto";

@ApiTags("catalog")
@Controller("catalog")
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get("psychologists")
  async listPsychologists(@Query() query: ListPsychologistsQueryDto) {
    return this.catalogService.listPsychologists(query);
  }

  @Get("psychologists/:slug")
  async getPsychologist(@Param("slug") slug: string) {
    const result = await this.catalogService.getPsychologistBySlug(slug);

    if (!result) {
      throw new NotFoundException("Психолог не найден");
    }

    return result;
  }

  @Get("specializations")
  async listSpecializations() {
    return this.catalogService.listSpecializations();
  }
}
