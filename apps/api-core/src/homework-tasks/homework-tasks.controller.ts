import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { JwtUser } from "../auth/interfaces/jwt-user.interface";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { CreateHomeworkTaskDto } from "./dto/create-homework-task.dto";
import { ListHomeworkTasksQueryDto } from "./dto/list-homework-tasks-query.dto";
import { UpdateClientHomeworkTaskDto } from "./dto/update-client-homework-task.dto";
import { UpdatePsychologistHomeworkTaskDto } from "./dto/update-psychologist-homework-task.dto";
import { HomeworkTasksService } from "./homework-tasks.service";

@ApiTags("homework-tasks")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("homework-tasks")
export class HomeworkTasksController {
  constructor(private readonly homeworkTasksService: HomeworkTasksService) {}

  @Get("me")
  @Roles("client")
  async listClientTasks(@CurrentUser() user: JwtUser, @Query() query: ListHomeworkTasksQueryDto) {
    return this.homeworkTasksService.listClientTasks(user.sub, query);
  }

  @Patch("me/:taskId")
  @Roles("client")
  async updateClientTask(
    @CurrentUser() user: JwtUser,
    @Param("taskId") taskId: string,
    @Body() dto: UpdateClientHomeworkTaskDto,
    @Req() request: Request,
  ) {
    return this.homeworkTasksService.updateClientTask(user.sub, taskId, dto, request);
  }

  @Get("psychologist/me")
  @Roles("psychologist")
  async listPsychologistTasks(@CurrentUser() user: JwtUser, @Query() query: ListHomeworkTasksQueryDto) {
    return this.homeworkTasksService.listPsychologistTasks(user.sub, query);
  }

  @Post("psychologist/me")
  @Roles("psychologist")
  async createPsychologistTask(
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateHomeworkTaskDto,
    @Req() request: Request,
  ) {
    return this.homeworkTasksService.createPsychologistTask(user.sub, dto, request);
  }

  @Patch("psychologist/me/:taskId")
  @Roles("psychologist")
  async updatePsychologistTask(
    @CurrentUser() user: JwtUser,
    @Param("taskId") taskId: string,
    @Body() dto: UpdatePsychologistHomeworkTaskDto,
    @Req() request: Request,
  ) {
    return this.homeworkTasksService.updatePsychologistTask(user.sub, taskId, dto, request);
  }
}
