import { Band, fillFit } from "../../draw/band.ts";
import type { Frame } from "../../draw/frame.ts";
import type { Options } from "../../model.ts";
import type { LayoutView, PlacedCommit, PlacedLane } from "../../style/view.ts";
import { clamp } from "../../util/maths.ts";
import type { Carried } from "./flow.ts";

const CROSS_SHARE_USED = 0.9;
const CROSS_SHARE_BETWEEN_SLOTS = 0.3;
const WIDEST_RIBBON_SHARE = 0.45;
const HAIRLINE_SHARE_OF_SLOT = 0.2;
const THINNEST_HAIRLINE = 0.8;
const THICKEST_HAIRLINE = 3;
const INPUT_INSET = 14;
const COAST_PAST_END = 18;
const WIDENING_LENGTH = 14;
const CURVE_SAMPLE_SPACING = 4;
const SHORTEST_BEND = 28;
const BEND_LENGTH_PER_ACROSS = 2;

export interface Channels {
  readonly band: Band;
  readonly unit: number;
  readonly hairline: number;
  readonly inputStart: number;
  readonly coast: number;
  readonly wideningLength: number;
  readonly curveSpacing: number;
  readonly widthOf: (commitCount: number) => number;
  readonly centreOf: (slot: number) => number;
  readonly flow: (commit: PlacedCommit) => number;
  readonly along: (commit: PlacedCommit) => number;
  readonly runStart: (commit: PlacedCommit) => number;
  readonly bendLength: (acrossChange: number) => number;
}

function bandFor(frame: Frame, view: LayoutView, options: Options): Band {
  const fit = options.route === "fill" && view.commits.length ? fillFit(view.layout, frame) : undefined;
  return new Band(view.layout, frame, fit, false);
}

function crossExtent(frame: Frame, band: Band): number {
  if (band.route) return band.slotCount * band.spacing;
  return CROSS_SHARE_USED * (frame.vertical ? frame.width - 2 * frame.margin : frame.height - frame.footer - frame.header);
}

function flowFrom(carried: Carried): (commit: PlacedCommit) => number {
  const carriedBefore = (lane: PlacedLane): number => {
    const fork = lane.commits[0]?.firstParentInRange;
    return (fork && carried.total.get(fork)) ?? 0;
  };
  return (commit) => (carried.total.get(commit) ?? 0) - carriedBefore(commit.lane);
}

function slotPeaks(view: LayoutView, flow: (commit: PlacedCommit) => number): Map<number, number> {
  const peaks = new Map<number, number>();
  for (const lane of view.lanes) {
    for (const commit of lane.commits) peaks.set(lane.slot, Math.max(peaks.get(lane.slot) ?? 0, flow(commit)));
  }
  return peaks;
}

function widthScale(band: Band, peaks: ReadonlyMap<number, number>, cross: number, gap: number, hairline: number): number {
  let sumOfPeaks = 0;
  let highestPeak = 1;
  for (let slot = band.lowestSlot; slot <= band.highestSlot; slot++) {
    sumOfPeaks += peaks.get(slot) ?? 0;
    highestPeak = Math.max(highestPeak, peaks.get(slot) ?? 0);
  }
  const room = cross - (band.slotCount - 1) * gap - band.slotCount * hairline;
  return Math.max(0, Math.min(room / Math.max(sumOfPeaks, 1), (WIDEST_RIBBON_SHARE * cross) / highestPeak));
}

function slotCentres(band: Band, peaks: ReadonlyMap<number, number>, gap: number, widthOf: (commitCount: number) => number): (slot: number) => number {
  const offsets = new Map<number, number>();
  let filled = 0;
  for (let slot = band.lowestSlot; slot <= band.highestSlot; slot++) {
    const width = widthOf(peaks.get(slot) ?? 0);
    offsets.set(slot, filled + width / 2);
    filled += width + gap;
  }
  const extent = filled - gap;
  return (slot) => band.middleAcross + (offsets.get(slot) ?? 0) - extent / 2;
}

export function channelsOf(frame: Frame, view: LayoutView, options: Options, carried: Carried): Channels {
  const { unit } = frame;
  const band = bandFor(frame, view, options);
  const cross = crossExtent(frame, band);
  const flow = flowFrom(carried);
  const peaks = slotPeaks(view, flow);
  const gap = band.slotCount > 1 ? (CROSS_SHARE_BETWEEN_SLOTS * cross) / band.slotCount : 0;
  const hairline = clamp((HAIRLINE_SHARE_OF_SLOT * cross) / band.slotCount, THINNEST_HAIRLINE, THICKEST_HAIRLINE * unit);
  const scale = widthScale(band, peaks, cross, gap, hairline);
  const widthOf = (commitCount: number) => hairline + scale * commitCount;
  return {
    band,
    unit,
    hairline,
    inputStart: band.timeAxisStart - INPUT_INSET * unit,
    coast: band.timeAxisEnd + COAST_PAST_END * unit,
    wideningLength: WIDENING_LENGTH * unit,
    curveSpacing: CURVE_SAMPLE_SPACING * unit,
    widthOf,
    centreOf: slotCentres(band, peaks, gap, widthOf),
    flow,
    along: (commit) => band.alongAt(commit.timeFraction),
    runStart: (commit) => band.alongAt(commit.runStartTimeFraction),
    bendLength: (acrossChange) => Math.max(Math.abs(acrossChange) * BEND_LENGTH_PER_ACROSS, SHORTEST_BEND * unit),
  };
}
