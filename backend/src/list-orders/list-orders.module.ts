import { Module } from "@nestjs/common";
import { ListOrdersController } from "./list-orders.controller";
import { ListOrdersService } from "./list-orders.service";

@Module({
  controllers: [ListOrdersController],
  providers: [ListOrdersService],
})
export class ListOrdersModule {}
