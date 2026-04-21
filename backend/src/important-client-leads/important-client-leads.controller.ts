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
import { ImportantClientLeadsService } from "./important-client-leads.service";

@Controller("important-client-leads")
@UseGuards(AuthGuard("jwt"))
export class ImportantClientLeadsController {
  constructor(private readonly service: ImportantClientLeadsService) {}

  @Get()
  list(@CurrentUser() user: RequestUser) {
    return this.service.listForUser(user.userId);
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

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    const ok = await this.service.removeForUser(user.userId, id);
    if (!ok) throw new NotFoundException("Not found");
  }
}

