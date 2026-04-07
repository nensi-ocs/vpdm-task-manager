import type { Frequency, ImportedTask, Priority, VpdmArea } from "./task.types";

function ymdInKolkata(date: Date): string {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(date);
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const d = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${d}`;
}

export function isPriority(x: unknown): x is Priority {
  return x === "low" || x === "medium" || x === "high";
}

export function isFrequency(x: unknown): x is Frequency {
  return (
    x === "daily" ||
    x === "weekly" ||
    x === "monthly" ||
    x === "interval" ||
    x === "once"
  );
}

function normalizeVpdmArea(value: unknown): VpdmArea {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  return raw === "comments" ? "comments" : "main";
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

export function isRepeatWeekday(x: unknown): x is (typeof WEEKDAYS)[number] {
  return typeof x === "string" && (WEEKDAYS as readonly string[]).includes(x);
}

export function isRepeatDayOfMonth(
  x: unknown
): x is number {
  return (
    typeof x === "number" && Number.isInteger(x) && x >= 1 && x <= 31
  );
}

export function isRepeatIntervalDays(x: unknown): x is number {
  return typeof x === "number" && Number.isInteger(x) && x >= 1 && x <= 365;
}

/** Legacy JSON exports may omit VPDM fields */
export function isImportedTask(x: unknown): x is Record<string, unknown> {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    (typeof o.id === "number" || typeof o.id === "string") &&
    typeof o.title === "string" &&
    typeof o.notes === "string" &&
    isPriority(o.priority) &&
    (o.frequency === undefined || isFrequency(o.frequency)) &&
    (o.repeatWeekday === undefined ||
      o.repeatWeekday === null ||
      isRepeatWeekday(o.repeatWeekday)) &&
    (o.repeatDayOfMonth === undefined ||
      o.repeatDayOfMonth === null ||
      isRepeatDayOfMonth(o.repeatDayOfMonth) ||
      (typeof o.repeatDayOfMonth === "string" &&
        (() => {
          const n = Number.parseInt(o.repeatDayOfMonth as string, 10);
          return Number.isInteger(n) && n >= 1 && n <= 31;
        })())) &&
    (o.repeatIntervalDays === undefined ||
      o.repeatIntervalDays === null ||
      isRepeatIntervalDays(o.repeatIntervalDays) ||
      (typeof o.repeatIntervalDays === "string" &&
        (() => {
          const n = Number.parseInt(o.repeatIntervalDays as string, 10);
          return Number.isInteger(n) && n >= 1 && n <= 365;
        })())) &&
    (o.completed === undefined || typeof o.completed === "boolean") &&
    typeof o.createdAt === "string" &&
    (o.updatedAt === undefined || typeof o.updatedAt === "string") &&
    (o.startDate === undefined || typeof o.startDate === "string") &&
    (o.endDate === undefined || o.endDate === null || typeof o.endDate === "string")
  );
}

export function normalizeImportedTask(o: Record<string, unknown>): ImportedTask {
  const optStr = (k: string, max: number): string | null => {
    const v = o[k];
    if (v === undefined || v === null || v === "") return null;
    if (typeof v !== "string") return null;
    return v.trim().slice(0, max) || null;
  };
  const optRepeatWeekday = (): string | null => {
    const v = o.repeatWeekday;
    if (v === undefined || v === null || v === "") return null;
    if (!isRepeatWeekday(v)) return null;
    return v;
  };

  const optRepeatDayOfMonth = (): number | null => {
    const v = o.repeatDayOfMonth;
    if (v === undefined || v === null || v === "") return null;
    if (isRepeatDayOfMonth(v)) return v;
    if (typeof v === "string") {
      const n = Number.parseInt(v, 10);
      if (Number.isInteger(n) && n >= 1 && n <= 31) return n;
    }
    return null;
  };

  const optRepeatIntervalDays = (): number | null => {
    const v = o.repeatIntervalDays;
    if (v === undefined || v === null || v === "") return null;
    if (isRepeatIntervalDays(v)) return v;
    if (typeof v === "string") {
      const n = Number.parseInt(v, 10);
      if (Number.isInteger(n) && n >= 1 && n <= 365) return n;
    }
    return null;
  };

  return {
    id:
      typeof o.id === "string" ? Number.parseInt(o.id, 10) : (o.id as number),
    title: (o.title as string).slice(0, 200),
    notes: (o.notes as string).slice(0, 2000),
    priority: o.priority as Priority,
    frequency: isFrequency(o.frequency) ? o.frequency : "daily",
    repeatWeekday: optRepeatWeekday(),
    repeatDayOfMonth: optRepeatDayOfMonth(),
    repeatIntervalDays: optRepeatIntervalDays(),
    createdAt: o.createdAt as string,
    updatedAt:
      typeof o.updatedAt === "string" ? o.updatedAt : (o.createdAt as string),
    startDate:
      typeof o.startDate === "string"
        ? String(o.startDate).slice(0, 10)
        : ymdInKolkata(new Date(String(o.createdAt))),
    endDate:
      o.endDate === undefined || o.endDate === null
        ? null
        : String(o.endDate).slice(0, 10),
    category: optStr("category", 120),
    vpdmArea: normalizeVpdmArea((o as { vpdmArea?: unknown }).vpdmArea),
  };
}
