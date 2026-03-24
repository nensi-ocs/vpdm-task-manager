import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Patch,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { CurrentUser } from "../auth/current-user.decorator";
import type { RequestUser } from "../auth/jwt.strategy";
import { CategoriesService } from "./categories.service";

@Controller("categories")
@UseGuards(AuthGuard("jwt"))
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  findAll(@CurrentUser() user: RequestUser) {
    return this.categories.findAllForUser(user.userId);
  }

  @Post()
  create(@CurrentUser() user: RequestUser, @Body() body: Record<string, unknown>) {
    return this.categories.createForUser(user.userId, body);
  }

  @Patch(":id")
  async update(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>
  ) {
    const updated = await this.categories.updateForUser(user.userId, id, body);
    if (!updated) {
      throw new NotFoundException("Not found");
    }
    return updated;
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    const ok = await this.categories.removeForUser(user.userId, id);
    if (!ok) {
      throw new NotFoundException("Not found");
    }
  }
}
