import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { PipelineClientsModule } from "../pipeline-clients/pipeline-clients.module";
import { DailySheetExportService } from "./daily-sheet-export.service";
import { ExportController } from "./export.controller";

@Module({
  imports: [PrismaModule, PipelineClientsModule],
  controllers: [ExportController],
  providers: [DailySheetExportService],
})
export class ExportModule {}
