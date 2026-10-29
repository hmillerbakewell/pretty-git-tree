const MILLISECONDS_PER_SECOND = 1000;
const CALENDAR_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

export function formatDayRange(from: number, to: number, locale?: string): string {
  const days = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" });
  return days.formatRange(new Date(from * MILLISECONDS_PER_SECOND), new Date(Math.max(from, to) * MILLISECONDS_PER_SECOND));
}

function localMidnightOrInstant(value: string): number {
  const day = CALENDAR_DAY.exec(value);
  if (!day) return new Date(value).getTime();
  const [, year, month, dayOfMonth] = day;
  return new Date(Number(year), Number(month) - 1, Number(dayOfMonth)).getTime();
}

export function parseDate(value: string | null | undefined): number | null {
  if (!value) return null;
  const milliseconds = localMidnightOrInstant(value);
  if (Number.isNaN(milliseconds)) throw new Error(`can't read date ${JSON.stringify(value)}; use e.g. 2026-01-31`);
  return Math.floor(milliseconds / MILLISECONDS_PER_SECOND);
}
