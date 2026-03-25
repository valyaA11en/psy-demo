import {
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { JwtUser } from "../auth/interfaces/jwt-user.interface";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Body } from "@nestjs/common";
import { CreateFileUploadDto } from "./dto/create-file-upload.dto";
import { ListMyFilesQueryDto } from "./dto/list-my-files-query.dto";
import { FilesService } from "./files.service";

@ApiTags("files")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("psychologist")
@Controller("files")
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Get("me")
  async listMyFiles(@CurrentUser() user: JwtUser, @Query() query: ListMyFilesQueryDto) {
    return this.filesService.listMyFiles(user.sub, query);
  }

  @Post("upload-url")
  async createUploadUrl(
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateFileUploadDto,
    @Req() request: Request,
  ) {
    return this.filesService.createUploadSession(user.sub, dto, request);
  }

  @Post(":id/complete")
  async completeUpload(
    @CurrentUser() user: JwtUser,
    @Param("id", ParseUUIDPipe) fileId: string,
    @Req() request: Request,
  ) {
    return this.filesService.completeUpload(fileId, user.sub, request);
  }

  @Get(":id/download-url")
  async createDownloadUrl(
    @CurrentUser() user: JwtUser,
    @Param("id", ParseUUIDPipe) fileId: string,
    @Req() request: Request,
  ) {
    return this.filesService.createDownloadUrl(fileId, user.sub, request);
  }

  @Delete(":id")
  async deleteFile(
    @CurrentUser() user: JwtUser,
    @Param("id", ParseUUIDPipe) fileId: string,
    @Req() request: Request,
  ) {
    return this.filesService.deleteFile(fileId, user.sub, request);
  }
}
