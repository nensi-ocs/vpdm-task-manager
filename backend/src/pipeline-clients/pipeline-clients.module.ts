import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { PipelineClientsController } from "./pipeline-clients.controller";
import { PipelineClientsService } from "./pipeline-clients.service";

@Module({
  imports: [PrismaModule],
  controllers: [PipelineClientsController],
  providers: [PipelineClientsService],
  exports: [PipelineClientsService],
})
export class PipelineClientsModule {}

