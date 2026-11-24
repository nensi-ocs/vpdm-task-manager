import { useEffect, useMemo, useRef, useState } from "react";
import type { Task } from "../types";
import { useAuth } from "../auth/AuthContext";
import { useTasks } from "../useTasks";
import {
  getNextOccurrenceExclusiveIso,
  getTaskCompletedIsoForSelectedWindow,
  weekdayNameInKolkataFromIso,
  completedOnKey,
} from "../taskSchedule";
import { formatIsoDayShortMonth, formatIsoMonthYear } from "../dateFormat";
import "./calendar-page.css";
import {
  CalendarCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Search,
  X,
} from "lucide-react";

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

type StatusFilter = "all" | CalendarEventVariant;

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "scheduled", label: "Upcoming" },
  { key: "completed", label: "Completed" },
  { key: "missed", label: "Missed" },
  { key: "carry", label: "Carried forward" },
];

const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

/** Years offered in the month picker, either side of the current year. */
const PICKER_YEAR_SPAN = 10;

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
  return `${formatIsoDayShortMonth(startIso)} – ${formatIsoDayShortMonth(endIso, true)}`;
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

  const { tasks, loading, error, completionDatesByTaskId, completedOnByTaskDate } =
    useTasks(user?.id, completionAnchorIso);

  const eventsByIso = useMemo(() => {
    const map = new Map<string, CalendarCellEvent[]>();

    const pushEvent = (iso: string, t: Task, variant: CalendarEventVariant) => {
      if (iso < fromIso || iso > toIsoInclusive) return;
      const arr = map.get(iso) ?? [];
      if (!arr.some((x) => x.task.id === t.id)) arr.push({ task: t, variant });
      map.set(iso, arr);
    };

    const shiftSundayToMonday = (iso: string): string =>
      weekdayNameInKolkataFromIso(iso) === "Sunday" ? addDaysIso(iso, 1) : iso;

    const openEnd = "9999-12-31";

    for (const t of tasks) {
      if (t.frequency === "daily") continue;
      const anchors = getDueIsosInRange(t, fromIso, toIsoInclusive);
      for (const a of anchors) {
        const done = getTaskCompletedIsoForSelectedWindow(t, a, completionDatesByTaskId);
        const dueIso = shiftSundayToMonday(a);

        // If completed late: keep the original due date as missed (red) and the completion date green.
        if (done !== null) {
          // Prefer the day the checkbox was actually ticked over the stored occurrence date.
          const doneShown =
            completedOnByTaskDate.get(completedOnKey(t.id, done)) ?? done;
          if (doneShown === dueIso) {
            pushEvent(dueIso, t, "completed");
          } else {
            pushEvent(dueIso, t, "missed");
            pushEvent(doneShown, t, "completed");
          }
          continue;
        }

        if (dueIso > todayIso) {
          pushEvent(dueIso, t, "scheduled");
          continue;
        }

        // Due today (and not completed): keep normal styling. It becomes "missed" only after the day passes.
        if (dueIso === todayIso) {
          pushEvent(dueIso, t, "scheduled");
          continue;
        }

        const nextEx = getNextOccurrenceExclusiveIso(t, a);
        const windowLast = nextEx ? addDaysIso(nextEx, -1) : openEnd;
        const spanStart = maxIso(dueIso, fromIso);
        const spanEnd = minIso(
          minIso(minIso(todayIso, toIsoInclusive), windowLast),
          t.endDate ?? openEnd
        );
        if (spanStart <= spanEnd) {
          // The due day is missed only after it's in the past.
          pushEvent(dueIso, t, "missed");

          // Carry-forward reminders start the day after the due date (or later if the visible range starts later).
          const carryStart = maxIso(addDaysIso(dueIso, 1), spanStart);
          for (let cur = carryStart; cur <= spanEnd; cur = addDaysIso(cur, 1)) {
            // Match Task Manager: carry-forward reminders do not appear on Sunday (Kolkata).
            if (weekdayNameInKolkataFromIso(cur) === "Sunday") continue;
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
  }, [tasks, fromIso, toIsoInclusive, todayIso, completionDatesByTaskId, completedOnByTaskDate]);

  const title = view === "week" ? fmtWeekTitle(fromIso) : fmtMonthTitle(cursorIso);

  // ---- Filters: these only choose which events are shown; the schedule itself is untouched.
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");

  const searchLower = search.trim().toLowerCase();

  /** Events after the search filter, before the status filter. */
  const matchedByIso = useMemo(() => {
    if (!searchLower) return eventsByIso;
    const map = new Map<string, CalendarCellEvent[]>();
    for (const [iso, arr] of eventsByIso) {
      const kept = arr.filter(({ task: t }) =>
        t.title.toLowerCase().includes(searchLower)
      );
      if (kept.length > 0) map.set(iso, kept);
    }
    return map;
  }, [eventsByIso, searchLower]);

  const statusCounts = useMemo(() => {
    const counts: Record<StatusFilter, number> = {
      all: 0,
      scheduled: 0,
      completed: 0,
      missed: 0,
      carry: 0,
    };
    for (const arr of matchedByIso.values()) {
      for (const e of arr) {
        counts.all += 1;
        counts[e.variant] += 1;
      }
    }
    return counts;
  }, [matchedByIso]);

  const filtersActive = statusFilter !== "all" || searchLower !== "";

  function clearFilters() {
    setStatusFilter("all");
    setSearch("");
  }

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

  // ---- Month and year picker (opens from the title)
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(year);
  const pickerRef = useRef<HTMLDivElement>(null);
  const todayYear = Number(todayIso.slice(0, 4));
  const todayMonth0 = Number(todayIso.slice(5, 7)) - 1;

  const pickerYears = useMemo(() => {
    const from = Math.min(todayYear - PICKER_YEAR_SPAN, year, pickerYear);
    const to = Math.max(todayYear + PICKER_YEAR_SPAN, year, pickerYear);
    return Array.from({ length: to - from + 1 }, (_, i) => from + i);
  }, [todayYear, year, pickerYear]);

  useEffect(() => {
    if (!pickerOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!pickerRef.current?.contains(e.target as Node)) setPickerOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPickerOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [pickerOpen]);

  function togglePicker() {
    setPickerYear(year);
    setPickerOpen((v) => !v);
  }

  function pickMonth(y: number, m0: number) {
    // Landing on the current month keeps today in view (matters for the week view).
    const iso =
      y === todayYear && m0 === todayMonth0
        ? todayIso
        : `${String(y).padStart(4, "0")}-${String(m0 + 1).padStart(2, "0")}-01`;
    setCursorIso(iso);
    setPickerOpen(false);
  }

  // "Today" has nothing to do while today is already on screen.
  const isCurrentPeriod =
    view === "week"
      ? todayIso >= fromIso && todayIso <= toIsoInclusive
      : cursorIso.slice(0, 7) === todayIso.slice(0, 7);


  return (
    <div className="calendar-page">
      <header className="page-head">
        <div>
          <h1 className="page-title">Calendar</h1>
          <p className="page-subtitle">
            Weekly, monthly and one-time tasks by due date.
          </p>
        </div>
      </header>

      <section className="panel calendar-controls" aria-label="Calendar controls">
        <div className="calendar-topbar">
          <div className="calendar-topbar-left">
            <button
              type="button"
              className="cal-btn cal-today"
              onClick={goToday}
              disabled={isCurrentPeriod}
              title={isCurrentPeriod ? "You are viewing today" : "Go to today"}
            >
              <CalendarCheck size={16} aria-hidden="true" />
              Today
            </button>
          </div>

          <div className="cal-nav">
            <button
              type="button"
              className="cal-icon"
              onClick={goPrev}
              aria-label={view === "week" ? "Previous week" : "Previous month"}
            >
              <ChevronLeft size={20} aria-hidden="true" />
            </button>
            <div className="cal-picker" ref={pickerRef}>
              <h2 className="calendar-title" aria-live="polite">
                <button
                  type="button"
                  className="cal-title-btn"
                  aria-haspopup="dialog"
                  aria-expanded={pickerOpen}
                  title="Choose a month and year"
                  onClick={togglePicker}
                >
                  {title}
                  <ChevronDown size={18} aria-hidden="true" />
                </button>
              </h2>
              {pickerOpen ? (
                <div
                  className="cal-picker-pop"
                  role="dialog"
                  aria-label="Choose a month and year"
                >
                  <div className="cal-picker-year">
                    <button
                      type="button"
                      className="cal-icon"
                      aria-label="Previous year"
                      onClick={() => setPickerYear((y) => y - 1)}
                    >
                      <ChevronLeft size={18} aria-hidden="true" />
                    </button>
                    <label>
                      <span className="sr-only">Year</span>
                      <select
                        className="input"
                        value={pickerYear}
                        onChange={(e) => setPickerYear(Number(e.target.value))}
                      >
                        {pickerYears.map((y) => (
                          <option key={y} value={y}>
                            {y}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      className="cal-icon"
                      aria-label="Next year"
                      onClick={() => setPickerYear((y) => y + 1)}
                    >
                      <ChevronRight size={18} aria-hidden="true" />
                    </button>
                  </div>
                  <div className="cal-picker-months">
                    {MONTH_SHORT.map((name, m0) => {
                      const isShown = pickerYear === year && m0 === month0;
                      const isNow = pickerYear === todayYear && m0 === todayMonth0;
                      return (
                        <button
                          key={name}
                          type="button"
                          className={`cal-picker-month${isShown ? " on" : ""}${isNow ? " now" : ""}`}
                          aria-pressed={isShown}
                          onClick={() => pickMonth(pickerYear, m0)}
                        >
                          {name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
            <button
              type="button"
              className="cal-icon"
              onClick={goNext}
              aria-label={view === "week" ? "Next week" : "Next month"}
            >
              <ChevronRight size={20} aria-hidden="true" />
            </button>
          </div>

          <div className="calendar-topbar-right">
            <div className="segmented" role="group" aria-label="Calendar view">
              <button
                type="button"
                className={`seg ${view === "week" ? "on" : ""}`}
                aria-pressed={view === "week"}
                onClick={() => setView("week")}
              >
                Week
              </button>
              <button
                type="button"
                className={`seg ${view === "month" ? "on" : ""}`}
                aria-pressed={view === "month"}
                onClick={() => setView("month")}
              >
                Month
              </button>
            </div>
          </div>
        </div>

        <div className="calendar-filters">
          <div className="cal-chips" role="group" aria-label="Show tasks by status">
            {STATUS_FILTERS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                className={`cal-chip cal-chip-${key} ${statusFilter === key ? "on" : ""}`}
                aria-pressed={statusFilter === key}
                onClick={() => setStatusFilter(key)}
              >
                {key === "all" ? null : <i aria-hidden="true" />}
                {label}
                <span className="cal-chip-count">{statusCounts[key]}</span>
              </button>
            ))}
          </div>

          <div className="calendar-filter-fields">
            <label className="calendar-filter-search">
              <Search size={16} aria-hidden="true" />
              <span className="sr-only">Search tasks</span>
              <input
                className="input"
                type="search"
                placeholder="Search tasks..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoComplete="off"
              />
            </label>
            {filtersActive ? (
              <button type="button" className="btn ghost" onClick={clearFilters}>
                <X size={15} aria-hidden="true" />
                Clear filters
              </button>
            ) : null}
          </div>
        </div>
      </section>

      {error ? <div className="calendar-error">{error}</div> : null}
      {loading ? <div className="calendar-loading">Loading tasks…</div> : null}
      {!loading && filtersActive && statusCounts[statusFilter] === 0 ? (
        <div className="calendar-loading" role="status">
          No tasks match these filters in this {view}.{" "}
          <button type="button" className="calendar-link-btn" onClick={clearFilters}>
            Clear filters
          </button>
        </div>
      ) : null}

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
          const matched = matchedByIso.get(iso) ?? [];
          const events =
            statusFilter === "all"
              ? matched
              : matched.filter((e) => e.variant === statusFilter);

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
                    ? formatIsoDayShortMonth(iso)
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

