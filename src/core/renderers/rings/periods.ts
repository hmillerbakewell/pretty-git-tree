const SECONDS_PER_HOUR = 3600;
const SECONDS_PER_DAY = 86400;
const DAYS_PER_WEEK = 7;
const FIRST_MONDAY_AFTER_EPOCH = 4 * SECONDS_PER_DAY;

type NextBoundary = (timestamp: number) => number;

const everyHours =
  (hours: number): NextBoundary =>
  (timestamp) =>
    (Math.floor(timestamp / (SECONDS_PER_HOUR * hours)) + 1) * SECONDS_PER_HOUR * hours;

const everyWeek: NextBoundary = (timestamp) =>
  (Math.floor((timestamp - FIRST_MONDAY_AFTER_EPOCH) / (DAYS_PER_WEEK * SECONDS_PER_DAY)) + 1) * DAYS_PER_WEEK * SECONDS_PER_DAY + FIRST_MONDAY_AFTER_EPOCH;

const everyMonths =
  (months: number): NextBoundary =>
  (timestamp) => {
    const date = new Date(timestamp * 1000);
    return Date.UTC(date.getUTCFullYear(), Math.floor(date.getUTCMonth() / months) * months + months, 1) / 1000;
  };

const PERIODS_FINEST_FIRST: readonly NextBoundary[] = [
  everyHours(1),
  everyHours(6),
  everyHours(24),
  everyWeek,
  everyMonths(1),
  everyMonths(3),
  everyMonths(12),
  everyMonths(60),
];

export function calendarCuts(start: number, end: number, mostRings: number): number[] | undefined {
  for (const nextBoundary of PERIODS_FINEST_FIRST) {
    const cuts: number[] = [];
    for (let boundary = nextBoundary(start); boundary < end && cuts.length < mostRings; boundary = nextBoundary(boundary)) cuts.push(boundary);
    if (cuts.length < mostRings) return cuts;
  }
  return undefined;
}

export function interpolateThrough(xs: readonly number[], ys: readonly number[]): (x: number) => number {
  return (x) => {
    if (x <= xs[0]) return ys[0];
    for (let index = 1; index < xs.length; index++) {
      if (x <= xs[index]) {
        const span = xs[index] - xs[index - 1];
        return span > 0 ? ys[index - 1] + ((ys[index] - ys[index - 1]) * (x - xs[index - 1])) / span : ys[index - 1];
      }
    }
    return ys[ys.length - 1];
  };
}
