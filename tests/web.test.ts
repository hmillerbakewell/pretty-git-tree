import { expect, test } from "vitest";
import { formatDayRange, logCommand } from "../src/core/index.ts";
import { bucket, referringDomain, shape } from "../src/web/analytics.ts";
import { bounds, customRange, dayBefore, presetRange, sinceArg, untilArg } from "../src/web/range.ts";
import { DEFAULTS, LAYOUTS, layoutOf, OPTIONS, onLayout, tunable, validSettings, withLayout } from "../src/web/settings.ts";

const FRIDAY_2_OCTOBER_2026_AFTERNOON = new Date(2026, 9, 2, 15, 30);
const now = FRIDAY_2_OCTOBER_2026_AFTERNOON;
const secondsWhenLocalIsUtcAsInViteConfig = (iso: string) => Date.parse(`${iso}Z`) / 1000;

function untilOf(range: { until: number | null }): number {
  if (range.until === null) throw new Error("expected a range with an end");
  return range.until;
}

const ignoringIcuSpacingRoundTheDash = (text: string) => text.replace(/\s*–\s*/, "–");

test("presets are calendar days, weeks starting on Monday", () => {
  expect(presetRange("today", now)).toEqual({ start: "2026-10-02", end: null });
  expect(presetRange("yesterday", now)).toEqual({ start: "2026-10-01", end: "2026-10-02" });
  expect(presetRange("this-week", now)).toEqual({ start: "2026-09-28", end: null });
  expect(presetRange("last-week", now)).toEqual({ start: "2026-09-21", end: "2026-09-28" });
  expect(presetRange("this-month", now)).toEqual({ start: "2026-10-01", end: null });
  expect(presetRange("last-month", now)).toEqual({ start: "2026-09-01", end: "2026-10-01" });
});

test("a Sunday is the end of its week, and January's last month is December", () => {
  expect(presetRange("this-week", new Date(2026, 9, 4))).toEqual({ start: "2026-09-28", end: null });
  expect(presetRange("this-week", new Date(2026, 9, 5))).toEqual({ start: "2026-10-05", end: null });
  expect(presetRange("last-month", new Date(2027, 0, 15))).toEqual({ start: "2026-12-01", end: "2027-01-01" });
});

test("custom ranges include their last day, and run to now when that's today", () => {
  expect(customRange("2026-09-01", "2026-09-30", now)).toEqual({ start: "2026-09-01", end: "2026-10-01" });
  expect(customRange("2026-09-01", "2026-10-02", now)).toEqual({ start: "2026-09-01", end: null });
});

test("the command gets local midnight, the slice an inclusive end", () => {
  const range = presetRange("yesterday", now);
  expect(sinceArg(range)).toBe("2026-10-01T00:00");
  expect(logCommand({ since: sinceArg(range) })).toContain("--since=2026-10-01T00:00");
  expect(bounds(range)).toEqual({
    since: secondsWhenLocalIsUtcAsInViteConfig("2026-10-01T00:00:00"),
    until: secondsWhenLocalIsUtcAsInViteConfig("2026-10-02T00:00:00") - 1,
  });
  expect(bounds(presetRange("today", now)).until).toBeNull();
});

test("counts go out as coarse buckets", () => {
  expect([0, 1, 2, 5, 6, 37, 2000, 2001].map((count) => bucket(count))).toEqual(["0", "1", "2-5", "2-5", "6-20", "21-100", "501-2000", "2001+"]);
  expect(shape({ commits: 37, branches: 3, merges: 0, first: 0, last: 3 * 86400 })).toEqual({
    commits: "21-100",
    branches: "3-5",
    merges: "0",
    span_days: "2-7",
  });
});

test("the command asks git for the whole range, end included", () => {
  const range = presetRange("last-week", now);
  expect(untilArg(range)).toBe("2026-09-27T23:59:59");
  expect(logCommand({ since: sinceArg(range), until: untilArg(range) })).toContain("--since=2026-09-21T00:00 --until=2026-09-27T23:59:59");
  expect(untilArg(presetRange("this-week", now))).toBeUndefined();
  expect(dayBefore("2026-03-01")).toBe("2026-02-28");
});

test("a range on one day reads as one date", () => {
  const yesterday = bounds(presetRange("yesterday", now));
  expect(formatDayRange(yesterday.since, untilOf(yesterday), "en-GB")).toBe("1 Oct 2026");
  const lastWeek = bounds(presetRange("last-week", now));
  expect(ignoringIcuSpacingRoundTheDash(formatDayRange(lastWeek.since, untilOf(lastWeek), "en-GB"))).toBe("21–27 Sept 2026");
});

test("only the referring site's domain is kept", () => {
  const here = "https://tree.hjmb.co.uk/";
  expect(referringDomain("https://www.linkedin.com/feed/update/urn:li:activity:123?trk=x", here)).toBe("linkedin.com");
  expect(referringDomain("", here)).toBe("$direct");
  expect(referringDomain("https://tree.hjmb.co.uk/#view=gallery", here)).toBe("$direct");
});

test("fine-tuning follows each style's tunes: twists, then trunk, then detail and time", () => {
  expect(tunable("circuit")).toEqual(["twists", "arrange", "route", "level", "time"]);
  expect(tunable("commutative")).toEqual(["twists", "arrange", "level", "time"]);
  expect(tunable("alluvial")).toEqual(["arrange", "route", "level", "time"]);
  expect(tunable("strings")).toEqual(["route", "level", "time"]);
  expect(tunable("arcs")).toEqual(["level", "time"]);
});

test("untrusted settings keep known values and default the rest", () => {
  const settings = validSettings({ style: "arcs", level: "full", twists: "7", time: 3, theme: "nope" });
  expect(settings).toEqual({ ...DEFAULTS, style: "arcs", level: "full" });
});

test("every layout is a valid, distinct starting point", () => {
  for (const startingPoint of LAYOUTS) {
    const settings = withLayout(DEFAULTS, startingPoint);
    expect(validSettings(settings), startingPoint.id).toEqual(settings);
    expect(layoutOf(settings), startingPoint.id).toBe(startingPoint);
  }
  expect(new Set(LAYOUTS.map((startingPoint) => startingPoint.style)).size).toBe(LAYOUTS.length);
});

test("the zoo offers only the styles the make page can draw", () => {
  expect(OPTIONS.style.map((choice) => choice.id)).toEqual(LAYOUTS.map((layout) => layout.style));
  expect(validSettings({ style: "circuit" }).style).toBe(LAYOUTS[0].style);
});

test("settings for a style that isn't offered start again from the first layout", () => {
  const settings = onLayout({ ...DEFAULTS, style: "circuit", theme: "paper" });
  expect(layoutOf(settings)).toBe(LAYOUTS[0]);
  expect(settings.theme).toBe("paper");
});
