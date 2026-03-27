import {
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
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { CurrentUser } from "../auth/current-user.decorator";
import type { RequestUser } from "../auth/jwt.strategy";
import { PipelineClientsService } from "./pipeline-clients.service";

@Controller("pipeline-clients")
@UseGuards(AuthGuard("jwt"))
export class PipelineClientsController {
  constructor(private readonly service: PipelineClientsService) {}

  @Get("stages")
  stages() {
    return this.service.listStages();
  }

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
    if (!updated) throw new NotFoundException("Not found");
    return updated;
  }

  @Patch(":id/advance")
  async advance(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    const updated = await this.service.advanceOneStep(user.userId, id);
    if (!updated) throw new NotFoundException("Not found");
    return updated;
  }

  @Patch(":id/mark-lost")
  async markLost(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body("lostReason") lostReason: unknown
  ) {
    const reason = typeof lostReason === "string" ? lostReason : null;
    const updated = await this.service.markLost(user.userId, id, reason);
    if (!updated) throw new NotFoundException("Not found");
    return updated;
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    const ok = await this.service.removeForUser(user.userId, id);
    if (!ok) throw new NotFoundException("Not found");
  }
}

