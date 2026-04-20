/**
 * Recurrence + carry-forward for the task board / dashboard.
 * Keep in sync with backend/src/tasks/task-schedule.util.ts.
 */

import { formatIsoDateDayMonthCommaYear } from "./dateFormat";
import type { Task } from "./types";

export const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export function weekdayNameInKolkataFromIso(
  iso: string
): (typeof WEEKDAYS)[number] | null {
  // Use UTC midday to avoid timezone edge cases around midnight.
  const d = new Date(`${iso}T12:00:00.000Z`);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    weekday: "long",
  });
  const name = fmt.format(d);
  const idx = WEEKDAYS.indexOf(name as (typeof WEEKDAYS)[number]);
  return idx >= 0 ? WEEKDAYS[idx] : null;
}

/**
 * First scheduled occurrence date for a task series based on recurrence rules.
 * This is what users typically mean by the task's "schedule day".
 */
export function getFirstScheduledIso(input: {
  frequency: Task["frequency"];
  startDate: string;
  repeatWeekday: Task["repeatWeekday"] | null;
  repeatDayOfMonth: Task["repeatDayOfMonth"] | null;
  repeatIntervalDays: Task["repeatIntervalDays"] | null;
}): string | null {
  const seriesStartIso = input.startDate;

  if (input.frequency === "daily") return seriesStartIso;

  if (input.frequency === "weekly") {
    if (!isWeekdayOption(input.repeatWeekday)) return null;
    const startDate = isoToUtcMidday(seriesStartIso);
    const startDow = startDate.getUTCDay();
    const targetDow = WEEKDAYS.indexOf(input.repeatWeekday);
    const diff = (targetDow - startDow + 7) % 7;
    return addDaysUtc(startDate, diff).toISOString().slice(0, 10);
  }

  if (input.frequency === "monthly") {
    if (typeof input.repeatDayOfMonth !== "number") return null;
    return getMonthlyFirstDueIso(seriesStartIso, input.repeatDayOfMonth);
  }

  if (input.frequency === "interval") {
    if (typeof input.repeatIntervalDays !== "number" || input.repeatIntervalDays < 1) {
      return null;
    }
    return seriesStartIso;
  }

  if (input.frequency === "once") return seriesStartIso;

  return null;
}

function isoToUtcMidday(iso: string): Date {
  return new Date(`${iso}T12:00:00.000Z`);
}

function addDaysUtc(utcDate: Date, days: number): Date {
  return new Date(utcDate.getTime() + days * 24 * 60 * 60 * 1000);
}

