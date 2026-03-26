import { Injectable, NotFoundException } from "@nestjs/common";
import * as ExcelJS from "exceljs";
import { Buffer } from "buffer";
import type { FollowupClient, TaskSeries } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import {
  isOccurrenceCompletedInWindow,
  isTaskVisibleWithCarryForward,
} from "../tasks/task-schedule.util";

const TICK_EMPTY = "❏";
const TICK_DONE = "☑";

type TaskSeriesSchedule = TaskSeries & {
  repeatIntervalDays?: number | null;
};

const VPDM_TRACKS = [
  "Amazon Client Followup",
  "Amazon New client Free",
  "Amazon Audit Client",
  "Flipkart Client Followup",
  "Flipkart New client Free",
  "Flipkart Audit Client",
] as const;

const EXCEL_ROW2_TRACK_LABELS = [
  "Amazon Client Followup",
  "Amazon New client Free",
  "Amazon Audit Client ",
  "Flipkart  Client Followup",
  "Flipkart New client Free",
  "Flipkart Audit Client ",
] as const;

const COLOR_VPDM = "CAEDFB";
const COLOR_ROLE_AND_SELECTED_TRACKS = "FBE2D5";
const COLOR_AMAZON_NEW_CLIENT = "C1F0C8";
const COLOR_AMAZON_AUDIT = "F2CEEF";
const COLOR_FLIPKART_CLIENT_FOLLOWUP = "DAF2D0";
const COLOR_FLIPKART_NEW_CLIENT = "DAE9F8";
const COLOR_HEADERS = "D0D0D0";
const COLOR_COMMENTS_AND_CATEGORY = "DAF2D0";

const COMMENT_LINE_DEFAULTS = [] as const;
const LAST_COL = 16;

type Section = { name: string; tasks: TaskSeriesSchedule[] };

type CommentPair = {
  leftText: string;
  rightText: string;
  leftDone: boolean;
  rightDone: boolean;
};

function fillHexSolid(cell: ExcelJS.Cell, rgbHex: string): void {
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: `FF${rgbHex.toUpperCase()}` } as unknown as ExcelJS.Color,
    bgColor: { indexed: 64 } as unknown as ExcelJS.Color,
  };
}

function normCat(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

function buildTaskCompletionDatesMap(
  rows: { taskId: number; date: Date }[]
): Map<number, Set<string>> {
  const m = new Map<number, Set<string>>();
  for (const r of rows) {
    const iso = r.date.toISOString().slice(0, 10);
    let s = m.get(r.taskId);
    if (!s) {
      s = new Set();
      m.set(r.taskId, s);
    }
    s.add(iso);
  }
  return m;
}

function minTaskSeriesStartIso(tasks: TaskSeriesSchedule[], selectedIso: string): string {
  let min = selectedIso;
  for (const t of tasks) {
    const s = t.startDate.toISOString().slice(0, 10);
    if (t.frequency !== "daily" && s < min) min = s;
  }
  return min;
}

function sortForSection(tasks: TaskSeriesSchedule[]): TaskSeriesSchedule[] {
  return [...tasks].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
  );
}

function buildSections(
  categoryRows: { name: string }[],
  tasks: TaskSeriesSchedule[],
  isoDate: string,
  completionDatesByTaskId: Map<number, Set<string>>
): Section[] {
  const visible = tasks
    .filter((t) =>
      isTaskVisibleWithCarryForward(t, isoDate, completionDatesByTaskId)
    )
    .filter((t) => t.frequency !== "once");

  const catNames = new Set(categoryRows.map((c) => normCat(c.name)));
  const sections: Section[] = [];

  for (const c of categoryRows) {
    const ts = sortForSection(
      visible.filter((t) => normCat(t.category) === normCat(c.name))
    );
    sections.push({ name: c.name, tasks: ts });
  }

  const orphans = sortForSection(
    visible.filter((t) => {
      const n = normCat(t.category);
      return !n || !catNames.has(n);
    })
  );
  if (orphans.length > 0) {
    sections.push({ name: "Uncategorized", tasks: orphans });
  }

  if (sections.length === 0) {
    sections.push({ name: "Tasks", tasks: [] });
  }

  return sections;
}

