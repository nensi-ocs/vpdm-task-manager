import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { AuthGuard } from "@nestjs/passport";
import { CurrentUser } from "../auth/current-user.decorator";
import type { RequestUser } from "../auth/jwt.strategy";
import { LeadsService } from "./leads.service";

@Controller("leads")
@UseGuards(AuthGuard("jwt"))
export class LeadsController {
  constructor(private readonly service: LeadsService) {}

  @Get("sources")
  listSources(@CurrentUser() user: RequestUser) {
    return this.service.listSources(user.userId);
  }

  @Get("ad-platforms")
  listAdPlatforms(
    @CurrentUser() user: RequestUser,
    @Query("sourceId") sourceId: string | undefined
  ) {
    return this.service.listAdPlatforms(user.userId, sourceId ?? null);
  }

  @Get()
  listLeads(
    @CurrentUser() user: RequestUser,
    @Query("sourceId") sourceId: string | undefined,
    @Query("q") q: string | undefined,
    @Query("status") status: string | undefined,
    @Query("adPlatform") adPlatform: string | undefined,
    @Query("page") pageRaw: string | undefined,
    @Query("pageSize") pageSizeRaw: string | undefined
  ) {
    const page = pageRaw ? Number(pageRaw) : 1;
    const pageSize = pageSizeRaw ? Number(pageSizeRaw) : 50;
    if (!Number.isFinite(page) || page < 1) throw new BadRequestException("Invalid page");
    if (!Number.isFinite(pageSize) || pageSize < 1 || pageSize > 200) {
      throw new BadRequestException("Invalid pageSize");
    }
    return this.service.listLeads(user.userId, {
      sourceId,
      q,
      status,
      adPlatform,
      page,
      pageSize,
    });
  }

  @Post("import-xlsx")
  @UseInterceptors(FileInterceptor("file"))
  importXlsx(
    @CurrentUser() user: RequestUser,
    @UploadedFile() file?: { buffer: Buffer | Uint8Array; originalname?: string }
  ) {
    if (!file) throw new BadRequestException("file is required");
    return this.service.importXlsxForUser(user.userId, file);
  }

  @Patch(":id")
  async updateLead(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>
  ) {
    const updated = await this.service.updateForUser(user.userId, id, body);
    if (!updated) throw new NotFoundException("Not found");
    return updated;
  }
}