function shiftSundayToMondayIso(iso: string): string {
  return weekdayNameInKolkataFromIso(iso) === "Sunday"
    ? addDaysUtc(isoToUtcMidday(iso), 1).toISOString().slice(0, 10)
    : iso;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function lastDayOfMonthUTC(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

export function isWeekdayOption(
  val: string | null
): val is (typeof WEEKDAYS)[number] {
  return val !== null && (WEEKDAYS as readonly string[]).includes(val);
}

function monthlyDueIso(year: number, month0: number, repeatDom: number): string {
  const day = Math.min(repeatDom, lastDayOfMonthUTC(year, month0));
  return `${year}-${pad2(month0 + 1)}-${pad2(day)}`;
}

function prevMonthYearMonth0(
  year: number,
  month0: number
): { y: number; m0: number } {
  const d = new Date(Date.UTC(year, month0 - 1, 1));
  return { y: d.getUTCFullYear(), m0: d.getUTCMonth() };
}

function getMonthlyFirstDueIso(seriesStartIso: string, repeatDom: number): string {
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
  return firstDueIso;
}

function lastMonthlyOccurrenceOnOrBefore(
  selectedIso: string,
  repeatDom: number,
  firstDueIso: string
): string | null {
  if (selectedIso < firstDueIso) return null;

  let y = Number.parseInt(selectedIso.slice(0, 4), 10);
  let m0 = Number.parseInt(selectedIso.slice(5, 7), 10) - 1;

  for (let guard = 0; guard < 2400; guard++) {
    const dueThisMonth = monthlyDueIso(y, m0, repeatDom);
    if (dueThisMonth > selectedIso) {
      const p = prevMonthYearMonth0(y, m0);
      y = p.y;
      m0 = p.m0;
      continue;
    }
    if (dueThisMonth < firstDueIso) return null;
    return dueThisMonth;
  }
  return null;
}

function nextMonthlyOccurrenceIsoAfter(
  afterIso: string,
  repeatDom: number
): string {
  const y = Number.parseInt(afterIso.slice(0, 4), 10);
  const m0 = Number.parseInt(afterIso.slice(5, 7), 10) - 1;
  const next = new Date(Date.UTC(y, m0 + 1, 1));
  const ny = next.getUTCFullYear();
  const nm0 = next.getUTCMonth();
  return monthlyDueIso(ny, nm0, repeatDom);
}

function hasCompletionOnOrAfter(
  dates: Set<string> | undefined,
  fromIso: string,
  endIsoInclusive: string | null
): boolean {
  if (!dates || dates.size === 0) return false;
  for (const d of dates) {
    if (d < fromIso) continue;
    if (endIsoInclusive !== null && d > endIsoInclusive) continue;
    return true;
  }
  return false;
}

export type CompletionDatesByTaskId = Map<number, Set<string>>;

export function buildCompletionDatesMap(
  rows: { taskId: number; date: string }[]
): CompletionDatesByTaskId {
  const m = new Map<number, Set<string>>();
  for (const r of rows) {
    let s = m.get(r.taskId);
    if (!s) {
      s = new Set();
      m.set(r.taskId, s);
    }
    s.add(r.date);
  }
  return m;
}

/** Earliest ISO date to load completions from (all non-daily tasks + carry windows). */
export function minCompletionRangeStartIso(
  tasks: Task[],
  selectedIso: string
): string {
  let min = selectedIso;
  for (const t of tasks) {
    if (t.frequency === "daily") continue;
    if (t.startDate < min) min = t.startDate;
  }
  return min;
}

function firstCompletionInRange(
  dates: Set<string> | undefined,
  fromIso: string,
  toIsoExclusive: string
): string | null {
  if (!dates || dates.size === 0) return null;
  let best: string | null = null;
  for (const d of dates) {
    if (d < fromIso || d >= toIsoExclusive) continue;
    if (best === null || d < best) best = d;
  }
  return best;
}

/**
 * The scheduled start of the occurrence window that contains `selectedIso`
 * (e.g. the Monday a weekly task is tied to when you are viewing Wednesday).
 * Does not depend on completions — only the recurrence rules and active range.
 */
export function getTaskOccurrenceAnchorIso(
  t: Task,
  selectedIso: string
): string | null {
  const seriesStartIso = t.startDate;
  if (selectedIso < seriesStartIso) return null;
  const endIso = t.endDate;
  if (endIso !== null && selectedIso > endIso) return null;

  if (t.frequency === "daily") return selectedIso;

  if (t.frequency === "weekly") {
    if (!isWeekdayOption(t.repeatWeekday)) return null;

    const startDate = isoToUtcMidday(seriesStartIso);
    const startDow = startDate.getUTCDay();
    const targetDow = WEEKDAYS.indexOf(t.repeatWeekday);
    const diff = (targetDow - startDow + 7) % 7;
    const firstDue = addDaysUtc(startDate, diff);
    const firstDueIso = firstDue.toISOString().slice(0, 10);

    if (selectedIso < firstDueIso) return null;

    const selectedDate = isoToUtcMidday(selectedIso);
    const msDay = 24 * 60 * 60 * 1000;
    const daysDiff = Math.round(
      (selectedDate.getTime() - firstDue.getTime()) / msDay
    );
    const k = Math.floor(daysDiff / 7);
    const periodStartIso = addDaysUtc(firstDue, k * 7).toISOString().slice(0, 10);
    const nextExclusive = addDaysUtc(
      isoToUtcMidday(periodStartIso),
      7
    ).toISOString().slice(0, 10);

    if (selectedIso >= periodStartIso && selectedIso < nextExclusive) {
      return shiftSundayToMondayIso(periodStartIso);
    }
    return null;
  }

  if (t.frequency === "monthly") {
    if (typeof t.repeatDayOfMonth !== "number") return null;
    const repeatDom = t.repeatDayOfMonth;
    const firstDueIso = getMonthlyFirstDueIso(seriesStartIso, repeatDom);

    const L = lastMonthlyOccurrenceOnOrBefore(
      selectedIso,
      repeatDom,
      firstDueIso
    );
    if (L === null) return null;

    const nextExclusive = nextMonthlyOccurrenceIsoAfter(L, repeatDom);
    if (selectedIso >= L && selectedIso < nextExclusive) return shiftSundayToMondayIso(L);
    return null;
  }

  if (t.frequency === "interval") {
    if (typeof t.repeatIntervalDays !== "number" || t.repeatIntervalDays < 1) {
      return null;
    }
    const n = t.repeatIntervalDays;
    const start = isoToUtcMidday(seriesStartIso);
    const selected = isoToUtcMidday(selectedIso);
    const msDay = 24 * 60 * 60 * 1000;
    const daysDiff = Math.round((selected.getTime() - start.getTime()) / msDay);
    if (daysDiff < 0) return null;
    const k = Math.floor(daysDiff / n);
    const periodStartIso = addDaysUtc(start, k * n).toISOString().slice(0, 10);
    const nextExclusive = addDaysUtc(isoToUtcMidday(periodStartIso), n).toISOString().slice(0, 10);

    if (selectedIso >= periodStartIso && selectedIso < nextExclusive) {
      return shiftSundayToMondayIso(periodStartIso);
    }
    return null;
  }

  if (t.frequency === "once") {
    if (selectedIso >= seriesStartIso) return shiftSundayToMondayIso(seriesStartIso);
    return null;
  }

  return null;
}

/**
 * First calendar day after the occurrence window that starts at `anchorIso`
 * (weekly +7d, monthly next due, interval +N, daily +1). `null` for one-time tasks
 * (open-ended window).
 */
export function getNextOccurrenceExclusiveIso(
  t: Task,
  anchorIso: string
): string | null {
  if (t.frequency === "once") return null;
  if (t.frequency === "daily") {
    return addDaysUtc(isoToUtcMidday(anchorIso), 1).toISOString().slice(0, 10);
  }
  if (t.frequency === "weekly") {
    if (!isWeekdayOption(t.repeatWeekday)) return null;
    return addDaysUtc(isoToUtcMidday(anchorIso), 7).toISOString().slice(0, 10);
  }
  if (t.frequency === "monthly") {
    if (typeof t.repeatDayOfMonth !== "number") return null;
    return nextMonthlyOccurrenceIsoAfter(anchorIso, t.repeatDayOfMonth);
  }
  if (t.frequency === "interval") {
    if (typeof t.repeatIntervalDays !== "number" || t.repeatIntervalDays < 1) {
      return null;
    }
    return addDaysUtc(isoToUtcMidday(anchorIso), t.repeatIntervalDays)
      .toISOString()
      .slice(0, 10);
  }
  return null;
}

/** Human-readable scheduled date for the task row (e.g. 10 April, 2026). */
export function formatTaskOccurrenceDateLabel(
  task: Task,
  selectedIso: string
): string {
  const anchor = getTaskOccurrenceAnchorIso(task, selectedIso);
  if (!anchor) return "—";
  return formatIsoDateDayMonthCommaYear(anchor);
}

/**
 * Whether the task appears on selectedIso, including carry-forward until the
 * next scheduled occurrence (completion does NOT hide it).
 *
 * Sunday (Asia/Kolkata): incomplete tasks are not carried on that calendar day
 * — only the true scheduled day (anchor) or a completion recorded that day.
 * Daily tasks are hidden every Sunday.
 */
export function isTaskVisibleWithCarryForward(
  t: Task,
  selectedIso: string,
  completionDatesByTaskId: CompletionDatesByTaskId
): boolean {
  const seriesStartIso = t.startDate;
  if (selectedIso < seriesStartIso) return false;
  const endIso = t.endDate;
  if (endIso !== null && selectedIso > endIso) return false;

  if (t.frequency === "daily") {
    return weekdayNameInKolkataFromIso(selectedIso) !== "Sunday";
  }

  const doneIso = getTaskCompletedIsoForSelectedWindow(
    t,
    selectedIso,
    completionDatesByTaskId
  );
  const anchorIso = getTaskOccurrenceAnchorIso(t, selectedIso);
  if (!anchorIso) return false;

  // On Sundays, don't show carry-forward tasks.
  // Show only if it's the scheduled day (anchor) or the completion day.
  if (weekdayNameInKolkataFromIso(selectedIso) === "Sunday") {
    if (t.frequency === "once") {
      if (doneIso == null) return selectedIso === seriesStartIso;
      return selectedIso === seriesStartIso || selectedIso === doneIso;
    }
    if (doneIso == null) return selectedIso === anchorIso;
    return selectedIso === anchorIso || selectedIso === doneIso;
  }

  if (t.frequency === "weekly") {
    // If completed: show only on scheduled day + completion day (not other days).
    if (doneIso == null) return true;
    return selectedIso === anchorIso || selectedIso === doneIso;
  }

  if (t.frequency === "monthly") {
    if (doneIso == null) return true;
    return selectedIso === anchorIso || selectedIso === doneIso;
  }

  if (t.frequency === "interval") {
    if (doneIso == null) return true;
    return selectedIso === anchorIso || selectedIso === doneIso;
  }

  if (t.frequency === "once") {
    // Show from startDate until completed; after completion, show only on startDate and completion date.
    if (doneIso == null) return selectedIso >= seriesStartIso;
    return selectedIso === seriesStartIso || selectedIso === doneIso;
  }

  return false;
}

/**
 * Returns the ISO date when the task was completed for the occurrence window
 * containing `selectedIso`. Null means not completed in that window.
 */
export function getTaskCompletedIsoForSelectedWindow(
  t: Task,
  selectedIso: string,
  completionDatesByTaskId: CompletionDatesByTaskId
): string | null {
  const comps = completionDatesByTaskId.get(t.id);
  const anchor = getTaskOccurrenceAnchorIso(t, selectedIso);
  if (!anchor) return null;

  if (t.frequency === "daily") {
    return comps?.has(selectedIso) ? selectedIso : null;
  }

  if (t.frequency === "weekly") {
    const nextExclusive = addDaysUtc(isoToUtcMidday(anchor), 7)
      .toISOString()
      .slice(0, 10);
    return firstCompletionInRange(comps, anchor, nextExclusive);
  }

  if (t.frequency === "monthly") {
    if (typeof t.repeatDayOfMonth !== "number") return null;
    const nextExclusive = nextMonthlyOccurrenceIsoAfter(anchor, t.repeatDayOfMonth);
    return firstCompletionInRange(comps, anchor, nextExclusive);
  }

  if (t.frequency === "interval") {
    if (typeof t.repeatIntervalDays !== "number" || t.repeatIntervalDays < 1) {
      return null;
    }
    const nextExclusive = addDaysUtc(isoToUtcMidday(anchor), t.repeatIntervalDays)
      .toISOString()
      .slice(0, 10);
    return firstCompletionInRange(comps, anchor, nextExclusive);
  }

  if (t.frequency === "once") {
    const endIso = t.endDate;
    if (!hasCompletionOnOrAfter(comps, t.startDate, endIso)) return null;
    let best: string | null = null;
    for (const d of comps ?? []) {
      if (d < t.startDate) continue;
      if (endIso !== null && d > endIso) continue;
      if (best === null || d < best) best = d;
    }
    return best;
  }

  return null;
}

export function formatTaskCompletedDateLabel(
  task: Task,
  selectedIso: string,
  completionDatesByTaskId: CompletionDatesByTaskId
): string {
  const iso = getTaskCompletedIsoForSelectedWindow(
    task,
    selectedIso,
    completionDatesByTaskId
  );
  if (!iso) return "—";
  return formatIsoDateDayMonthCommaYear(iso);
}
