import { backgroundPaint } from "../draw/backdrop.ts";
import type { Frame } from "../draw/frame.ts";
import { glowFilter } from "../draw/marks.ts";
import { element, group, type Point, polylinePath, type SvgElement } from "../draw/svg.ts";
import type { Theme } from "../draw/themes.ts";
import type { Graph } from "../model.ts";
import { defineStyle } from "../style/renderer.ts";
import type { LayoutView, PlacedCommit, PlacedLane } from "../style/view.ts";
import { clamp, smoothstep } from "../util/maths.ts";
import { seededRandom } from "../util/random.ts";

const QUIET_LOUDNESS = 0.15;
const PEAK_HEIGHT_IN_ROWS = 7;
const TEXTURE_IN_ROWS = 0.7;
const LOUDNESS_EXPONENT = 0.55;
const ROW_SPACING = 10;
const FEWEST_ROWS = 24;
const MOST_ROWS = 72;
const TIME_BLUR_IN_ROWS = 1.2;
const EASE_IN_ROWS = 3.5;
const LONGEST_EASE_SHARE_OF_SPAN = 0.35;
const SIGNAL_SHARE_OF_WIDTH = 0.56;
const WIDEST_SLOT_PITCH_SHARE = 0.14;
const BUMP_WIDTH_PER_PITCH = 0.42;
const NARROWEST_BUMP_SHARE = 0.018;
const SAMPLE_SPACING = 4;
const FEWEST_SAMPLES = 120;
const MOST_SAMPLES = 240;
const WOBBLE_MEMORY = 0.55;
const WOBBLE_FRESHNESS = 0.45;
const QUIET_TEXTURE = 0.08;
const SIDE_OVERRUN = 20;
const TIME_TOLERANCE = 1e-9;
const BACKGROUND_PAINT_ID = "behind";
const PLOT_CLIP_ID = "plot";

interface Rows {
  readonly count: number;
  readonly gap: number;
  readonly top: number;
}

interface Signal {
  readonly x: number;
  readonly loudness: number;
}

interface LaneMotion {
  readonly start: number;
  readonly end: number;
  readonly easeLength: number;
  readonly ownX: number;
  readonly forkX: number | undefined;
  readonly mergeX: number | undefined;
  readonly fadesIn: boolean;
  readonly commits: readonly PlacedCommit[];
}

const gaussian = (distance: number, spread: number): number => Math.exp(-0.5 * (distance / spread) ** 2);

function rowsOf(frame: Frame): Rows {
  const [, top, , bottom] = frame.plot;
  const count = clamp(Math.round((bottom - top) / (ROW_SPACING * frame.unit)), FEWEST_ROWS, MOST_ROWS);
  const gap = (bottom - top) / (count - 1 + PEAK_HEIGHT_IN_ROWS);
  return { count, gap, top: top + PEAK_HEIGHT_IN_ROWS * gap };
}

const latest = (commits: readonly PlacedCommit[]): PlacedCommit | undefined =>
  commits.reduce<PlacedCommit | undefined>((found, commit) => (found && found.timeFraction >= commit.timeFraction ? found : commit), undefined);

function laneMotion(lane: PlacedLane, slotX: (slot: number) => number, ease: number): LaneMotion | undefined {
  const first = lane.commits[0];
  const last = lane.commits.at(-1);
  if (!first || !last) return undefined;
  const tipChildren = last.childrenInRange;
  const fork = first.firstParentInRange;
  const mergedInto = lane.continuesAfterRange ? undefined : latest(tipChildren.filter((child) => child.firstParentInRange !== last));
  const start = lane.entersFromBeforeRange ? 0 : (fork?.timeFraction ?? first.timeFraction);
  const end = lane.continuesAfterRange ? 1 : Math.max(last.timeFraction, ...tipChildren.map((child) => child.timeFraction));
  return {
    start,
    end,
    easeLength: Math.min(ease, (end - start) * LONGEST_EASE_SHARE_OF_SPAN),
    ownX: slotX(lane.slot),
    forkX: fork && slotX(fork.lane.slot),
    mergeX: mergedInto && slotX(mergedInto.lane.slot),
    fadesIn: !lane.entersFromBeforeRange,
    commits: lane.commits,
  };
}

function signalAt(motion: LaneMotion, time: number, timeBlur: number): Signal | undefined {
  if (time < motion.start - TIME_TOLERANCE || time > motion.end + TIME_TOLERANCE) return undefined;
  const easing = motion.easeLength > 0;
  const entered = easing && time < motion.start + motion.easeLength ? smoothstep((time - motion.start) / motion.easeLength) : 1;
  const leaving = easing && motion.mergeX !== undefined && time > motion.end - motion.easeLength;
  const left = leaving ? smoothstep((time - (motion.end - motion.easeLength)) / motion.easeLength) : 0;
  const enteredX = motion.forkX === undefined ? motion.ownX : motion.forkX * (1 - entered) + motion.ownX * entered;
  const x = leaving ? enteredX * (1 - left) + (motion.mergeX ?? enteredX) * left : enteredX;
  const fade = motion.forkX === undefined && motion.fadesIn ? entered : 1;
  const loudness = motion.commits.reduce((sum, commit) => sum + commit.weight * gaussian(commit.timeFraction - time, timeBlur), QUIET_LOUDNESS * fade);
  return { x, loudness };
}

