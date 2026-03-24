import { Injectable, NotFoundException } from "@nestjs/common";
import * as ExcelJS from "exceljs";
import type { FollowupClient, TaskSeries } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

const TICK_EMPTY = "❏";
const TICK_DONE = "☑";

/** Same weekday order as `TaskBoard.tsx` */
const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

/**
 * Follow-up track keys for DB matching (`normTrack`); order = Excel column pairs E–P.
 * Row 2 display strings differ slightly from DB (spaces) — see `EXCEL_ROW2_TRACK_LABELS`.
 */
const VPDM_TRACKS = [
  "Amazon Client Followup",
  "Amazon New client Free",
  "Amazon Audit Client",
  "Flipkart Client Followup",
  "Flipkart New client Free",
  "Flipkart Audit Client",
] as const;

/** Exact merged header text in row 2 — matches `Daily Task .xlsx` */
const EXCEL_ROW2_TRACK_LABELS = [
  "Amazon Client Followup",
  "Amazon New client Free",
  "Amazon Audit Client ",
  "Flipkart  Client Followup",
  "Flipkart New client Free",
  "Flipkart Audit Client ",
] as const;

/** Match `Daily Task .xlsx` theme/tint fills */
const THEME_TINT_LIGHT = 0.7999816888943144;
const THEME_TINT_FLIP_NEW = 0.8999908444471572;
const THEME_TINT_SUBHEADER = -0.0999786370433668;

/** Merged F:H + tick E, merged J:P + tick I — same as reference workbook */
const COMMENT_PAIR_ROWS = 9;

/** First four comment lines from `Daily Task .xlsx` (left F:H only; J:P empty like file) */
const COMMENT_LINE_DEFAULTS = [
  "ANCS Acupressure followup",
  "Grinish followup",
  "IT Team Task ",
  "Porclean meeting",
] as const;

const LAST_COL = 16;

function fillThemeSolid(cell: ExcelJS.Cell, theme: number, tint: number): void {
  /* Excel theme + tint (see `Daily Task .xlsx`); exceljs typings omit tint/indexed */
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { theme, tint } as unknown as ExcelJS.Color,
    bgColor: { indexed: 64 } as unknown as ExcelJS.Color,
  };
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function isoDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function isoToUtcMidday(iso: string): Date {
  return new Date(`${iso}T12:00:00.000Z`);
}

function addDaysUtc(utcDate: Date, days: number): Date {
  return new Date(utcDate.getTime() + days * 24 * 60 * 60 * 1000);
}

