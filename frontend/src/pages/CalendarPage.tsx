import { useMemo, useState } from "react";
import type { Task } from "../types";
import { useAuth } from "../auth/AuthContext";
import { useTasks } from "../useTasks";
import {
  getNextOccurrenceExclusiveIso,
  getTaskCompletedIsoForSelectedWindow,
} from "../taskSchedule";
import { formatIsoDateDdMmYyyy, formatIsoMonthYear } from "../dateFormat";
import "./calendar-page.css";
import { ChevronLeft, ChevronRight } from "lucide-react";

type ViewMode = "week" | "month";

/**
 * completed: completion date (and due date if completed on time)
 * missed: the original due date (overdue and not completed on that due date)
 * carry: carry-forward reminder days after the due date (not red)
 * scheduled: future due date
 */
type CalendarEventVariant = "completed" | "missed" | "carry" | "scheduled";

type CalendarCellEvent = {
  task: Task;
  variant: CalendarEventVariant;
};

const MS_DAY = 24 * 60 * 60 * 1000;

function isoToUtcMidday(iso: string): Date {
  return new Date(`${iso}T12:00:00.000Z`);
}

function toIsoUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDaysIso(iso: string, days: number): string {
  const d = isoToUtcMidday(iso);
  return toIsoUtc(new Date(d.getTime() + days * MS_DAY));
}

function startOfWeekSundayIso(iso: string): string {
  const d = isoToUtcMidday(iso);
  const dow = d.getUTCDay(); // 0 Sunday
  return toIsoUtc(new Date(d.getTime() - dow * MS_DAY));
}

