import { Module } from "@nestjs/common";
import { ImportantClientLeadsController } from "./important-client-leads.controller";
import { ImportantClientLeadsService } from "./important-client-leads.service";

@Module({
  controllers: [ImportantClientLeadsController],
  providers: [ImportantClientLeadsService],
})
export class ImportantClientLeadsModule {}

