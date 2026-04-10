const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const MONTHS_EN = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** e.g. 10 April, 2026 — for task table Scheduled / Completed columns. */
export function formatIsoDateDayMonthCommaYear(iso: string): string {
  const m = ISO_DATE.exec(iso.trim());
  if (!m) return iso;
  const [, y, mo, d] = m;
  const monthIdx = Number(mo) - 1;
  const dayNum = Number(d);
  if (monthIdx < 0 || monthIdx > 11) return iso;
  return `${dayNum} ${MONTHS_EN[monthIdx]}, ${y}`;
}

/** Calendar day as DD/MM/YYYY from an API / input value (YYYY-MM-DD). */
export function formatIsoDateDdMmYyyy(iso: string): string {
  const m = ISO_DATE.exec(iso.trim());
  if (!m) return iso;
  const [, y, mo, d] = m;
  return `${d}/${mo}/${y}`;
}

/** Month label from any YYYY-MM-DD in that month: MM/YYYY */
export function formatIsoMonthYear(iso: string): string {
  const m = ISO_DATE.exec(iso.trim());
  if (!m) return iso;
  const [, y, mo] = m;
  return `${mo}/${y}`;
}

/** Parses DD/MM/YYYY (day first) -> YYYY-MM-DD, or null if invalid. */
export function parseDdMmYyyyToIso(raw: string): string | null {
  const t = raw.trim();
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1000 || year > 9999) {
    return null;
  }
  const dt = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  if (
    dt.getUTCFullYear() !== year ||
    dt.getUTCMonth() !== month - 1 ||
    dt.getUTCDate() !== day
  ) {
    return null;
  }
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