function sampleXs(frame: Frame): number[] {
  const [left, , right] = frame.plot;
  const width = right - left;
  const count = Math.round(clamp(width / (SAMPLE_SPACING * frame.unit), FEWEST_SAMPLES, MOST_SAMPLES));
  return Array.from({ length: count + 1 }, (_, index) => left + (index * width) / count);
}

function slotPlacement(frame: Frame, view: LayoutView): { slotX: (slot: number) => number; bumpWidth: number } {
  const [left, , right] = frame.plot;
  const width = right - left;
  const pitch = Math.min((width * SIGNAL_SHARE_OF_WIDTH) / (view.highestSlot - view.lowestSlot + 1), width * WIDEST_SLOT_PITCH_SHARE);
  const middleSlot = (view.lowestSlot + view.highestSlot) / 2;
  return {
    slotX: (slot) => (left + right) / 2 + (slot - middleSlot) * pitch,
    bumpWidth: Math.max(pitch * BUMP_WIDTH_PER_PITCH, width * NARROWEST_BUMP_SHARE),
  };
}

function loudnessField(frame: Frame, view: LayoutView, rows: Rows): Point[][] {
  const { slotX, bumpWidth } = slotPlacement(frame, view);
  const motions = view.lanes.flatMap((lane) => laneMotion(lane, slotX, EASE_IN_ROWS / rows.count) ?? []);
  const xs = sampleXs(frame);
  return Array.from({ length: rows.count }, (_, row) => {
    const time = row / (rows.count - 1);
    const live = motions.flatMap((motion) => signalAt(motion, time, TIME_BLUR_IN_ROWS / rows.count) ?? []);
    return xs.map((x): Point => [x, live.reduce((sum, signal) => sum + signal.loudness * gaussian(x - signal.x, bumpWidth), 0) ** LOUDNESS_EXPONENT]);
  });
}

function ridgeOutline(samples: readonly Point[], base: number, peak: number, rows: Rows, frame: Frame, nextRandom: () => number): string {
  const [left, , right, bottom] = frame.plot;
  let wobble = 0;
  const ridge = samples.map(([x, value]): Point => {
    const level = value / peak;
    wobble = WOBBLE_MEMORY * wobble + WOBBLE_FRESHNESS * (nextRandom() - 0.5);
    return [x, base - level * PEAK_HEIGHT_IN_ROWS * rows.gap + wobble * TEXTURE_IN_ROWS * rows.gap * (QUIET_TEXTURE + level)];
  });
  const below = bottom + rows.gap;
  const underneath: Point[] = [
    [right + SIDE_OVERRUN, ridge.at(-1)?.[1] ?? base],
    [right + SIDE_OVERRUN, below],
    [left - SIDE_OVERRUN, below],
    [left - SIDE_OVERRUN, ridge[0]?.[1] ?? base],
  ];
  return `${polylinePath([...ridge, ...underneath])} Z`;
}

function ridges(graph: Graph, frame: Frame, theme: Theme, view: LayoutView, rows: Rows): SvgElement[] {
  const field = loudnessField(frame, view, rows);
  const peak = Math.max(TIME_TOLERANCE, ...field.flat().map(([, value]) => value));
  const nextRandom = seededRandom(graph.commits.length * 7919 + view.lanes.length * 104729 + rows.count);
  const head = view.commits.find((commit) => commit.isHead);
  const headRow = head ? Math.round(head.timeFraction * (rows.count - 1)) : -1;
  const strokeWidth = 1.4 * frame.unit;
  return field.map((samples, row) =>
    element("path", {
      d: ridgeOutline(samples, rows.top + row * rows.gap, peak, rows, frame, nextRandom),
      fill: `url(#${BACKGROUND_PAINT_ID})`,
      stroke: row === headRow && head ? head.colour : theme.ink,
      "stroke-width": row === headRow ? strokeWidth * 1.8 : strokeWidth,
      "stroke-linejoin": "round",
    }),
  );
}

function plotClip(frame: Frame, rows: Rows): SvgElement {
  const [left, , right, bottom] = frame.plot;
  return element("clipPath", { id: PLOT_CLIP_ID }, [element("rect", { x: left, y: 0, width: right - left, height: bottom + rows.gap * 0.5 })]);
}

export const ridgeline = defineStyle({
  name: "ridgeline",
  description: "Rows of time stacked like Unknown Pleasures; each live branch a peak.",
  tunes: ["arrange"],

  draw({ graph, frame, theme, view }) {
    const rows = rowsOf(frame);
    return {
      definitions: [backgroundPaint(frame, theme, BACKGROUND_PAINT_ID), plotClip(frame, rows)],
      layers: [group({ "clip-path": `url(#${PLOT_CLIP_ID})`, ...glowFilter(theme) }, ridges(graph, frame, theme, view, rows))],
    };
  },
});