function vpdmDateLabel(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00.000Z`);
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
  return fmt.format(d);
}

function normTrack(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function clientsForTrack(
  followups: FollowupClient[],
  track: string
): FollowupClient[] {
  const want = normTrack(track);
  return followups
    .filter((f) => normTrack(f.track) === want)
    .sort((a, b) => a.clientName.localeCompare(b.clientName));
}

function applyThinBorder(cell: ExcelJS.Cell): void {
  cell.border = {
    top: { style: "thin" },
    left: { style: "thin" },
    bottom: { style: "thin" },
    right: { style: "thin" },
  };
}

function applyEmptyRightGrid(ws: ExcelJS.Worksheet, r: number): void {
  for (let c = 5; c <= LAST_COL; c++) {
    const cell = ws.getCell(r, c);
    cell.value = "";
    cell.alignment = { horizontal: "center", vertical: "middle" };
    applyThinBorder(cell);
  }
}

function fillRowFollowup(
  ws: ExcelJS.Worksheet,
  r: number,
  dataRowIndex: number,
  followups: FollowupClient[],
  completedFuIds: Set<string>
): boolean {
  let hasAny = false;

  for (let ti = 0; ti < VPDM_TRACKS.length; ti++) {
    const nameCol = 6 + 2 * ti;
    const tickCol = nameCol - 1;
    const clients = clientsForTrack(followups, VPDM_TRACKS[ti]);
    const fu = clients[dataRowIndex];

    if (fu) {
      hasAny = true;
      ws.getCell(r, nameCol).value = fu.clientName;
      ws.getCell(r, tickCol).value = completedFuIds.has(fu.id)
        ? TICK_DONE
        : TICK_EMPTY;
    } else {
      ws.getCell(r, nameCol).value = "";
      ws.getCell(r, tickCol).value = "";
    }

    ws.getCell(r, tickCol).alignment = {
      horizontal: "center",
      vertical: "middle",
    };
    ws.getCell(r, nameCol).alignment = {
      horizontal: "left",
      vertical: "middle",
      wrapText: true,
    };

    applyThinBorder(ws.getCell(r, tickCol));
    applyThinBorder(ws.getCell(r, nameCol));
  }

  return hasAny;
}

function applyColumnWidths(ws: ExcelJS.Worksheet): void {
  ws.getColumn(1).width = 5;
  ws.getColumn(2).width = 13;
  ws.getColumn(3).width = 44;
  ws.getColumn(4).width = 3;
  for (let c = 5; c <= 16; c++) {
    ws.getColumn(c).width = c % 2 === 1 ? 13 : 24;
  }
}

const TRACK_HEADER_HEX: readonly string[] = [
  COLOR_ROLE_AND_SELECTED_TRACKS,
  COLOR_AMAZON_NEW_CLIENT,
  COLOR_AMAZON_AUDIT,
  COLOR_FLIPKART_CLIENT_FOLLOWUP,
  COLOR_FLIPKART_NEW_CLIENT,
  COLOR_ROLE_AND_SELECTED_TRACKS,
];

function excelColLetter(col: number): string {
  let n = col;
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function writeTopHeaderRows(ws: ExcelJS.Worksheet, isoDate: string): void {
  const title = `VPDM (${vpdmDateLabel(isoDate)})`;

  for (let c = 1; c <= LAST_COL; c++) {
    const cell = ws.getCell(1, c);
    cell.value = title;
    fillHexSolid(cell, COLOR_VPDM);
    applyThinBorder(cell);
  }

  ws.mergeCells(`A1:${excelColLetter(LAST_COL)}1`);
  ws.getRow(1).height = 21.75;
  ws.getCell(1, 1).alignment = {
    horizontal: "center",
    vertical: "middle",
  };
  ws.getCell(1, 1).font = { bold: true, size: 12 };

  ws.mergeCells("A2:C2");
  const role = ws.getCell(2, 1);
  role.value = "Role and Responsibility";
  fillHexSolid(role, COLOR_ROLE_AND_SELECTED_TRACKS);
  role.font = { bold: true, size: 11 };
  role.alignment = {
    horizontal: "center",
    vertical: "middle",
  };
  applyThinBorder(ws.getCell(2, 1));
  applyThinBorder(ws.getCell(2, 2));
  applyThinBorder(ws.getCell(2, 3));

  ws.getCell(2, 4).value = "";
  applyThinBorder(ws.getCell(2, 4));

  for (let ti = 0; ti < VPDM_TRACKS.length; ti++) {
    const c0 = 5 + 2 * ti;
    const c1 = c0 + 1;
    const label = EXCEL_ROW2_TRACK_LABELS[ti] ?? VPDM_TRACKS[ti];
    const rgbHex = TRACK_HEADER_HEX[ti] ?? COLOR_ROLE_AND_SELECTED_TRACKS;

    ws.mergeCells(2, c0, 2, c1);

    const mc = ws.getCell(2, c0);
    mc.value = label;
    fillHexSolid(mc, rgbHex);
    mc.font = { bold: true, size: 10 };
    mc.alignment = {
      horizontal: "center",
      vertical: "middle",
      wrapText: true,
    };

    applyThinBorder(ws.getCell(2, c0));
    applyThinBorder(ws.getCell(2, c1));
  }

  ws.getRow(2).height = 15;

  ws.getCell(3, 1).value = "No";
  ws.getCell(3, 2).value = "Tick";
  ws.getCell(3, 3).value = "Operational Team";

  for (const c of [1, 2, 3]) {
    const cell = ws.getCell(3, c);
    fillHexSolid(cell, COLOR_HEADERS);
    cell.font = { bold: true, size: 11 };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    applyThinBorder(cell);
  }

  for (let i = 0; i < 6; i++) {
    const tickCol = 5 + 2 * i;
    const nameCol = 6 + 2 * i;

    ws.getCell(3, tickCol).value = "Tick";
    ws.getCell(3, nameCol).value = "Client Name";

    for (const c of [tickCol, nameCol]) {
      const cell = ws.getCell(3, c);
      fillHexSolid(cell, COLOR_HEADERS);
      cell.font = { bold: true, size: 10 };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      applyThinBorder(cell);
    }
  }

  ws.getCell(3, 4).value = "";
  applyThinBorder(ws.getCell(3, 4));
  ws.getRow(3).height = 18;
}

function buildCommentPairs(
  oneTimeTasks: TaskSeriesSchedule[],
  isoDate: string,
  completionDatesByTaskId: Map<number, Set<string>>
): CommentPair[] {
  const defaults = [...COMMENT_LINE_DEFAULTS];
  const tasks = sortForSection(oneTimeTasks);
  const totalPairs = Math.max(
    1,
    Math.ceil(Math.max(tasks.length, defaults.length) / 2)
  );

  const pairs: CommentPair[] = [];

  for (let i = 0; i < totalPairs; i++) {
    const leftTask = tasks[i * 2];
    const rightTask = tasks[i * 2 + 1];

    pairs.push({
      leftText: leftTask?.title ?? (i < defaults.length ? defaults[i]! : ""),
      rightText: rightTask?.title ?? "",
      leftDone: leftTask
        ? isOccurrenceCompletedInWindow(leftTask, isoDate, completionDatesByTaskId)
        : false,
      rightDone: rightTask
        ? isOccurrenceCompletedInWindow(rightTask, isoDate, completionDatesByTaskId)
        : false,
    });
  }

  return pairs;
}

/**
 * Header row:
 * Amazon comments header spans E:J
 * Flipkart comments header spans K:P
 */
function writeInlineCommentsHeader(ws: ExcelJS.Worksheet, r: number): void {
  ws.mergeCells(`E${r}:J${r}`);
  ws.mergeCells(`K${r}:P${r}`);

  const amazonHead = ws.getCell(r, 5);
  amazonHead.value = "Comments";
  fillHexSolid(amazonHead, COLOR_COMMENTS_AND_CATEGORY);
  amazonHead.font = { bold: true, size: 11 };
  amazonHead.alignment = { horizontal: "center", vertical: "middle" };

  const flipkartHead = ws.getCell(r, 11);
  flipkartHead.value = "Comments";
  fillHexSolid(flipkartHead, COLOR_COMMENTS_AND_CATEGORY);
  flipkartHead.font = { bold: true, size: 11 };
  flipkartHead.alignment = { horizontal: "center", vertical: "middle" };

  for (let c = 5; c <= 10; c++) applyThinBorder(ws.getCell(r, c));
  for (let c = 11; c <= 16; c++) applyThinBorder(ws.getCell(r, c));

  ws.getRow(r).height = 18;
}

/**
 * Data row:
 * Amazon comment uses:
 *   E = tick
 *   F:J = text
 *
 * Flipkart comment uses:
 *   K = tick
 *   L:P = text
 */
function writeInlineCommentData(
  ws: ExcelJS.Worksheet,
  r: number,
  pair?: CommentPair
): void {
  const leftText = pair?.leftText ?? "";
  const rightText = pair?.rightText ?? "";
  const leftDone = pair?.leftDone ?? false;
  const rightDone = pair?.rightDone ?? false;

  const amazonTick = ws.getCell(r, 5);
  amazonTick.value = leftText ? (leftDone ? TICK_DONE : TICK_EMPTY) : "";
  amazonTick.alignment = { horizontal: "center", vertical: "middle" };
  applyThinBorder(amazonTick);

  const flipkartTick = ws.getCell(r, 11);
  flipkartTick.value = rightText ? (rightDone ? TICK_DONE : TICK_EMPTY) : "";
  flipkartTick.alignment = { horizontal: "center", vertical: "middle" };
  applyThinBorder(flipkartTick);

  ws.mergeCells(`F${r}:J${r}`);
  ws.mergeCells(`L${r}:P${r}`);

  const amazonTextCell = ws.getCell(r, 6);
  amazonTextCell.value = leftText || null;
  amazonTextCell.alignment = {
    horizontal: "left",
    vertical: "middle",
    wrapText: true,
  };

  const flipkartTextCell = ws.getCell(r, 12);
  flipkartTextCell.value = rightText || null;
  flipkartTextCell.alignment = {
    horizontal: "left",
    vertical: "middle",
    wrapText: true,
  };

  for (let c = 6; c <= 10; c++) applyThinBorder(ws.getCell(r, c));
  for (let c = 12; c <= 16; c++) applyThinBorder(ws.getCell(r, c));

  ws.getRow(r).height = leftText || rightText ? 18 : 15;
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function colLettersToNumber(col: string): number {
  let n = 0;
  for (const ch of col.toUpperCase()) {
    n = n * 26 + (ch.charCodeAt(0) - 64);
  }
  return n;
}

function parseA1Range(a1: string): {
  r1: number;
  c1: number;
  r2: number;
  c2: number;
} | null {
  const m = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/i.exec(a1);
  if (!m) return null;
  return {
    c1: colLettersToNumber(m[1]),
    r1: Number(m[2]),
    c2: colLettersToNumber(m[3]),
    r2: Number(m[4]),
  };
}

function borderCssSide(b: ExcelJS.Border | undefined): string {
  if (!b?.style) return "none";
  if (b.style === "medium") return "2px solid #000";
  return "1px solid #000";
}

function buildPrintHtmlFromWorksheet(ws: ExcelJS.Worksheet, title: string): string {
  const merges = ws.model.merges ?? [];
  const mergeByMaster = new Map<string, { rowSpan: number; colSpan: number }>();
  const mergedCovered = new Set<string>();

  for (const m of merges) {
    const parsed = parseA1Range(m);
    if (!parsed) continue;
    const { r1, c1, r2, c2 } = parsed;
    mergeByMaster.set(`${r1}:${c1}`, {
      rowSpan: r2 - r1 + 1,
      colSpan: c2 - c1 + 1,
    });
    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        if (r === r1 && c === c1) continue;
        mergedCovered.add(`${r}:${c}`);
      }
    }
  }

  const lines: string[] = [];
  lines.push("<!doctype html>");
  lines.push("<html><head><meta charset=\"utf-8\" />");
  lines.push(`<title>${escapeHtml(title)}</title>`);
  lines.push("<style>");
  lines.push("@page { size: A4 landscape; margin: 6mm; }");
  lines.push("body { font-family: Arial, sans-serif; margin: 0; background:#fff; color:#000; }");
  lines.push("#print-root { width: 100%; }");
  lines.push("#sheet-wrap { transform-origin: top left; width: max-content; }");
  lines.push("table { border-collapse: collapse; table-layout: fixed; }");
  lines.push("td { font-size: 11px; padding: 1px 3px; vertical-align: middle; word-wrap: break-word; background:#fff; color:#000; }");
  lines.push("@media print { .no-print { display: none; } }");
  lines.push("</style></head><body>");
  lines.push("<div class=\"no-print\" style=\"margin:8px 0;\">");
  lines.push("<button onclick=\"window.print()\">Print</button>");
  lines.push("</div>");
  lines.push("<div id=\"print-root\"><div id=\"sheet-wrap\"><table>");

  const maxRow = ws.rowCount;
  const maxCol = LAST_COL;

  for (let r = 1; r <= maxRow; r++) {
    lines.push("<tr>");
    for (let c = 1; c <= maxCol; c++) {
      const key = `${r}:${c}`;
      if (mergedCovered.has(key)) continue;

      const cell = ws.getCell(r, c);
      const merge = mergeByMaster.get(key);
      const attrs: string[] = [];

      if (merge?.rowSpan && merge.rowSpan > 1) attrs.push(`rowspan="${merge.rowSpan}"`);
      if (merge?.colSpan && merge.colSpan > 1) attrs.push(`colspan="${merge.colSpan}"`);

      const b = cell.border as {
        top?: ExcelJS.Border;
        right?: ExcelJS.Border;
        bottom?: ExcelJS.Border;
        left?: ExcelJS.Border;
      };

      const styles: string[] = [];
      styles.push(`border-top:${borderCssSide(b?.top)}`);
      styles.push(`border-right:${borderCssSide(b?.right)}`);
      styles.push(`border-bottom:${borderCssSide(b?.bottom)}`);
      styles.push(`border-left:${borderCssSide(b?.left)}`);
      styles.push("background-color:#fff");
      styles.push("color:#000");

      const fill = cell.fill as
        | undefined
        | { type?: string; pattern?: string; fgColor?: { argb?: string } };

      const argb = fill?.fgColor?.argb;
      if (fill?.type === "pattern" && fill?.pattern === "solid" && argb) {
        const hex = argb.slice(-6);
        styles.push(`background-color:#${hex}`);
      }

      if (cell.alignment?.horizontal) styles.push(`text-align:${cell.alignment.horizontal}`);
      if (cell.alignment?.vertical) styles.push(`vertical-align:${cell.alignment.vertical}`);
      if (cell.alignment?.wrapText) styles.push("white-space: pre-wrap");
      if (cell.font?.bold) styles.push("font-weight:700");
      if (typeof cell.font?.size === "number") styles.push(`font-size:${cell.font.size}px`);

      let text = "";
      if (cell.value == null) text = "";
      else if (typeof cell.value === "object") {
        if ("richText" in cell.value && Array.isArray(cell.value.richText)) {
          text = cell.value.richText.map((p) => p.text).join("");
        } else if ("text" in cell.value && typeof cell.value.text === "string") {
          text = cell.value.text;
        } else {
          text = String(cell.text ?? "");
        }
      } else {
        text = String(cell.value);
      }

      lines.push(`<td ${attrs.join(" ")} style="${styles.join(";")}">${escapeHtml(text)}</td>`);
    }
    lines.push("</tr>");
  }

  lines.push("</table></div></div>");
  lines.push("<script>");
  lines.push("(function(){");
  lines.push("  function fitOnePage(){");
  lines.push("    var wrap=document.getElementById('sheet-wrap');");
  lines.push("    if(!wrap) return;");
  lines.push("    wrap.style.transform='scale(1)';");
  lines.push("    var pageW = 1122; var pageH = 793;");
  lines.push("    var margin = 24;");
  lines.push("    var targetW = pageW - margin;");
  lines.push("    var targetH = pageH - margin;");
  lines.push("    var rect = wrap.getBoundingClientRect();");
  lines.push("    if(!rect.width || !rect.height) return;");
  lines.push("    var scaleW = targetW / rect.width;");
  lines.push("    var scaleH = targetH / rect.height;");
  lines.push("    var scale = Math.min(scaleW, scaleH, 1);");
  lines.push("    wrap.style.transform='scale(' + scale + ')';");
  lines.push("  }");
  lines.push("  window.addEventListener('load', fitOnePage);");
  lines.push("  window.addEventListener('beforeprint', fitOnePage);");
  lines.push("})();");
  lines.push("</script>");
  lines.push("</body></html>");
  return lines.join("");
}

