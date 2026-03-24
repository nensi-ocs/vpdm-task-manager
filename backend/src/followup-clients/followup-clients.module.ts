import { Module } from "@nestjs/common";
import { FollowupClientsController } from "./followup-clients.controller";
import { FollowupClientsService } from "./followup-clients.service";

@Module({
  controllers: [FollowupClientsController],
  providers: [FollowupClientsService],
})
export class FollowupClientsModule {}
