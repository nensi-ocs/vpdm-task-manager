import {
  Controller,
  Get,
  Query,
  Res,
  UseGuards,
  BadRequestException,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import type { Response } from "express";
import { CurrentUser } from "../auth/current-user.decorator";
import type { RequestUser } from "../auth/jwt.strategy";
import { DailySheetExportService } from "./daily-sheet-export.service";

function todayIsoKolkata(): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const d = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${d}`;
}

@Controller("export")
@UseGuards(AuthGuard("jwt"))
export class ExportController {
  constructor(private readonly dailySheetExport: DailySheetExportService) {}

  @Get("daily-sheet")
  async downloadDailySheet(
    @CurrentUser() user: RequestUser,
    @Query("date") date: string | undefined,
    @Res() res: Response
  ) {
    const iso = date?.trim() || todayIsoKolkata();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
      throw new BadRequestException("date must be YYYY-MM-DD");
    }
    const buf = await this.dailySheetExport.buildWorkbookForUser(user.userId, iso);
    const safe = iso.replace(/-/g, "");
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="VPDM Daily Task ${safe}.xlsx"`
    );
    res.send(buf);
  }

  @Get("daily-sheet-print")
  async printDailySheet(
    @CurrentUser() user: RequestUser,
    @Query("date") date: string | undefined,
    @Res() res: Response
  ) {
    const iso = date?.trim() || todayIsoKolkata();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
      throw new BadRequestException("date must be YYYY-MM-DD");
    }
    const html = await this.dailySheetExport.buildPrintHtmlForUser(user.userId, iso);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  }
}
