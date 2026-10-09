const DATE_KEY_FORMATTER_CACHE = new Map<string, Intl.DateTimeFormat>();
const HOUR_FORMATTER_CACHE = new Map<string, Intl.DateTimeFormat>();

function dateKeyFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = DATE_KEY_FORMATTER_CACHE.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    DATE_KEY_FORMATTER_CACHE.set(timeZone, formatter);
  }
  return formatter;
}

function hourFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = HOUR_FORMATTER_CACHE.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "numeric",
      hour12: false,
    });
    HOUR_FORMATTER_CACHE.set(timeZone, formatter);
  }
  return formatter;
}

/** Whether `timeZone` is a valid IANA timezone identifier. */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    dateKeyFormatter(timeZone).format(new Date());
    return true;
  } catch {
    return false;
  }
}

/** Calendar date as YYYY-MM-DD in the given IANA timezone. */
export function localDateKey(date: Date, timeZone: string): string {
  return dateKeyFormatter(timeZone).format(date);
}

/** Local hour (0–23) in the given IANA timezone. */
export function localHour(date: Date, timeZone: string): number {
  const raw = Number.parseInt(hourFormatter(timeZone).format(date), 10);
  return raw === 24 ? 0 : raw;
}

/** Previous calendar day relative to a YYYY-MM-DD key. */
export function previousDateKey(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() - 1);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