function lastDayOfMonthUTC(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

function normCat(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

function isWeekdayOption(
  val: string | null | undefined
): val is (typeof WEEKDAYS)[number] {
  return val != null && (WEEKDAYS as readonly string[]).includes(val);
}

function isTaskVisibleOnDate(t: TaskSeries, selectedIso: string): boolean {
  const seriesStartIso = isoDateOnly(t.startDate);
  if (selectedIso < seriesStartIso) return false;
  if (t.endDate && selectedIso > isoDateOnly(t.endDate)) return false;

  if (t.frequency === "daily") return true;

  if (t.frequency === "weekly") {
    if (!isWeekdayOption(t.repeatWeekday)) return false;

    const startDate = isoToUtcMidday(seriesStartIso);
    const startDow = startDate.getUTCDay();
    const targetDow = WEEKDAYS.indexOf(t.repeatWeekday);
    const diff = (targetDow - startDow + 7) % 7;
    const firstDue = addDaysUtc(startDate, diff);

    const selectedDate = isoToUtcMidday(selectedIso);
    const msDay = 24 * 60 * 60 * 1000;
    const daysDiff = Math.round(
      (selectedDate.getTime() - firstDue.getTime()) / msDay
    );
    return daysDiff >= 0 && daysDiff % 7 === 0;
  }

  if (t.frequency === "monthly") {
    if (typeof t.repeatDayOfMonth !== "number") return false;
    const repeatDom = t.repeatDayOfMonth;

    const selectedDate = isoToUtcMidday(selectedIso);
    const selectedYear = selectedDate.getUTCFullYear();
    const selectedMonth0 = selectedDate.getUTCMonth();

    const expectedDueDay = Math.min(
      repeatDom,
      lastDayOfMonthUTC(selectedYear, selectedMonth0)
    );
    const expectedIso = `${selectedYear}-${pad2(
      selectedMonth0 + 1
    )}-${pad2(expectedDueDay)}`;
    if (expectedIso !== selectedIso) return false;

    const startDate = isoToUtcMidday(seriesStartIso);
    const startYear = startDate.getUTCFullYear();
    const startMonth0 = startDate.getUTCMonth();

    const startDueDay = Math.min(
      repeatDom,
      lastDayOfMonthUTC(startYear, startMonth0)
    );
    const startDueIso = `${startYear}-${pad2(startMonth0 + 1)}-${pad2(
      startDueDay
    )}`;

    let firstDueIso = startDueIso;
    if (startDueIso < seriesStartIso) {
      const next = new Date(Date.UTC(startYear, startMonth0 + 1, 1));
      const nextYear = next.getUTCFullYear();
      const nextMonth0 = next.getUTCMonth();
      const nextDueDay = Math.min(
        repeatDom,
        lastDayOfMonthUTC(nextYear, nextMonth0)
      );
      firstDueIso = `${nextYear}-${pad2(nextMonth0 + 1)}-${pad2(nextDueDay)}`;
    }

    return selectedIso >= firstDueIso;
  }

  return false;
}

function sortForSection(tasks: TaskSeries[]): TaskSeries[] {
  return [...tasks].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
  );
}

type Section = { name: string; tasks: TaskSeries[] };

function buildSections(
  categoryRows: { name: string }[],
  tasks: TaskSeries[],
  isoDate: string
): Section[] {
  const visible = tasks.filter((t) => isTaskVisibleOnDate(t, isoDate));
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

/** VPDM title row date like 20/03/26 */
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

function fillRowFollowup(
  ws: ExcelJS.Worksheet,
  r: number,
  dataRowIndex: number,
  followups: FollowupClient[],
  completedFuIds: Set<string>
): void {
  for (let ti = 0; ti < VPDM_TRACKS.length; ti++) {
    const nameCol = 6 + 2 * ti;
    const tickCol = nameCol - 1;
    const clients = clientsForTrack(followups, VPDM_TRACKS[ti]);
    const fu = clients[dataRowIndex];
    if (fu) {
      ws.getCell(r, nameCol).value = fu.clientName;
      ws.getCell(r, tickCol).value = completedFuIds.has(fu.id)
        ? TICK_DONE
        : TICK_EMPTY;
    } else {
      ws.getCell(r, nameCol).value = "";
      ws.getCell(r, tickCol).value = TICK_EMPTY;
    }
    applyThinBorder(ws.getCell(r, tickCol));
    applyThinBorder(ws.getCell(r, nameCol));
  }
}

function applyColumnWidths(ws: ExcelJS.Worksheet): void {
  ws.getColumn(1).width = 5;
  ws.getColumn(2).width = 9;
  ws.getColumn(3).width = 44;
  ws.getColumn(4).width = 3;
  for (let c = 5; c <= 16; c++) {
    ws.getColumn(c).width = c % 2 === 1 ? 9 : 24;
  }
}

/** Row 2 track pair theme fills — same order as `Daily Task .xlsx` */
const TRACK_HEADER_THEMES: { theme: number; tint: number }[] = [
  { theme: 5, tint: THEME_TINT_LIGHT },
  { theme: 6, tint: THEME_TINT_LIGHT },
  { theme: 8, tint: THEME_TINT_LIGHT },
  { theme: 9, tint: THEME_TINT_LIGHT },
  { theme: 3, tint: THEME_TINT_FLIP_NEW },
  { theme: 5, tint: THEME_TINT_LIGHT },
];

/** 1-based column index → Excel column letter (supports A..Z and beyond) */
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

/**
 * Row 1 title + rows 2–3: Role and Responsibility (A–C) and client follow-up tracks (E–P) on the same grid
 * as `Daily Task .xlsx` — no separate “Client follow-up” section title.
 */
function writeTopHeaderRows(ws: ExcelJS.Worksheet, isoDate: string): void {
  const title = `VPDM (${vpdmDateLabel(isoDate)})`;
  for (let c = 1; c <= LAST_COL; c++) {
    const cell = ws.getCell(1, c);
    cell.value = title;
    fillThemeSolid(cell, 7, THEME_TINT_LIGHT);
    applyThinBorder(cell);
  }
  ws.mergeCells(`A1:${excelColLetter(LAST_COL)}1`);
  ws.getRow(1).height = 22;
  ws.getCell(1, 1).alignment = {
    horizontal: "center",
    vertical: "middle",
  };
  ws.getCell(1, 1).font = { bold: true, size: 12 };

  ws.mergeCells("A2:C2");
  const role = ws.getCell(2, 1);
  role.value = "Role and Responsibility";
  fillThemeSolid(role, 5, THEME_TINT_LIGHT);
  role.font = { bold: true };
  role.alignment = {
    horizontal: "center",
    vertical: "middle",
  };
  applyThinBorder(ws.getCell(2, 1));
  applyThinBorder(ws.getCell(2, 2));
  applyThinBorder(ws.getCell(2, 3));

  for (let ti = 0; ti < VPDM_TRACKS.length; ti++) {
    const c0 = 5 + 2 * ti;
    const c1 = c0 + 1;
    const label = EXCEL_ROW2_TRACK_LABELS[ti] ?? VPDM_TRACKS[ti];
    const { theme, tint } = TRACK_HEADER_THEMES[ti] ?? {
      theme: 5,
      tint: THEME_TINT_LIGHT,
    };
    try {
      ws.mergeCells(2, c0, 2, c1);
    } catch {
      /* ignore */
    }
    const mc = ws.getCell(2, c0);
    mc.value = label;
    fillThemeSolid(mc, theme, tint);
    mc.font = { bold: true, size: 10 };
    mc.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    applyThinBorder(mc);
    applyThinBorder(ws.getCell(2, c1));
  }

  ws.getCell(3, 1).value = "No";
  ws.getCell(3, 2).value = "Tick";
  ws.getCell(3, 3).value = "Operational Team";
  for (const c of [1, 2, 3]) {
    const cell = ws.getCell(3, c);
    fillThemeSolid(cell, 9, THEME_TINT_LIGHT);
    cell.font = { bold: true };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    applyThinBorder(cell);
  }

  const r3Pair = [
    "Tick",
    "Client Name",
    "Tick",
    "Client Name",
    "Tick",
    "Client Name",
    "Tick",
    "Client Name",
    "Tick",
    "Client Name",
    "Tick",
    "Client Name",
  ];
  for (let i = 0; i < 6; i++) {
    const tickCol = 5 + 2 * i;
    const nameCol = 6 + 2 * i;
    ws.getCell(3, tickCol).value = r3Pair[i * 2];
    ws.getCell(3, nameCol).value = r3Pair[i * 2 + 1];
    for (const c of [tickCol, nameCol]) {
      const cell = ws.getCell(3, c);
      fillThemeSolid(cell, 2, THEME_TINT_SUBHEADER);
      cell.font = { bold: true, size: 10 };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      applyThinBorder(cell);
    }
  }
  ws.getCell(3, 4).value = "";
  applyThinBorder(ws.getCell(3, 4));
  ws.getRow(3).height = 18;
}

/**
 * Comments block like `Daily Task .xlsx`: merged F:H and J:P headers, then 9 rows
 * with ticks in E and I; F:H text (defaults for first 4 rows); J:P empty like file.
 */
function writeCommentDataRow(
  ws: ExcelJS.Worksheet,
  r: number,
  leftText: string,
  rightText: string
): void {
  for (const c of [1, 2, 3, 4]) {
    const cell = ws.getCell(r, c);
    cell.value = "";
    applyThinBorder(cell);
  }

  const tickE = ws.getCell(r, 5);
  tickE.value = TICK_EMPTY;
  tickE.alignment = { horizontal: "center", vertical: "middle" };
  applyThinBorder(tickE);

  const tickI = ws.getCell(r, 9);
  tickI.value = TICK_EMPTY;
  tickI.alignment = { horizontal: "center", vertical: "middle" };
  applyThinBorder(tickI);

  try {
    ws.mergeCells(`F${r}:H${r}`);
  } catch {
    /* ignore */
  }
  try {
    ws.mergeCells(`J${r}:P${r}`);
  } catch {
    /* ignore */
  }

  const leftMaster = ws.getCell(r, 6);
  leftMaster.value = leftText || null;
  leftMaster.alignment = { horizontal: "left", vertical: "middle", wrapText: true };
  applyThinBorder(leftMaster);

  const rightMaster = ws.getCell(r, 10);
  rightMaster.value = rightText || null;
  rightMaster.alignment = { horizontal: "left", vertical: "middle", wrapText: true };
  applyThinBorder(rightMaster);

  ws.getRow(r).height = 18;
}

/** One empty row (borders A–P) above the Comments block */
function writeBlankRowAboveComments(ws: ExcelJS.Worksheet, r: number): void {
  for (let c = 1; c <= LAST_COL; c++) {
    ws.getCell(r, c).value = "";
    applyThinBorder(ws.getCell(r, c));
  }
  ws.getRow(r).height = 18;
}

function writeCommentsBlock(ws: ExcelJS.Worksheet, headerRow: number): void {
  const h = headerRow;

  for (const c of [1, 2, 3, 4]) {
    const cell = ws.getCell(h, c);
    cell.value = "";
    applyThinBorder(cell);
  }
  ws.getCell(h, 5).value = "";
  applyThinBorder(ws.getCell(h, 5));
  ws.getCell(h, 9).value = "";
  applyThinBorder(ws.getCell(h, 9));

  try {
    ws.mergeCells(`F${h}:H${h}`);
  } catch {
    /* ignore */
  }
  try {
    ws.mergeCells(`J${h}:P${h}`);
  } catch {
    /* ignore */
  }

  const leftHead = ws.getCell(h, 6);
  leftHead.value = "Comments";
  fillThemeSolid(leftHead, 9, THEME_TINT_LIGHT);
  leftHead.font = { bold: true };
  leftHead.alignment = { horizontal: "center", vertical: "middle" };
  applyThinBorder(leftHead);
  applyThinBorder(ws.getCell(h, 7));
  applyThinBorder(ws.getCell(h, 8));

  const rightHead = ws.getCell(h, 10);
  rightHead.value = "Comments";
  fillThemeSolid(rightHead, 9, THEME_TINT_LIGHT);
  rightHead.font = { bold: true };
  rightHead.alignment = { horizontal: "center", vertical: "middle" };
  for (let c = 10; c <= 16; c++) {
    applyThinBorder(ws.getCell(h, c));
  }

  for (let i = 0; i < COMMENT_PAIR_ROWS; i++) {
    const r = h + 1 + i;
    const lt =
      i < COMMENT_LINE_DEFAULTS.length ? COMMENT_LINE_DEFAULTS[i]! : "";
    writeCommentDataRow(ws, r, lt, "");
  }
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

    const [categories, tasks, completions, followups, fuCompletions] =
      await Promise.all([
        this.prisma.category.findMany({
          where: { userId },
          orderBy: { name: "asc" },
        }),
        this.prisma.taskSeries.findMany({ where: { userId } }),
        this.prisma.taskCompletion.findMany({
          where: {
            date: day,
            taskSeries: { userId },
          },
          select: { taskId: true },
        }),
        this.prisma.followupClient.findMany({ where: { userId } }),
        this.prisma.followupCompletion.findMany({
          where: {
            date: day,
            followupClient: { userId },
          },
          select: { followupClientId: true },
        }),
      ]);

    const completedTaskIds = new Set(completions.map((c) => c.taskId));
    const completedFuIds = new Set(fuCompletions.map((c) => c.followupClientId));

    const sections = buildSections(categories, tasks, isoDate);

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("VPDM Daily Task");
    applyColumnWidths(ws);
    writeTopHeaderRows(ws, isoDate);

    let currentRow = 4;
    let seq = 1;
    let dataRowIndex = 0;

    for (const sec of sections) {
      ws.mergeCells(currentRow, 1, currentRow, 3);
      const catCell = ws.getCell(currentRow, 1);
      catCell.value = sec.name;
      fillThemeSolid(catCell, 9, THEME_TINT_LIGHT);
      catCell.font = { bold: true };
      catCell.alignment = { horizontal: "center", vertical: "middle" };
      applyThinBorder(catCell);
      applyThinBorder(ws.getCell(currentRow, 2));
      applyThinBorder(ws.getCell(currentRow, 3));
      fillRowFollowup(
        ws,
        currentRow,
        dataRowIndex,
        followups,
        completedFuIds
      );
      dataRowIndex += 1;
      ws.getRow(currentRow).height = 20;
      currentRow += 1;

      const rowsToWrite: (TaskSeries | null)[] =
        sec.tasks.length > 0 ? sec.tasks : [null];

      for (const task of rowsToWrite) {
        ws.getCell(currentRow, 1).value = seq;
        seq += 1;

        if (task) {
          ws.getCell(currentRow, 2).value = completedTaskIds.has(task.id)
            ? TICK_DONE
            : TICK_EMPTY;
          ws.getCell(currentRow, 3).value = task.title;
        } else {
          ws.getCell(currentRow, 2).value = TICK_EMPTY;
          ws.getCell(currentRow, 3).value = "";
        }

        for (const c of [1, 2, 3]) {
          const cell = ws.getCell(currentRow, c);
          cell.alignment =
            c === 3
              ? { horizontal: "left", vertical: "middle", wrapText: true }
              : { horizontal: "center", vertical: "middle" };
          applyThinBorder(cell);
        }

        fillRowFollowup(
          ws,
          currentRow,
          dataRowIndex,
          followups,
          completedFuIds
        );
        dataRowIndex += 1;
        currentRow += 1;
      }
    }

    writeBlankRowAboveComments(ws, currentRow);
    currentRow += 1;

    writeCommentsBlock(ws, currentRow);

    ws.views = [{ state: "frozen", ySplit: 3 }];

    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf);
  }
}
