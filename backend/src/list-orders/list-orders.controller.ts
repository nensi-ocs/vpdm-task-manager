import { Body, Controller, Get, Param, Put, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { CurrentUser } from "../auth/current-user.decorator";
import type { RequestUser } from "../auth/jwt.strategy";
import { ListOrdersService } from "./list-orders.service";

/** Per-user drag-and-drop order of lists (tasks, tracks, pipeline stages, ...). */
@Controller("list-orders")
@UseGuards(AuthGuard("jwt"))
export class ListOrdersController {
  constructor(private readonly listOrders: ListOrdersService) {}

  /** All saved orders for the user: { [listKey]: string[] } */
  @Get()
  findAll(@CurrentUser() user: RequestUser) {
    return this.listOrders.findAllForUser(user.userId);
  }

  @Put(":listKey")
  save(
    @CurrentUser() user: RequestUser,
    @Param("listKey") listKey: string,
    @Body() body: Record<string, unknown>
  ) {
    return this.listOrders.saveForUser(user.userId, listKey, body);
  }
}