@Injectable()
export class DailySheetExportService {
  constructor(private readonly prisma: PrismaService) {}

  async buildWorkbookForUser(
    userId: string,
    isoDate: string
  ): Promise<Buffer> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
      throw new NotFoundException("Invalid date");
    }

    const day = new Date(`${isoDate}T12:00:00.000Z`);

    const [categories, tasks, followups, fuCompletions] = await Promise.all([
      this.prisma.category.findMany({
        where: { userId },
        orderBy: { name: "asc" },
      }),
      this.prisma.taskSeries.findMany({ where: { userId } }),
      this.prisma.followupClient.findMany({ where: { userId } }),
      this.prisma.followupCompletion.findMany({
        where: {
          date: day,
          followupClient: { userId },
        },
        select: { followupClientId: true },
      }),
    ]);

    const fromDay = new Date(
      `${minTaskSeriesStartIso(tasks, isoDate)}T12:00:00.000Z`
    );
    const taskCompletionsInRange = await this.prisma.taskCompletion.findMany({
      where: {
        taskSeries: { userId },
        date: { gte: fromDay, lte: day },
      },
      select: { taskId: true, date: true },
    });
    const completionDatesByTaskId = buildTaskCompletionDatesMap(
      taskCompletionsInRange
    );

    const completedFuIds = new Set(fuCompletions.map((c) => c.followupClientId));

    const sections = buildSections(
      categories,
      tasks,
      isoDate,
      completionDatesByTaskId
    );
    const oneTimeTasks = tasks.filter(
      (t) =>
        t.frequency === "once" &&
        isTaskVisibleWithCarryForward(t, isoDate, completionDatesByTaskId)
    );
    const commentPairs = buildCommentPairs(
      oneTimeTasks,
      isoDate,
      completionDatesByTaskId
    );

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("VPDM Daily Task");

    applyColumnWidths(ws);
    writeTopHeaderRows(ws, isoDate);

    let currentRow = 4;
    let seq = 1;
    let dataRowIndex = 0;
    let commentsStarted = false;
    let commentRowCursor = 0;
    let commentsGapAdded = false;

    const writeRightSide = (rowNumber: number): void => {
      const hasFollowup = fillRowFollowup(
        ws,
        rowNumber,
        dataRowIndex,
        followups,
        completedFuIds
      );

      if (hasFollowup) {
        dataRowIndex += 1;
        return;
      }

      if (!commentsStarted && commentPairs.length > 0) {
        if (!commentsGapAdded) {
          applyEmptyRightGrid(ws, rowNumber);
          commentsGapAdded = true;
          return;
        }

        commentsStarted = true;
        commentRowCursor = 0;
      }

      if (commentsStarted) {
        if (commentRowCursor === 0) {
          writeInlineCommentsHeader(ws, rowNumber);
        } else {
          writeInlineCommentData(
            ws,
            rowNumber,
            commentPairs[commentRowCursor - 1]
          );
        }
        commentRowCursor += 1;
        return;
      }

      applyEmptyRightGrid(ws, rowNumber);
    };

    for (const sec of sections) {
      ws.mergeCells(currentRow, 1, currentRow, 3);

      const catCell = ws.getCell(currentRow, 1);
      catCell.value = sec.name;
      fillHexSolid(catCell, COLOR_COMMENTS_AND_CATEGORY);
      catCell.font = { bold: true, size: 11 };
      catCell.alignment = { horizontal: "center", vertical: "middle" };

      applyThinBorder(ws.getCell(currentRow, 1));
      applyThinBorder(ws.getCell(currentRow, 2));
      applyThinBorder(ws.getCell(currentRow, 3));

      ws.getCell(currentRow, 4).value = "";
      applyThinBorder(ws.getCell(currentRow, 4));
      ws.getRow(currentRow).height = 18;

      writeRightSide(currentRow);
      currentRow += 1;

      const rowsToWrite: (TaskSeries | null)[] =
        sec.tasks.length > 0 ? sec.tasks : [null];

      for (const task of rowsToWrite) {
        ws.getCell(currentRow, 1).value = seq;
        seq += 1;

        if (task) {
          ws.getCell(currentRow, 2).value =
            isOccurrenceCompletedInWindow(
              task,
              isoDate,
              completionDatesByTaskId
            )
              ? TICK_DONE
              : TICK_EMPTY;
          ws.getCell(currentRow, 3).value = task.title;
        } else {
          ws.getCell(currentRow, 2).value = TICK_EMPTY;
          ws.getCell(currentRow, 3).value = "";
        }

        ws.getCell(currentRow, 1).alignment = {
          horizontal: "center",
          vertical: "middle",
        };
        ws.getCell(currentRow, 2).alignment = {
          horizontal: "center",
          vertical: "middle",
        };
        ws.getCell(currentRow, 3).alignment = {
          horizontal: "left",
          vertical: "middle",
          wrapText: true,
        };

        applyThinBorder(ws.getCell(currentRow, 1));
        applyThinBorder(ws.getCell(currentRow, 2));
        applyThinBorder(ws.getCell(currentRow, 3));

        ws.getCell(currentRow, 4).value = "";
        applyThinBorder(ws.getCell(currentRow, 4));

        ws.getRow(currentRow).height = task?.title ? 16.4 : 15;

        writeRightSide(currentRow);
        currentRow += 1;
      }
    }

    while (commentsStarted && commentRowCursor <= commentPairs.length) {
      for (let c = 1; c <= 4; c++) {
        ws.getCell(currentRow, c).value = "";
        applyThinBorder(ws.getCell(currentRow, c));
      }

      writeInlineCommentData(
        ws,
        currentRow,
        commentPairs[commentRowCursor - 1]
      );

      currentRow += 1;
      commentRowCursor += 1;
    }

    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf);
  }

  async buildPrintHtmlForUser(userId: string, isoDate: string): Promise<string> {
    const buf = await this.buildWorkbookForUser(userId, isoDate);
    const wb = new ExcelJS.Workbook();

    await (wb.xlsx as unknown as { load: (data: unknown) => Promise<unknown> }).load(
      buf
    );

    const ws = wb.worksheets[0];
    return buildPrintHtmlFromWorksheet(ws, `VPDM Daily Task ${isoDate}`);
  }
}