function lastDayOfMonthUTC(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

function monthDueIso(year: number, month0: number, repeatDom: number): string {
  const day = Math.min(repeatDom, lastDayOfMonthUTC(year, month0));
  const mm = String(month0 + 1).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

function weekdayNameUTC(iso: string): string {
  const d = isoToUtcMidday(iso);
  return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][
    d.getUTCDay()
  ]!;
}

function rangeOverlaps(
  t: Task,
  fromIso: string,
  toIsoInclusive: string
): boolean {
  if (t.startDate > toIsoInclusive) return false;
  if (t.endDate !== null && t.endDate < fromIso) return false;
  return true;
}

function clampToTaskEndIso(t: Task, iso: string): string | null {
  if (t.endDate === null) return iso;
  return iso <= t.endDate ? iso : null;
}

function getDueIsosInRange(t: Task, fromIso: string, toIsoInclusive: string): string[] {
  if (!rangeOverlaps(t, fromIso, toIsoInclusive)) return [];

  const start = t.startDate > fromIso ? t.startDate : fromIso;
  const end = t.endDate !== null && t.endDate < toIsoInclusive ? t.endDate : toIsoInclusive;

  if (start > end) return [];

  if (t.frequency === "once") {
    return t.startDate >= start && t.startDate <= end ? [t.startDate] : [];
  }

  if (t.frequency === "daily") {
    const out: string[] = [];
    for (let cur = start; cur <= end; cur = addDaysIso(cur, 1)) out.push(cur);
    return out;
  }

  if (t.frequency === "weekly") {
    if (!t.repeatWeekday) return [];

    const out: string[] = [];
    // Find the first due date on/after series start
    let cur = t.startDate;
    for (let guard = 0; guard < 7; guard++) {
      if (weekdayNameUTC(cur) === t.repeatWeekday) break;
      cur = addDaysIso(cur, 1);
    }
    // Jump forward by weeks until in range
    while (cur < start) cur = addDaysIso(cur, 7);
    while (cur <= end) {
      const clamped = clampToTaskEndIso(t, cur);
      if (clamped) out.push(clamped);
      cur = addDaysIso(cur, 7);
    }
    return out;
  }

  if (t.frequency === "monthly") {
    if (typeof t.repeatDayOfMonth !== "number") return [];
    const repeatDom = t.repeatDayOfMonth;

    const out: string[] = [];
    const startD = isoToUtcMidday(t.startDate);
    let y = startD.getUTCFullYear();
    let m0 = startD.getUTCMonth();

    // First due month: if the due day is before startDate, start from next month.
    let due = monthDueIso(y, m0, repeatDom);
    if (due < t.startDate) {
      const next = new Date(Date.UTC(y, m0 + 1, 1));
      y = next.getUTCFullYear();
      m0 = next.getUTCMonth();
      due = monthDueIso(y, m0, repeatDom);
    }

    // Advance to range start
    while (due < start) {
      const next = new Date(Date.UTC(y, m0 + 1, 1));
      y = next.getUTCFullYear();
      m0 = next.getUTCMonth();
      due = monthDueIso(y, m0, repeatDom);
    }

    while (due <= end) {
      const clamped = clampToTaskEndIso(t, due);
      if (clamped) out.push(clamped);
      const next = new Date(Date.UTC(y, m0 + 1, 1));
      y = next.getUTCFullYear();
      m0 = next.getUTCMonth();
      due = monthDueIso(y, m0, repeatDom);
    }
    return out;
  }

  if (t.frequency === "interval") {
    if (typeof t.repeatIntervalDays !== "number" || t.repeatIntervalDays < 1) return [];
    const n = t.repeatIntervalDays;
    const out: string[] = [];

    let cur = t.startDate;
    while (cur < start) {
      const curD = isoToUtcMidday(cur);
      const startD = isoToUtcMidday(start);
      const daysDiff = Math.max(0, Math.round((startD.getTime() - curD.getTime()) / MS_DAY));
      const jump = Math.max(1, Math.floor(daysDiff / n));
      cur = addDaysIso(cur, jump * n);
    }
    while (cur <= end) {
      const clamped = clampToTaskEndIso(t, cur);
      if (clamped) out.push(clamped);
      cur = addDaysIso(cur, n);
    }
    return out;
  }

  return [];
}

function maxIso(a: string, b: string): string {
  return a >= b ? a : b;
}

function minIso(a: string, b: string): string {
  return a <= b ? a : b;
}

function fmtMonthTitle(iso: string): string {
  return formatIsoMonthYear(iso);
}

function fmtWeekTitle(startIso: string): string {
  const endIso = addDaysIso(startIso, 6);
  return `${formatIsoDateDdMmYyyy(startIso)} – ${formatIsoDateDdMmYyyy(endIso)}`;
}

export function CalendarPage() {
  const { user } = useAuth();
  const [view, setView] = useState<ViewMode>("month");

  const todayIso = useMemo(() => {
    const d = new Date();
    const yyyy = String(d.getFullYear());
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }, []);

  const [cursorIso, setCursorIso] = useState<string>(todayIso);

  const { fromIso, toIsoInclusive, days } = useMemo(() => {
    if (view === "week") {
      const start = startOfWeekSundayIso(cursorIso);
      const outDays = Array.from({ length: 7 }, (_, i) => addDaysIso(start, i));
      return { fromIso: outDays[0]!, toIsoInclusive: outDays[6]!, days: outDays };
    }

    const d = isoToUtcMidday(cursorIso);
    const y = d.getUTCFullYear();
    const m0 = d.getUTCMonth();
    const firstOfMonth = toIsoUtc(new Date(Date.UTC(y, m0, 1, 12, 0, 0)));
    const gridStart = startOfWeekSundayIso(firstOfMonth);

    const outDays: string[] = [];
    for (let i = 0; i < 42; i++) outDays.push(addDaysIso(gridStart, i));

    return { fromIso: outDays[0]!, toIsoInclusive: outDays[outDays.length - 1]!, days: outDays };
  }, [cursorIso, view]);

  const completionAnchorIso = useMemo(
    () => maxIso(maxIso(fromIso, toIsoInclusive), todayIso),
    [fromIso, toIsoInclusive, todayIso]
  );

  const { tasks, loading, error, completionDatesByTaskId } = useTasks(
    user?.id,
    completionAnchorIso
  );

  const eventsByIso = useMemo(() => {
    const map = new Map<string, CalendarCellEvent[]>();

    const pushEvent = (iso: string, t: Task, variant: CalendarEventVariant) => {
      if (iso < fromIso || iso > toIsoInclusive) return;
      const arr = map.get(iso) ?? [];
      if (!arr.some((x) => x.task.id === t.id)) arr.push({ task: t, variant });
      map.set(iso, arr);
    };

    const openEnd = "9999-12-31";

    for (const t of tasks) {
      if (t.frequency === "daily") continue;
      const anchors = getDueIsosInRange(t, fromIso, toIsoInclusive);
      for (const a of anchors) {
        const done = getTaskCompletedIsoForSelectedWindow(t, a, completionDatesByTaskId);

        // If completed late: keep the original due date as missed (red) and the completion date green.
        if (done !== null) {
          if (done === a) {
            pushEvent(a, t, "completed");
          } else {
            pushEvent(a, t, "missed");
            pushEvent(done, t, "completed");
          }
          continue;
        }

        if (a > todayIso) {
          pushEvent(a, t, "scheduled");
          continue;
        }

        // Due today (and not completed): keep normal styling. It becomes "missed" only after the day passes.
        if (a === todayIso) {
          pushEvent(a, t, "scheduled");
          continue;
        }

        const nextEx = getNextOccurrenceExclusiveIso(t, a);
        const windowLast = nextEx ? addDaysIso(nextEx, -1) : openEnd;
        const spanStart = maxIso(a, fromIso);
        const spanEnd = minIso(
          minIso(minIso(todayIso, toIsoInclusive), windowLast),
          t.endDate ?? openEnd
        );
        if (spanStart <= spanEnd) {
          // The due day is missed only after it's in the past.
          pushEvent(a, t, "missed");

          // Carry-forward reminders start the day after the due date (or later if the visible range starts later).
          const carryStart = maxIso(addDaysIso(a, 1), spanStart);
          for (let cur = carryStart; cur <= spanEnd; cur = addDaysIso(cur, 1)) {
            pushEvent(cur, t, "carry");
          }
        }
      }
    }

    for (const [k, arr] of map) {
      arr.sort((x, y) =>
        x.task.priority === y.task.priority
          ? x.task.title.localeCompare(y.task.title)
          : x.task.priority.localeCompare(y.task.priority)
      );
      map.set(k, arr);
    }

    return map;
  }, [tasks, fromIso, toIsoInclusive, todayIso, completionDatesByTaskId]);

  const title = view === "week" ? fmtWeekTitle(fromIso) : fmtMonthTitle(cursorIso);

  function goPrev() {
    if (view === "week") {
      setCursorIso((c) => addDaysIso(c, -7));
      return;
    }
    const d = isoToUtcMidday(cursorIso);
    const prev = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1, 12, 0, 0));
    setCursorIso(toIsoUtc(prev));
  }

  function goNext() {
    if (view === "week") {
      setCursorIso((c) => addDaysIso(c, 7));
      return;
    }
    const d = isoToUtcMidday(cursorIso);
    const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1, 12, 0, 0));
    setCursorIso(toIsoUtc(next));
  }

  function goToday() {
    setCursorIso(todayIso);
  }

  const month0 = isoToUtcMidday(cursorIso).getUTCMonth();
  const year = isoToUtcMidday(cursorIso).getUTCFullYear();

  return (
    <div className="calendar-page">
      <header className="calendar-head">
        <div className="calendar-topbar">
          <div className="calendar-topbar-left">
            <button type="button" className="cal-btn cal-today" onClick={goToday}>
              Today
            </button>
            <div className="cal-nav">
              <button
                type="button"
                className="cal-btn cal-icon"
                onClick={goPrev}
                aria-label="Previous"
              >
                <ChevronLeft size={18} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="cal-btn cal-icon"
                onClick={goNext}
                aria-label="Next"
              >
                <ChevronRight size={18} aria-hidden="true" />
              </button>
            </div>
            <h2 className="calendar-title">{title}</h2>
          </div>

          <div className="calendar-topbar-right">
            <div className="segmented">
              <button
                type="button"
                className={`seg ${view === "week" ? "on" : ""}`}
                onClick={() => setView("week")}
              >
                Week
              </button>
              <button
                type="button"
                className={`seg ${view === "month" ? "on" : ""}`}
                onClick={() => setView("month")}
              >
                Month
              </button>
            </div>
          </div>
        </div>
      </header>

      {error ? <div className="calendar-error">{error}</div> : null}
      {loading ? <div className="calendar-loading">Loading tasks…</div> : null}

      <main className="calendar-main">
        <div className={`calendar-grid ${view}`}>
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((w) => (
          <div key={w} className="calendar-dow">
            {w}
          </div>
        ))}

        {days.map((iso) => {
          const d = isoToUtcMidday(iso);
          const inMonth =
            view === "week" ? true : d.getUTCMonth() === month0 && d.getUTCFullYear() === year;
          const isTodayCell = iso === todayIso;
          const events = eventsByIso.get(iso) ?? [];

          return (
            <div
              key={iso}
              className={`calendar-cell ${inMonth ? "" : "muted"} ${isTodayCell ? "today" : ""}`}
            >
              <div className="calendar-cell-head">
                <div
                  className={`calendar-date${view === "week" ? " calendar-date--full" : ""}`}
                >
                  {view === "week"
                    ? formatIsoDateDdMmYyyy(iso)
                    : d.getUTCDate()}
                </div>
              </div>
              <div className="calendar-events">
                {events.length === 0
                  ? null
                  : events.map(({ task: t, variant }) => (
                      <div
                        key={`${iso}-${t.id}`}
                        className={`cal-event p-${t.priority}${
                          variant === "completed"
                            ? " cal-completed"
                            : variant === "missed"
                              ? " cal-missed"
                              : variant === "carry"
                                ? " cal-carry"
                                : ""
                        }`}
                      >
                        <span className="cal-event-title">{t.title}</span>
                      </div>
                    ))}
              </div>
            </div>
          );
        })}
      </div>
      </main>
    </div>
  );
}

