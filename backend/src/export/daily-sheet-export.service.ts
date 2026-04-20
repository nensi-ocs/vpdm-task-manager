import { Injectable, NotFoundException } from "@nestjs/common";
import * as ExcelJS from "exceljs";
import { Buffer } from "buffer";
import type { FollowupClient, TaskSeries } from "@prisma/client";
import { PipelineClientsService } from "../pipeline-clients/pipeline-clients.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  isOccurrenceCompletedInWindow,
  isTaskVisibleWithCarryForward,
  weekdayNameInKolkataFromIso,
} from "../tasks/task-schedule.util";

const TICK_EMPTY = "❏";
const TICK_DONE = "☑";

type TaskSeriesSchedule = TaskSeries & {
  repeatIntervalDays?: number | null;
  /** Optional for backward compatibility with older exports */
  vpdmArea?: string | null;
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

const LAST_COL = 16;
/** First column of the Amazon/Flipkart tick+name grid (track index 0 = col E). */
const TICK_COL_FIRST = 5;

/** Print HTML: if a line of text would exceed this many characters, continue on the next line. */
const PRINT_MAX_CHARS_PER_LINE = 28;

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

function minTaskSeriesStartIso(
  tasks: TaskSeriesSchedule[],
  selectedIso: string
): string {
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
  const visible = tasks.filter((t) => {
    const area = t.vpdmArea ?? "main";
    const category = normCat(t.category);

    return (
      area !== "comments" &&
      category !== "meeting" &&
      isTaskVisibleWithCarryForward(t, isoDate, completionDatesByTaskId)
    );
  });

  const catNames = new Set(
    categoryRows
      .map((c) => normCat(c.name))
      .filter((name) => name !== "meeting")
  );

  const sections: Section[] = [];

  for (const c of categoryRows) {
    if (normCat(c.name) === "meeting") continue;

    const ts = sortForSection(
      visible.filter((t) => normCat(t.category) === normCat(c.name))
    );
    if (ts.length === 0) continue;

    sections.push({ name: c.name, tasks: ts });
  }

  const orphans = sortForSection(
    visible.filter((t) => {
      const n = normCat(t.category);

      // CRITICAL FIX:
      // do not let Meeting fall into Uncategorized
      if (n === "meeting") return false;

      return !n || !catNames.has(n);
    })
  );

  if (orphans.length > 0) {
    sections.push({ name: "Uncategorized", tasks: orphans });
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
  return s
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

function applyThinBordersToRowRange(
  ws: ExcelJS.Worksheet,
  row: number,
  colFrom: number,
  colTo: number
): void {
  for (let c = colFrom; c <= colTo; c++) {
    applyThinBorder(ws.getCell(row, c));
  }
}

/** Tick column for VPDM track index `ti` (0 = Amazon Client Followup). */
function trackTickCol(ti: number): number {
  return TICK_COL_FIRST + 2 * ti;
}

function trackNameCol(ti: number): number {
  return TICK_COL_FIRST + 1 + 2 * ti;
}

function applyEmptyRightGrid(ws: ExcelJS.Worksheet, r: number): void {
  for (let c = TICK_COL_FIRST; c <= LAST_COL; c++) {
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
    const tickCol = trackTickCol(ti);
    const nameCol = trackNameCol(ti);
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
  ws.getCell(2, 4).value = "";
  applyThinBordersToRowRange(ws, 2, 1, 4);

  for (let ti = 0; ti < VPDM_TRACKS.length; ti++) {
    const c0 = trackTickCol(ti);
    const c1 = trackNameCol(ti);
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

  for (let i = 0; i < VPDM_TRACKS.length; i++) {
    const tickCol = trackTickCol(i);
    const nameCol = trackNameCol(i);

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
  const tasks = sortForSection(oneTimeTasks);

  const left: TaskSeriesSchedule[] = [];
  const right: TaskSeriesSchedule[] = [];

  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

  for (const t of tasks) {
    const c = norm(t.category ?? "");
    const isAmazon = c.includes("amazon");
    const isFlipkart = c.includes("flipkart");
    if (isFlipkart && !isAmazon) right.push(t);
    else if (isAmazon && !isFlipkart) left.push(t);
    else if (left.length <= right.length) left.push(t);
    else right.push(t);
  }

  const totalPairs = Math.max(left.length, right.length);
  if (totalPairs === 0) return [];

  const pairs: CommentPair[] = [];

  for (let i = 0; i < totalPairs; i++) {
    const leftTask = left[i];
    const rightTask = right[i];

    pairs.push({
      leftText: leftTask?.title ?? "",
      rightText: rightTask?.title ?? "",
      leftDone: leftTask
        ? isOccurrenceCompletedInWindow(
            leftTask,
            isoDate,
            completionDatesByTaskId
          )
        : false,
      rightDone: rightTask
        ? isOccurrenceCompletedInWindow(
            rightTask,
            isoDate,
            completionDatesByTaskId
          )
        : false,
    });
  }

  return pairs;
}

function writeInlineTwoColumnSectionHeader(
  ws: ExcelJS.Worksheet,
  r: number,
  title: string
): void {
  ws.mergeCells(`E${r}:J${r}`);
  ws.mergeCells(`K${r}:P${r}`);

  const leftHead = ws.getCell(r, 5);
  leftHead.value = title;
  fillHexSolid(leftHead, COLOR_COMMENTS_AND_CATEGORY);
  leftHead.font = { bold: true, size: 11 };
  leftHead.alignment = { horizontal: "center", vertical: "middle" };

  const rightHead = ws.getCell(r, 11);
  rightHead.value = title;
  fillHexSolid(rightHead, COLOR_COMMENTS_AND_CATEGORY);
  rightHead.font = { bold: true, size: 11 };
  rightHead.alignment = { horizontal: "center", vertical: "middle" };

  applyThinBordersToRowRange(ws, r, 5, 16);

  ws.getRow(r).height = 18;
}

function writeInlineCommentsHeader(ws: ExcelJS.Worksheet, r: number): void {
  writeInlineTwoColumnSectionHeader(ws, r, "Comments");
}

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

  applyThinBordersToRowRange(ws, r, 6, 10);
  applyThinBordersToRowRange(ws, r, 12, 16);

  ws.getRow(r).height = leftText || rightText ? 18 : 15;
}

/**
 * Meeting in the right grid as two side-by-side tables (E–J / K–P), same cell pattern as Comments.
 * Tasks are split left/right using the same Amazon / Flipkart / balance rules as comments.
 */
function writeMeetingSectionRightGrid(
  ws: ExcelJS.Worksheet,
  startRow: number,
  tasks: TaskSeriesSchedule[],
  isoDate: string,
  completionDatesByTaskId: Map<number, Set<string>>,
  startSeq: number
): { nextRow: number; nextSeq: number; lastRow: number } {
  const pairs = buildCommentPairs(
    tasks,
    isoDate,
    completionDatesByTaskId
  );

  let r = startRow;
  let seq = startSeq;

  // Do not write A–D: meeting rows may reuse sheet rows that already have Role and Responsibility data.
  writeInlineTwoColumnSectionHeader(ws, r, "Meeting");
  let lastRow = r;
  r++;

  for (const pair of pairs) {
    writeInlineCommentData(ws, r, pair);

    if (pair.leftText) seq += 1;
    if (pair.rightText) seq += 1;

    lastRow = r;
    r++;
  }

  return { nextRow: r, nextSeq: seq, lastRow };
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function wrapParagraphToLines(paragraph: string, maxLen: number): string[] {
  const trimmed = paragraph.trim();
  if (!trimmed) {
    return [""];
  }

  const words = trimmed.split(/\s+/);
  const out: string[] = [];
  let current = "";

  for (const w of words) {
    if (w.length > maxLen) {
      if (current) {
        out.push(current);
        current = "";
      }
      for (let i = 0; i < w.length; i += maxLen) {
        out.push(w.slice(i, i + maxLen));
      }
      continue;
    }

    const trial = current ? `${current} ${w}` : w;
    if (trial.length <= maxLen) {
      current = trial;
    } else {
      if (current) {
        out.push(current);
      }
      current = w;
    }
  }

  if (current) {
    out.push(current);
  }

  return out.length > 0 ? out : [""];
}

function wrapHtmlCellText(raw: string, maxCharsPerLine: number): string {
  if (!raw) {
    return "";
  }
  if (maxCharsPerLine <= 0) {
    return escapeHtml(raw);
  }

  const paragraphs = raw.split(/\r\n|\n|\r/);
  return paragraphs
    .map((para) =>
      wrapParagraphToLines(para, maxCharsPerLine).map(escapeHtml).join("<br />")
    )
    .join("<br />");
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

function getCellDisplayText(cell: ExcelJS.Cell): string {
  const v = cell.value;
  if (v == null) {
    return "";
  }
  if (typeof v === "object") {
    const o = v as { richText?: { text: string }[]; text?: string };
    if ("richText" in o && Array.isArray(o.richText)) {
      return o.richText.map((p) => p.text).join("");
    }
    if ("text" in o && typeof o.text === "string") {
      return o.text;
    }
    return String(cell.text ?? "");
  }
  return String(v);
}

function htmlInlineStylesFromCell(cell: ExcelJS.Cell): string[] {
  const b = cell.border as {
    top?: ExcelJS.Border;
    right?: ExcelJS.Border;
    bottom?: ExcelJS.Border;
    left?: ExcelJS.Border;
  };

  const styles: string[] = [
    `border-top:${borderCssSide(b?.top)}`,
    `border-right:${borderCssSide(b?.right)}`,
    `border-bottom:${borderCssSide(b?.bottom)}`,
    `border-left:${borderCssSide(b?.left)}`,
    "background-color:#fff",
    "color:#000",
  ];

  const fill = cell.fill as
    | undefined
    | { type?: string; pattern?: string; fgColor?: { argb?: string } };

  const argb = fill?.fgColor?.argb;
  if (fill?.type === "pattern" && fill?.pattern === "solid" && argb) {
    styles.push(`background-color:#${argb.slice(-6)}`);
  }

  if (cell.alignment?.horizontal) {
    styles.push(`text-align:${cell.alignment.horizontal}`);
  }
  if (cell.alignment?.vertical) {
    styles.push(`vertical-align:${cell.alignment.vertical}`);
  }
  if (cell.alignment?.wrapText) {
    styles.push("white-space: pre-wrap");
  }
  if (cell.font?.bold) {
    styles.push("font-weight:700");
  }
  if (typeof cell.font?.size === "number") {
    styles.push(`font-size:${cell.font.size}px`);
  }

  return styles;
}

function buildMergeIndex(merges: string[]): {
  mergeByMaster: Map<string, { rowSpan: number; colSpan: number }>;
  mergedCovered: Set<string>;
} {
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

  return { mergeByMaster, mergedCovered };
}

function worksheetMaxRow(ws: ExcelJS.Worksheet): number {
  let maxRow = ws.rowCount ?? 0;
  const rowsPrivate = (ws as unknown as { _rows?: Record<string, unknown> })._rows;
  if (rowsPrivate && typeof rowsPrivate === "object") {
    for (const k of Object.keys(rowsPrivate)) {
      const n = Number(k);
      if (Number.isFinite(n) && n > maxRow) maxRow = n;
    }
  }
  return maxRow;
}

function buildHtmlTableFromWorksheet(
  ws: ExcelJS.Worksheet,
  maxCol: number
): string {
  const { mergeByMaster, mergedCovered } = buildMergeIndex(ws.model.merges ?? []);
  const maxRow = worksheetMaxRow(ws);

  const lines: string[] = [];
  lines.push("<table>");

  for (let r = 1; r <= maxRow; r++) {
    lines.push("<tr>");
    for (let c = 1; c <= maxCol; c++) {
      const key = `${r}:${c}`;
      if (mergedCovered.has(key)) continue;

      const cell = ws.getCell(r, c);
      const merge = mergeByMaster.get(key);
      const attrs: string[] = [];

      if (merge?.rowSpan && merge.rowSpan > 1) {
        attrs.push(`rowspan="${merge.rowSpan}"`);
      }
      if (merge?.colSpan && merge.colSpan > 1) {
        attrs.push(`colspan="${merge.colSpan}"`);
      }

      attrs.push(`data-col="${c}"`);

      const styles = htmlInlineStylesFromCell(cell);
      const text = getCellDisplayText(cell);

      lines.push(
        `<td ${attrs.join(" ")} style="${styles.join(";")}">${wrapHtmlCellText(
          text,
          PRINT_MAX_CHARS_PER_LINE
        )}</td>`
      );
    }
    lines.push("</tr>");
  }

  lines.push("</table>");
  return lines.join("");
}

function printDocumentCss(): string {
  return [
    "@page { size: A4 landscape; margin: 6mm; }",
    "body { font-family: Arial, sans-serif; margin: 0; background:#fff; color:#000; }",
    "#print-root { width: 100%; }",
    ".sheet-wrap { transform-origin: top left; width: max-content; }",
    "table { border-collapse: collapse; table-layout: fixed; }",
    "td { font-size: 11px; padding: 1px 3px; vertical-align: middle; " +
      "word-wrap: break-word; overflow-wrap: anywhere; word-break: break-word; " +
      "hyphens: auto; -webkit-hyphens: auto; background:#fff; color:#000; }",
    "#print-root table td { border: 1px solid #000 !important; box-sizing: border-box; }",
    '#print-root table td[data-col="4"] { border-left: 2px solid #000 !important; }',
    '#print-root table td[data-col="1"][colspan="3"] { border-right: 2px solid #000 !important; }',
    "@media print { .no-print { display: none; } .sheet-wrap { transform: none !important; } }",
  ].join("\n");
}

function buildPrintHtmlCombined(
  wsDaily: ExcelJS.Worksheet,
  docTitle: string
): string {
  const lines: string[] = [];
  lines.push("<!doctype html>");
  lines.push('<html lang="en"><head><meta charset="utf-8" />');
  lines.push(`<title>${escapeHtml(docTitle)}</title>`);
  lines.push("<style>");
  lines.push(printDocumentCss());
  lines.push("</style></head><body>");
  lines.push('<div class="no-print" style="margin:8px 0;">');
  lines.push('<button onclick="window.print()">Print</button>');
  lines.push("</div>");
  lines.push('<div id="print-root">');
  lines.push('<div class="sheet-wrap">');
  lines.push(buildHtmlTableFromWorksheet(wsDaily, LAST_COL));
  lines.push("</div>");
  lines.push("</div>");
  lines.push("<script>");
  lines.push("(function(){");
  lines.push("  function fitSheets(){");
  lines.push(
    "    var wraps = document.querySelectorAll('#print-root .sheet-wrap');"
  );
  lines.push("    for (var i = 0; i < wraps.length; i++) {");
  lines.push("      var wrap = wraps[i];");
  lines.push("      if(!wrap) continue;");
  lines.push("      wrap.style.transform='scale(1)';");
  lines.push("      var PX_PER_MM = 96 / 25.4;");
  lines.push("      var pageW = 297 * PX_PER_MM;");
  lines.push("      var pageH = 210 * PX_PER_MM;");
  lines.push("      var marginMm = 6;");
  lines.push("      var margin = marginMm * PX_PER_MM;");
  lines.push("      var safety = 4;");
  lines.push("      var targetW = pageW - margin * 2 - safety;");
  lines.push("      var targetH = pageH - margin * 2 - safety;");
  lines.push("      var rect = wrap.getBoundingClientRect();");
  lines.push("      if(!rect.width || !rect.height) continue;");
  lines.push("      var scaleW = targetW / rect.width;");
  lines.push("      var scaleH = targetH / rect.height;");
  lines.push("      var scale = Math.min(scaleW, scaleH, 1);");
  lines.push("      wrap.style.transform='scale(' + scale + ')';");
  lines.push("    }");
  lines.push("  }");
  lines.push("  window.addEventListener('load', fitSheets);");
  lines.push("  window.addEventListener('beforeprint', fitSheets);");
  lines.push("})();");
  lines.push("</script>");
  lines.push("</body></html>");

  return lines.join("");
}

type PipelineRow = {
  clientName: string;
  source: string;
  stage: string;
  stageLabel: string;
  stageOrder: number;
  lostReason: string | null;
};

type PipelineStageDef = {
  key: string;
  label: string;
  order: number;
};

function writePipelineSectionRightOnly(
  ws: ExcelJS.Worksheet,
  startRow: number,
  clients: PipelineRow[],
  stageDefs: PipelineStageDef[]
): number {
  let r = startRow;

  const START_COL = 5; // E
  const END_COL = 16; // P
  const TOTAL_COLS = END_COL - START_COL + 1;
  const stageTitleFill = "DAF2D0";

  const byStage = new Map<string, PipelineRow[]>();

  for (const row of clients) {
    const arr = byStage.get(row.stage) ?? [];
    arr.push(row);
    byStage.set(row.stage, arr);
  }

  for (const [, arr] of byStage) {
    arr.sort((a, b) => a.clientName.localeCompare(b.clientName));
  }

  ws.mergeCells(r, START_COL, r, END_COL);
  const titleCell = ws.getCell(r, START_COL);
  titleCell.value = "Client Pipeline";
  fillHexSolid(titleCell, COLOR_VPDM);
  titleCell.font = { bold: true, size: 12 };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };

  applyThinBordersToRowRange(ws, r, START_COL, END_COL);

  ws.getRow(r).height = 20;
  r++;

  const stages = stageDefs.map((def) => ({
    def,
    rows: (byStage.get(def.key) ?? []).map((row) => row.clientName),
  }));

  const stageCount = stages.length;
  if (stageCount === 0) return r;

  if (stageCount > TOTAL_COLS) {
    throw new Error(
      `Pipeline stage count (${stageCount}) exceeds available columns (${TOTAL_COLS})`
    );
  }

  const baseWidth = Math.floor(TOTAL_COLS / stageCount);
  const remainder = TOTAL_COLS % stageCount;
  const manualWidths = Array.from(
    { length: stageCount },
    (_, i) => baseWidth + (i < remainder ? 1 : 0)
  );

  const stageRanges: { startCol: number; endCol: number }[] = [];
  let colCursor = START_COL;

  for (let i = 0; i < stageCount; i++) {
    const width = manualWidths[i]!;
    const startCol = colCursor;
    const endCol = colCursor + width - 1;

    stageRanges.push({ startCol, endCol });
    colCursor = endCol + 1;
  }

  for (let i = 0; i < stageCount; i++) {
    const stage = stages[i]!;
    const { startCol, endCol } = stageRanges[i]!;

    if (startCol !== endCol) {
      ws.mergeCells(r, startCol, r, endCol);
    }

    const cell = ws.getCell(r, startCol);
    cell.value = `Step ${stage.def.order} - ${stage.def.label}`;
    fillHexSolid(cell, stageTitleFill);
    cell.font = { bold: true, size: 10 };
    cell.alignment = {
      horizontal: "center",
      vertical: "middle",
      wrapText: true,
    };

    for (let c = startCol; c <= endCol; c++) {
      applyThinBorder(ws.getCell(r, c));
    }
  }

  ws.getRow(r).height = 22;
  r++;

  let maxRows = 0;
  for (const s of stages) {
    maxRows = Math.max(maxRows, s.rows.length);
  }

  for (let rowIndex = 0; rowIndex < maxRows; rowIndex++) {
    for (let i = 0; i < stageCount; i++) {
      const stage = stages[i]!;
      const { startCol, endCol } = stageRanges[i]!;

      if (startCol !== endCol) {
        ws.mergeCells(r, startCol, r, endCol);
      }

      const cell = ws.getCell(r, startCol);
      const clientName = stage.rows[rowIndex];

      cell.value = clientName ? `${rowIndex + 1}. ${clientName}` : "";
      cell.alignment = {
        horizontal: "left",
        vertical: "middle",
        wrapText: true,
      };

      applyThinBordersToRowRange(ws, r, startCol, endCol);
    }

    ws.getRow(r).height = 18;
    r++;
  }

  if (maxRows === 0) {
    for (let i = 0; i < stageCount; i++) {
      const { startCol, endCol } = stageRanges[i]!;

      if (startCol !== endCol) {
        ws.mergeCells(r, startCol, r, endCol);
      }

      const cell = ws.getCell(r, startCol);
      cell.value = "No clients";
      cell.font = { italic: true, size: 10 };
      cell.alignment = {
        horizontal: "center",
        vertical: "middle",
      };

      applyThinBordersToRowRange(ws, r, startCol, endCol);
    }

    ws.getRow(r).height = 18;
    r++;
  }

  return r;
}

@Injectable()
export class DailySheetExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pipelineClients: PipelineClientsService
  ) {}

  async buildWorkbookForUser(userId: string, isoDate: string): Promise<Buffer> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
      throw new NotFoundException("Invalid date");
    }

    const day = new Date(`${isoDate}T12:00:00.000Z`);

    const [categories, tasksRaw, followups, fuCompletions, pipelineRows] =
      await Promise.all([
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
        this.pipelineClients.findAllForUser(userId),
      ]);

    const tasks = tasksRaw as unknown as TaskSeriesSchedule[];

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
    const completedFuIds = new Set(
      fuCompletions.map((c) => c.followupClientId)
    );

    const isSundayKolkata = weekdayNameInKolkataFromIso(isoDate) === "Sunday";
    const followupsForSheet = isSundayKolkata ? [] : followups;
    const completedFuIdsForSheet = isSundayKolkata
      ? new Set<string>()
      : completedFuIds;

    const sections = buildSections(
      categories,
      tasks,
      isoDate,
      completionDatesByTaskId
    );

    const commentTasks = tasks.filter((t) => {
      const area = t.vpdmArea ?? "main";
      return (
        t.frequency === "once" &&
        area === "comments" &&
        isTaskVisibleWithCarryForward(t, isoDate, completionDatesByTaskId)
      );
    });

    const meetingTasks = sortForSection(
      tasks.filter((t) => {
        const area = t.vpdmArea ?? "main";
        return (
          area !== "comments" &&
          normCat(t.category) === "meeting" &&
          isTaskVisibleWithCarryForward(t, isoDate, completionDatesByTaskId)
        );
      })
    );

    const commentPairs = buildCommentPairs(
      commentTasks,
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

    let rightSectionLastRow = 3;
    let commentSectionLastRow = 0;

    const writeRightSide = (rowNumber: number): void => {
      const hasFollowup = fillRowFollowup(
        ws,
        rowNumber,
        dataRowIndex,
        followupsForSheet,
        completedFuIdsForSheet
      );

      if (hasFollowup) {
        dataRowIndex += 1;
        rightSectionLastRow = rowNumber;
        return;
      }

      if (!commentsStarted && commentPairs.length > 0) {
        if (!commentsGapAdded) {
          applyEmptyRightGrid(ws, rowNumber);
          commentsGapAdded = true;
          rightSectionLastRow = rowNumber;
          return;
        }

        commentsStarted = true;
        commentRowCursor = 0;
      }

      if (commentsStarted) {
        if (commentRowCursor === 0) {
          writeInlineCommentsHeader(ws, rowNumber);
        } else if (commentRowCursor <= commentPairs.length) {
          writeInlineCommentData(
            ws,
            rowNumber,
            commentPairs[commentRowCursor - 1]
          );
        } else {
          applyEmptyRightGrid(ws, rowNumber);
        }

        if (commentRowCursor <= commentPairs.length) {
          commentSectionLastRow = rowNumber;
        }

        commentRowCursor += 1;
        rightSectionLastRow = rowNumber;
        return;
      }

      applyEmptyRightGrid(ws, rowNumber);
      rightSectionLastRow = rowNumber;
    };

    for (const sec of sections) {
      ws.mergeCells(currentRow, 1, currentRow, 3);

      const catCell = ws.getCell(currentRow, 1);
      catCell.value = sec.name;
      fillHexSolid(catCell, COLOR_COMMENTS_AND_CATEGORY);
      catCell.font = { bold: true, size: 11 };
      catCell.alignment = { horizontal: "center", vertical: "middle" };

      ws.getCell(currentRow, 4).value = "";
      applyThinBordersToRowRange(ws, currentRow, 1, 4);
      ws.getRow(currentRow).height = 18;

      writeRightSide(currentRow);
      currentRow += 1;

      for (const task of sec.tasks) {
        ws.getCell(currentRow, 1).value = seq;
        seq += 1;

        ws.getCell(currentRow, 2).value = isOccurrenceCompletedInWindow(
          task,
          isoDate,
          completionDatesByTaskId
        )
          ? TICK_DONE
          : TICK_EMPTY;
        ws.getCell(currentRow, 3).value = task.title;

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

        ws.getCell(currentRow, 4).value = "";
        applyThinBordersToRowRange(ws, currentRow, 1, 4);
        ws.getRow(currentRow).height = task.title ? 16.4 : 15;

        writeRightSide(currentRow);
        currentRow += 1;
      }
    }

    const maxFollowupRows = Math.max(
      ...VPDM_TRACKS.map((t) => clientsForTrack(followupsForSheet, t).length),
      0
    );

    while (dataRowIndex < maxFollowupRows) {
      writeRightSide(currentRow);

      for (let c = 1; c <= 4; c++) {
        const cell = ws.getCell(currentRow, c);
        cell.value = "";
        applyThinBorder(cell);
      }

      ws.getRow(currentRow).height = 15;
      currentRow += 1;
    }

    if (!commentsStarted && commentPairs.length > 0) {
      applyEmptyRightGrid(ws, currentRow);
      rightSectionLastRow = currentRow;
      currentRow += 1;

      writeInlineCommentsHeader(ws, currentRow);
      commentsStarted = true;
      commentRowCursor = 1;
      rightSectionLastRow = currentRow;
      commentSectionLastRow = currentRow;
      currentRow += 1;
    }

    while (commentsStarted && commentRowCursor <= commentPairs.length) {
      for (let c = 1; c <= 4; c++) {
        ws.getCell(currentRow, c).value = "";
      }
      applyThinBordersToRowRange(ws, currentRow, 1, 4);

      writeInlineCommentData(
        ws,
        currentRow,
        commentPairs[commentRowCursor - 1]
      );

      rightSectionLastRow = currentRow;
      commentSectionLastRow = currentRow;
      currentRow += 1;
      commentRowCursor += 1;
    }

    const meetingAnchorRow =
      commentSectionLastRow > 0 ? commentSectionLastRow : rightSectionLastRow;

    // After Comments (E–P), place Meeting in the same right-hand grid (E–P), then Client Pipeline below.
    // One blank row after the last comment row, then Meeting (fills the gap above Pipeline in typical exports).
    const rowAfterCommentsGap =
      commentSectionLastRow > 0 ? commentSectionLastRow + 2 : meetingAnchorRow + 2;

    let pipelineStartRow: number;

    if (meetingTasks.length > 0) {
      const meetingStartRow = Math.max(rowAfterCommentsGap, 4);
      const meetingResult = writeMeetingSectionRightGrid(
        ws,
        meetingStartRow,
        meetingTasks,
        isoDate,
        completionDatesByTaskId,
        seq
      );
      seq = meetingResult.nextSeq;
      currentRow = Math.max(currentRow, meetingResult.nextRow);
      // One blank row between Meeting and Pipeline (full-width pipeline block below).
      pipelineStartRow = meetingResult.nextRow + 1;
    } else {
      pipelineStartRow = Math.max(rowAfterCommentsGap, currentRow);
    }

    const pipelineEndRow = writePipelineSectionRightOnly(
      ws,
      pipelineStartRow,
      pipelineRows,
      this.pipelineClients.listStages()
    );

    currentRow = Math.max(currentRow, pipelineEndRow);

    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf);
  }

  async buildPrintHtmlForUser(
    userId: string,
    isoDate: string
  ): Promise<string> {
    const buf = await this.buildWorkbookForUser(userId, isoDate);

    const wb = new ExcelJS.Workbook();
    await (
      wb.xlsx as unknown as { load: (data: unknown) => Promise<unknown> }
    ).load(buf);

    const wsDaily = wb.worksheets[0];

    return buildPrintHtmlCombined(wsDaily, `VPDM Daily Task ${isoDate}`);
  }
}