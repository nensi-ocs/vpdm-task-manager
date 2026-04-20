import { join } from "node:path";
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AuthModule } from "./auth/auth.module";
import { CategoriesModule } from "./categories/categories.module";
import { FollowupClientsModule } from "./followup-clients/followup-clients.module";
import { HealthModule } from "./health/health.module";
import { PipelineClientsModule } from "./pipeline-clients/pipeline-clients.module";
import { PrismaModule } from "./prisma/prisma.module";
import { TasksModule } from "./tasks/tasks.module";
import { ExportModule } from "./export/export.module";
import { LeadsModule } from "./leads/leads.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: join(__dirname, "..", ".env"),
    }),
    PrismaModule,
    AuthModule,
    CategoriesModule,
    FollowupClientsModule,
    PipelineClientsModule,
    HealthModule,
    TasksModule,
    ExportModule,
    LeadsModule,
  ],
})
export class AppModule {}
