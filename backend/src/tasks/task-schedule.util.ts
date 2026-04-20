/**
 * Recurrence + carry-forward: non-daily tasks stay visible from each scheduled
 * day until the next occurrence or until completed on any day in that window.
 * Keep in sync with frontend/src/taskSchedule.ts.
 */

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
  const d = new Date(`${iso}T12:00:00.000Z`);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    weekday: "long",
  });
  const name = fmt.format(d);
  const idx = WEEKDAYS.indexOf(name as (typeof WEEKDAYS)[number]);
  return idx >= 0 ? WEEKDAYS[idx] : null;
}

export type TaskSeriesScheduleInput = {
  id: number;
  frequency: string;
  startDate: Date;
  endDate: Date | null;
  repeatWeekday: string | null;
  repeatDayOfMonth: number | null;
  repeatIntervalDays: number | null;
};

function isoDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
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

function isWeekdayOption(
  val: string | null | undefined
): val is (typeof WEEKDAYS)[number] {
  return val != null && (WEEKDAYS as readonly string[]).includes(val);
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

export function getMonthlyFirstDueIso(
  seriesStartIso: string,
  repeatDom: number
): string {
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

function hasCompletionInRange(
  dates: Set<string> | undefined,
  fromIso: string,
  toIsoExclusive: string
): boolean {
  if (!dates || dates.size === 0) return false;
  for (const d of dates) {
    if (d >= fromIso && d < toIsoExclusive) return true;
  }
  return false;
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

/**
 * Whether the task appears on selectedIso, including carry-forward from the
 * last scheduled occurrence that has not been completed in its window.
 */
export function isTaskVisibleWithCarryForward(
  t: TaskSeriesScheduleInput,
  selectedIso: string,
  completionDatesByTaskId: Map<number, Set<string>>
): boolean {
  const seriesStartIso = isoDateOnly(t.startDate);
  if (selectedIso < seriesStartIso) return false;
  const endIso = t.endDate ? isoDateOnly(t.endDate) : null;
  if (endIso !== null && selectedIso > endIso) return false;

  if (t.frequency === "daily") {
    return weekdayNameInKolkataFromIso(selectedIso) !== "Sunday";
  }

  const comps = completionDatesByTaskId.get(t.id);

  if (t.frequency === "weekly") {
    if (!isWeekdayOption(t.repeatWeekday)) return false;

    const startDate = isoToUtcMidday(seriesStartIso);
    const startDow = startDate.getUTCDay();
    const targetDow = WEEKDAYS.indexOf(t.repeatWeekday);
    const diff = (targetDow - startDow + 7) % 7;
    const firstDue = addDaysUtc(startDate, diff);
    const firstDueIso = isoDateOnly(firstDue);

    if (selectedIso < firstDueIso) return false;

    const selectedDate = isoToUtcMidday(selectedIso);
    const msDay = 24 * 60 * 60 * 1000;
    const daysDiff = Math.round(
      (selectedDate.getTime() - firstDue.getTime()) / msDay
    );
    const k = Math.floor(daysDiff / 7);
    const periodStartIso = shiftSundayToMondayIso(isoDateOnly(addDaysUtc(firstDue, k * 7)));
    const nextExclusive = isoDateOnly(addDaysUtc(isoToUtcMidday(periodStartIso), 7));

    const doneIso = firstCompletionInRange(comps, periodStartIso, nextExclusive);
    if (weekdayNameInKolkataFromIso(selectedIso) === "Sunday") {
      if (doneIso == null) return selectedIso === periodStartIso;
      return selectedIso === periodStartIso || selectedIso === doneIso;
    }
    if (doneIso == null) return selectedIso >= periodStartIso && selectedIso < nextExclusive;
    return selectedIso === periodStartIso || selectedIso === doneIso;
  }

  if (t.frequency === "monthly") {
    if (typeof t.repeatDayOfMonth !== "number") return false;
    const repeatDom = t.repeatDayOfMonth;
    const firstDueIso = getMonthlyFirstDueIso(seriesStartIso, repeatDom);

    const L = lastMonthlyOccurrenceOnOrBefore(
      selectedIso,
      repeatDom,
      firstDueIso
    );
    if (L === null) return false;

    const shiftedL = shiftSundayToMondayIso(L);
    const nextExclusive = nextMonthlyOccurrenceIsoAfter(L, repeatDom);
    const doneIso = firstCompletionInRange(comps, L, nextExclusive);
    if (weekdayNameInKolkataFromIso(selectedIso) === "Sunday") {
      if (doneIso == null) return selectedIso === shiftedL;
      return selectedIso === shiftedL || selectedIso === doneIso;
    }
    if (doneIso == null) return selectedIso >= shiftedL && selectedIso < nextExclusive;
    return selectedIso === shiftedL || selectedIso === doneIso;
  }

  if (t.frequency === "interval") {
    if (typeof t.repeatIntervalDays !== "number" || t.repeatIntervalDays < 1) {
      return false;
    }
    const n = t.repeatIntervalDays;
    const start = isoToUtcMidday(seriesStartIso);
    const selected = isoToUtcMidday(selectedIso);
    const msDay = 24 * 60 * 60 * 1000;
    const daysDiff = Math.round((selected.getTime() - start.getTime()) / msDay);
    if (daysDiff < 0) return false;
    const k = Math.floor(daysDiff / n);
    const periodStartIso = shiftSundayToMondayIso(isoDateOnly(addDaysUtc(start, k * n)));
    const nextExclusive = isoDateOnly(addDaysUtc(isoToUtcMidday(periodStartIso), n));

    const doneIso = firstCompletionInRange(comps, periodStartIso, nextExclusive);
    if (weekdayNameInKolkataFromIso(selectedIso) === "Sunday") {
      if (doneIso == null) return selectedIso === periodStartIso;
      return selectedIso === periodStartIso || selectedIso === doneIso;
    }
    if (doneIso == null) return selectedIso >= periodStartIso && selectedIso < nextExclusive;
    return selectedIso === periodStartIso || selectedIso === doneIso;
  }

  if (t.frequency === "once") {
    const shiftedStartIso = shiftSundayToMondayIso(seriesStartIso);
    if (!hasCompletionOnOrAfter(comps, seriesStartIso, endIso)) {
      if (weekdayNameInKolkataFromIso(selectedIso) === "Sunday") {
        return selectedIso === shiftedStartIso;
      }
      return selectedIso >= shiftedStartIso;
    }
    let best: string | null = null;
    for (const d of comps ?? []) {
      if (d < seriesStartIso) continue;
      if (endIso !== null && d > endIso) continue;
      if (best === null || d < best) best = d;
    }
    if (!best) return selectedIso >= shiftedStartIso;
    return selectedIso === shiftedStartIso || selectedIso === best;
  }

  return false;
}

/** True if this occurrence window has any completion (for export / badges). */
export function isOccurrenceCompletedInWindow(
  t: TaskSeriesScheduleInput,
  selectedIso: string,
  completionDatesByTaskId: Map<number, Set<string>>
): boolean {
  const seriesStartIso = isoDateOnly(t.startDate);
  const endIso = t.endDate ? isoDateOnly(t.endDate) : null;
  if (selectedIso < seriesStartIso) return false;
  if (endIso !== null && selectedIso > endIso) return false;

  const comps = completionDatesByTaskId.get(t.id);

  if (t.frequency === "daily") {
    return comps?.has(selectedIso) ?? false;
  }

  if (t.frequency === "weekly") {
    if (!isWeekdayOption(t.repeatWeekday)) return false;
    const startDate = isoToUtcMidday(seriesStartIso);
    const startDow = startDate.getUTCDay();
    const targetDow = WEEKDAYS.indexOf(t.repeatWeekday);
    const diff = (targetDow - startDow + 7) % 7;
    const firstDue = addDaysUtc(startDate, diff);
    const firstDueIso = isoDateOnly(firstDue);
    if (selectedIso < firstDueIso) return false;
    const selectedDate = isoToUtcMidday(selectedIso);
    const msDay = 24 * 60 * 60 * 1000;
    const daysDiff = Math.round(
      (selectedDate.getTime() - firstDue.getTime()) / msDay
    );
    const k = Math.floor(daysDiff / 7);
    const periodStartIso = isoDateOnly(addDaysUtc(firstDue, k * 7));
    const nextExclusive = isoDateOnly(addDaysUtc(isoToUtcMidday(periodStartIso), 7));
    return hasCompletionInRange(comps, periodStartIso, nextExclusive);
  }

  if (t.frequency === "monthly") {
    if (typeof t.repeatDayOfMonth !== "number") return false;
    const firstDueIso = getMonthlyFirstDueIso(seriesStartIso, t.repeatDayOfMonth);
    const L = lastMonthlyOccurrenceOnOrBefore(
      selectedIso,
      t.repeatDayOfMonth,
      firstDueIso
    );
    if (L === null) return false;
    const nextExclusive = nextMonthlyOccurrenceIsoAfter(L, t.repeatDayOfMonth);
    return hasCompletionInRange(comps, L, nextExclusive);
  }

  if (t.frequency === "interval") {
    if (typeof t.repeatIntervalDays !== "number" || t.repeatIntervalDays < 1) {
      return false;
    }
    const n = t.repeatIntervalDays;
    const start = isoToUtcMidday(seriesStartIso);
    const selected = isoToUtcMidday(selectedIso);
    const msDay = 24 * 60 * 60 * 1000;
    const daysDiff = Math.round((selected.getTime() - start.getTime()) / msDay);
    if (daysDiff < 0) return false;
    const k = Math.floor(daysDiff / n);
    const periodStartIso = isoDateOnly(addDaysUtc(start, k * n));
    const nextExclusive = isoDateOnly(addDaysUtc(isoToUtcMidday(periodStartIso), n));
    return hasCompletionInRange(comps, periodStartIso, nextExclusive);
  }

  if (t.frequency === "once") {
    return hasCompletionOnOrAfter(comps, seriesStartIso, endIso);
  }

  return false;
}
