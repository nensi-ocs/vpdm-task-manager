import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseBoolPipe,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { CurrentUser } from "../auth/current-user.decorator";
import type { RequestUser } from "../auth/jwt.strategy";
import { FollowupClientsService } from "./followup-clients.service";

@Controller("followup-clients")
@UseGuards(AuthGuard("jwt"))
export class FollowupClientsController {
  constructor(private readonly service: FollowupClientsService) {}

  @Get()
  findAll(@CurrentUser() user: RequestUser) {
    return this.service.findAllForUser(user.userId);
  }

  @Post()
  create(@CurrentUser() user: RequestUser, @Body() body: Record<string, unknown>) {
    return this.service.createForUser(user.userId, body);
  }

  @Patch(":id")
  async update(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>
  ) {
    const updated = await this.service.updateForUser(user.userId, id, body);
    if (!updated) {
      throw new NotFoundException("Not found");
    }
    return updated;
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    const ok = await this.service.removeForUser(user.userId, id);
    if (!ok) {
      throw new NotFoundException("Not found");
    }
  }

  @Get("completions/:date")
  findCompletionsByDate(
    @CurrentUser() user: RequestUser,
    @Param("date") date: string
  ) {
    return this.service.findCompletionClientIdsForDate(user.userId, date);
  }

  @Patch(":id/completion/:date")
  async setCompletionByDate(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Param("date") date: string,
    @Body("completed", ParseBoolPipe) completed: boolean
  ) {
    const ok = await this.service.setCompletionForDate(
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
}
