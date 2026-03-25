import { Module } from "@nestjs/common";
import { FilesController } from "./files.controller";
import { FilesService } from "./files.service";
import { FilesStorageService } from "./files-storage.service";

@Module({
  controllers: [FilesController],
  providers: [FilesService, FilesStorageService],
  exports: [FilesService],
})
export class FilesModule {}
