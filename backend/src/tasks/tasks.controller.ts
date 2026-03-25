import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  ParseIntPipe,
  Query,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import type { RequestUser } from "../auth/jwt.strategy";
import { CurrentUser } from "../auth/current-user.decorator";
import { TasksService } from "./tasks.service";

@Controller("tasks")
@UseGuards(AuthGuard("jwt"))
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get()
  findAll(@CurrentUser() user: RequestUser) {
    return this.tasksService.findAllForUser(user.userId);
  }

  @Get("completions/:date")
  findCompletionsForDate(
    @CurrentUser() user: RequestUser,
    @Param("date") date: string
  ) {
    return this.tasksService.findCompletionTaskIdsForDate(user.userId, date);
  }

  @Post()
  create(
    @CurrentUser() user: RequestUser,
    @Body() body: Record<string, unknown>
  ) {
    return this.tasksService.createForUser(user.userId, body);
  }

  @Post("import")
  async import(
    @CurrentUser() user: RequestUser,
    @Body() body: { tasks?: unknown }
  ) {
    if (!Array.isArray(body.tasks)) {
      throw new BadRequestException("tasks array required");
    }
    const valid = this.tasksService.filterImportedTasks(body.tasks);
    return this.tasksService.replaceAllFromImportForUser(user.userId, valid);
  }

  @Patch(":id")
  async update(
    @CurrentUser() user: RequestUser,
    @Param("id", ParseIntPipe) id: number,
    @Body() body: Record<string, unknown>
  ) {
    const updated = await this.tasksService.updateForUser(
      user.userId,
      id,
      body
    );
    if (!updated) {
      throw new NotFoundException("Not found");
    }
    return updated;
  }

  @Patch(":id/completion/:date")
  async setCompletionForDate(
    @CurrentUser() user: RequestUser,
    @Param("id", ParseIntPipe) id: number,
    @Param("date") date: string,
    @Body() body: { completed?: unknown }
  ) {
    const completed = Boolean(body.completed);
    const ok = await this.tasksService.setCompletionForDate(
      user.userId,
      id,
      date,
      completed
    );
    if (!ok) {
      throw new NotFoundException("Not found");
    }
    return { ok: true };
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() user: RequestUser,
    @Param("id", ParseIntPipe) id: number,
    @Query("endDate") endDate?: string
  ) {
    const ok = await this.tasksService.removeForUser(user.userId, id, endDate);
    if (!ok) {
      throw new NotFoundException("Not found");
    }
  }
}
