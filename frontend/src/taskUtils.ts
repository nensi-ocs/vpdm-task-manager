import type { Filter, Frequency, Priority, Task } from "./types";

export const priorityOrder: Record<Priority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

export function sortTasks(list: Task[], by: "priority" | "createdAt"): Task[] {
  const copy = [...list];
  if (by === "priority") {
    copy.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
    return copy;
  }
  copy.sort((a, b) => {
    return a.createdAt.localeCompare(b.createdAt);
  });
  return copy;
}

export function formatDue(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function optOk(v: unknown, kind: "string" | "number"): boolean {
  if (v === undefined || v === null) return true;
  return typeof v === kind;
}

function isFrequency(x: unknown): x is Frequency {
  return (
    x === "daily" ||
    x === "weekly" ||
    x === "monthly" ||
    x === "interval" ||
    x === "once"
  );
}

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

function isRepeatWeekday(x: unknown): x is (typeof WEEKDAYS)[number] {
  return typeof x === "string" && (WEEKDAYS as readonly string[]).includes(x);
}

function optRepeatDayOfMonth(val: unknown): number | null {
  if (val === undefined || val === null) return null;
  if (typeof val === "number" && Number.isInteger(val) && val >= 1 && val <= 31) {
    return val;
  }
  if (typeof val === "string" && val) {
    const n = Number.parseInt(val, 10);
    if (Number.isInteger(n) && n >= 1 && n <= 31) return n;
  }
  return null;
}

function optRepeatIntervalDays(val: unknown): number | null {
  if (val === undefined || val === null) return null;
  if (typeof val === "number" && Number.isInteger(val) && val >= 1 && val <= 365) {
    return val;
  }
  if (typeof val === "string" && val) {
    const n = Number.parseInt(val, 10);
    if (Number.isInteger(n) && n >= 1 && n <= 365) return n;
  }
  return null;
}

/** Validates JSON task rows for import */
export function isTaskImport(x: unknown): x is Task {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  if (
    (typeof o.id !== "number" && typeof o.id !== "string") ||
    typeof o.title !== "string" ||
    typeof o.notes !== "string" ||
    (o.priority !== "low" && o.priority !== "medium" && o.priority !== "high") ||
    (o.frequency !== undefined && !isFrequency(o.frequency)) ||
    typeof o.createdAt !== "string" ||
    (o.updatedAt !== undefined && typeof o.updatedAt !== "string")
  ) {
    return false;
  }

  if (
    o.startDate !== undefined &&
    o.startDate !== null &&
    typeof o.startDate !== "string"
  ) {
    return false;
  }

  if (
    o.endDate !== undefined &&
    o.endDate !== null &&
    typeof o.endDate !== "string"
  ) {
    return false;
  }

  if (
    o.repeatWeekday !== undefined &&
    o.repeatWeekday !== null &&
    !isRepeatWeekday(o.repeatWeekday)
  ) {
    return false;
  }
  if (o.repeatDayOfMonth !== undefined && optRepeatDayOfMonth(o.repeatDayOfMonth) === null) {
    // If value is present, it must be a valid day-of-month.
    return false;
  }
  if (
    o.repeatIntervalDays !== undefined &&
    optRepeatIntervalDays(o.repeatIntervalDays) === null
  ) {
    // If value is present, it must be a valid interval days count.
    return false;
  }
  if (!optOk(o.category, "string")) {
    return false;
  }
  return true;
}

export function normalizeTaskImport(x: Record<string, unknown>): Task {
  return {
    id: typeof x.id === "string" ? Number.parseInt(x.id, 10) : (x.id as number),
    title: x.title as string,
    notes: x.notes as string,
    priority: x.priority as Task["priority"],
    frequency: isFrequency(x.frequency) ? x.frequency : "daily",
    repeatWeekday:
      typeof x.repeatWeekday === "string" && isRepeatWeekday(x.repeatWeekday)
        ? x.repeatWeekday
        : null,
    repeatDayOfMonth: optRepeatDayOfMonth(x.repeatDayOfMonth),
    repeatIntervalDays: optRepeatIntervalDays(x.repeatIntervalDays),
    createdAt: x.createdAt as string,
    startDate:
      typeof x.startDate === "string"
        ? x.startDate.slice(0, 10)
        : String(x.createdAt).slice(0, 10),
    endDate:
      x.endDate === undefined || x.endDate === null
        ? null
        : typeof x.endDate === "string"
          ? x.endDate.slice(0, 10)
          : null,
    updatedAt:
      typeof x.updatedAt === "string" ? (x.updatedAt as string) : (x.createdAt as string),
    category: typeof x.category === "string" ? x.category : null,
  };
}

export const emptyListMessage: Record<Filter, string> = {
  done: "No completed tasks yet.",
  active: "No active tasks. Add one above.",
  all: "No tasks yet.",
};

export const FILTER_OPTIONS: readonly (readonly [Filter, string])[] = [
  ["active", "Active"],
  ["all", "All"],
  ["done", "Done"],
];
