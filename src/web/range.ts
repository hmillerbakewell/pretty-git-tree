export const PRESETS = ["today", "yesterday", "this-week", "last-week", "this-month", "last-month", "custom"] as const;
export type Preset = (typeof PRESETS)[number];

export const PRESET_LABELS: Record<Preset, string> = {
  today: "Today",
  yesterday: "Yesterday",
  "this-week": "This week",
  "last-week": "Last week",
  "this-month": "This month",
  "last-month": "Last month",
  custom: "Custom",
};

export interface DayRange {
  start: string;
  end: string | null;
}

const twoDigits = (value: number) => String(value).padStart(2, "0");

export const day = (date: Date): string => `${date.getFullYear()}-${twoDigits(date.getMonth() + 1)}-${twoDigits(date.getDate())}`;

const localDate = (year: number, monthIndex: number, dayOfMonth: number) => new Date(year, monthIndex, dayOfMonth);

function dateParts(isoDay: string): [year: number, monthIndex: number, dayOfMonth: number] {
  const [year = 1970, month = 1, dayOfMonth = 1] = isoDay.split("-").map(Number);
  return [year, month - 1, dayOfMonth];
}

const span = (from: Date, to: Date | null): DayRange => ({ start: day(from), end: to && day(to) });

export function presetRange(preset: Exclude<Preset, "custom">, now: Date): DayRange {
  const year = now.getFullYear();
  const month = now.getMonth();
  const today = now.getDate();
  const monday = today - ((now.getDay() + 6) % 7);
  switch (preset) {
    case "today":
      return span(localDate(year, month, today), null);
    case "yesterday":
      return span(localDate(year, month, today - 1), localDate(year, month, today));
    case "this-week":
      return span(localDate(year, month, monday), null);
    case "last-week":
      return span(localDate(year, month, monday - 7), localDate(year, month, monday));
    case "this-month":
      return span(localDate(year, month, 1), null);
    case "last-month":
      return span(localDate(year, month - 1, 1), localDate(year, month, 1));
  }
}

export function customRange(from: string, to: string, now: Date): DayRange {
  const [year, monthIndex, dayOfMonth] = dateParts(to);
  const end = day(localDate(year, monthIndex, dayOfMonth + 1));
  return { start: from, end: end > day(now) ? null : end };
}

export const sinceArg = (range: DayRange): string => `${range.start}T00:00`;

export const untilArg = (range: DayRange): string | undefined => (range.end === null ? undefined : `${dayBefore(range.end)}T23:59:59`);

export function dayBefore(isoDay: string): string {
  const [year, monthIndex, dayOfMonth] = dateParts(isoDay);
  return day(localDate(year, monthIndex, dayOfMonth - 1));
}

const secondsAtStartOf = (isoDay: string): number => localDate(...dateParts(isoDay)).getTime() / 1000;

export const bounds = (range: DayRange): { since: number; until: number | null } => ({
  since: secondsAtStartOf(range.start),
  until: range.end === null ? null : secondsAtStartOf(range.end) - 1,
});
