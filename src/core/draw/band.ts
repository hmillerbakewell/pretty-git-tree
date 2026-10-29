import { laneSlotRange } from "../graph/layout.ts";
import type { Edge, Layout } from "../model.ts";
import { clamp, smallestGapBetweenTimes } from "../util/maths.ts";
import { hilbertRoute, type Route, Twist } from "./embed.ts";
import type { Frame } from "./frame.ts";
import type { Point } from "./svg.ts";

export interface Fit {
  route: Route;
  spacing: number;
}

const PASS_GAP_IN_BAND_WIDTHS = 1.3;
const SLOT_SPACINGS_PER_COMMIT_STEP = 2.2;
const SMALLEST_FILL_SPACING = 6;
const LARGEST_SPACING = 120;
const SMALLEST_GRID_SIDE = 2;
const LARGEST_SPACING_SHARE_OF_CROSS_AXIS = 0.2;
const TRACE_SHARE_OF_SPACING = 0.13;
const SMALLEST_TRACE = 2;
const LARGEST_TRACE = 9;
const VIA_RADIUS_SHARE_OF_SPACING = 0.17;
const SMALLEST_VIA_RADIUS = 4;
const LARGEST_VIA_RADIUS = 14;
const VIA_RADII_OF_PADDING = 3;
const SMALLEST_UNIT = 8;
const SMALLEST_SPACING_FOR_45_DEGREE_BENDS = 18;
const LARGEST_VIA_RADIUS_SHARE_OF_UNIT = 0.36;
const LARGEST_VIA_RADIUS_SHARE_OF_SPACING = 0.3;
const LARGEST_TRACE_SHARE_OF_VIA_RADIUS = 0.7;

const slotCountOf = (layout: Layout): number => {
  const [lowest, highest] = laneSlotRange(layout);
  return highest - lowest + 1;
};

const tightestTimeStep = (layout: Layout): number => smallestGapBetweenTimes(layout.placements.map((placement) => placement.timeFraction));

export function fillFit(layout: Layout, frame: Frame): Fit {
  const [left, top, right, bottom] = frame.plot;
  const [width, height] = [right - left, bottom - top];
  const slotCount = slotCountOf(layout);
  const tightestStep = tightestTimeStep(layout);
  const widestPitchForATwoByTwoGrid = Math.min(width, height) / 2;
  const bandCap = widestPitchForATwoByTwoGrid / (PASS_GAP_IN_BAND_WIDTHS * slotCount);
  const idealSpacing = Math.sqrt((tightestStep * width * height) / (SLOT_SPACINGS_PER_COMMIT_STEP * PASS_GAP_IN_BAND_WIDTHS * slotCount));
  const spacing = clamp(idealSpacing, SMALLEST_FILL_SPACING, Math.min(LARGEST_SPACING, bandCap));
  const pitchToFillTheFrame = (width * height * tightestStep) / (SLOT_SPACINGS_PER_COMMIT_STEP * spacing);
  const pitch = Math.min(widestPitchForATwoByTwoGrid, Math.max(PASS_GAP_IN_BAND_WIDTHS * slotCount * spacing, pitchToFillTheFrame));
  const cols = Math.max(SMALLEST_GRID_SIDE, Math.floor(width / pitch));
  const rows = Math.max(SMALLEST_GRID_SIDE, Math.floor(height / pitch));
  return { route: hilbertRoute([left, top, right, bottom], cols, rows), spacing: Math.min(spacing, bandCap) };
}

const crossAxisExtent = (frame: Frame): [number, number] =>
  frame.vertical ? [frame.margin, frame.width - frame.margin] : [frame.header, frame.height - frame.footer];

function timeAxisExtent(frame: Frame, fit: Fit | undefined, viaRadius: number): [number, number] {
  const padding = viaRadius * VIA_RADII_OF_PADDING;
  const roomPastTheOutputPads = viaRadius * VIA_RADII_OF_PADDING;
  if (fit) return [padding, fit.route.length - padding - roomPastTheOutputPads];
  if (frame.vertical) return [frame.header + padding, frame.height - frame.footer - roomPastTheOutputPads];
  return [frame.margin + padding, frame.width - frame.margin - roomPastTheOutputPads];
}

function straightSpacing([crossLow, crossHigh]: [number, number], slotCount: number): number {
  const crossLength = crossHigh - crossLow;
  return Math.min(crossLength / slotCount, crossLength * LARGEST_SPACING_SHARE_OF_CROSS_AXIS, LARGEST_SPACING);
}

const spacingFor45DegreeBends = (spacing: number, unit: number): number =>
  Math.min(spacing, Math.max(unit * SLOT_SPACINGS_PER_COMMIT_STEP, SMALLEST_SPACING_FOR_45_DEGREE_BENDS));

export class Band {
  readonly layout: Layout;
  readonly frame: Frame;
  readonly vertical: boolean;
  readonly lowestSlot: number;
  readonly highestSlot: number;
  readonly slotCount: number;
  readonly timeAxisStart: number;
  readonly timeAxisEnd: number;
  readonly unit: number;
  readonly spacing: number;
  readonly viaRadius: number;
  readonly trace: number;
  readonly middleAcross: number;
  readonly slotMid: number;
  readonly pointBySha: Map<string, Point>;
  readonly route: Route | null;

  constructor(lay: Layout, frame: Frame, fit?: Fit, bends = true) {
    this.layout = lay;
    this.frame = frame;
    this.vertical = frame.vertical;
    [this.lowestSlot, this.highestSlot] = laneSlotRange(lay);
    this.slotCount = this.highestSlot - this.lowestSlot + 1;
    const crossExtent = crossAxisExtent(frame);
    const spacing = fit ? fit.spacing : straightSpacing(crossExtent, this.slotCount);
    this.route = fit?.route ?? null;
    const trace = clamp(spacing * TRACE_SHARE_OF_SPACING, SMALLEST_TRACE, LARGEST_TRACE);
    const viaRadius = clamp(spacing * VIA_RADIUS_SHARE_OF_SPACING, SMALLEST_VIA_RADIUS, LARGEST_VIA_RADIUS);
    [this.timeAxisStart, this.timeAxisEnd] = timeAxisExtent(frame, fit, viaRadius);
    this.unit = Math.max(tightestTimeStep(lay) * (this.timeAxisEnd - this.timeAxisStart), SMALLEST_UNIT);
    this.spacing = bends ? spacingFor45DegreeBends(spacing, this.unit) : spacing;
    this.viaRadius = Math.min(viaRadius, this.unit * LARGEST_VIA_RADIUS_SHARE_OF_UNIT, this.spacing * LARGEST_VIA_RADIUS_SHARE_OF_SPACING);
    this.trace = Math.min(trace, this.viaRadius * LARGEST_TRACE_SHARE_OF_VIA_RADIUS);
    this.middleAcross = fit ? 0 : (crossExtent[0] + crossExtent[1]) / 2;
    this.slotMid = (this.lowestSlot + this.highestSlot) / 2;
    this.pointBySha = new Map(lay.placements.map((placement) => [placement.sha, [this.alongAt(placement.timeFraction), this.acrossAt(placement.slot)]]));
  }

  acrossAt(slot: number): number {
    return this.middleAcross + (slot - this.slotMid) * this.spacing;
  }

  alongAt(t: number): number {
    return this.timeAxisStart + t * (this.timeAxisEnd - this.timeAxisStart);
  }

  toPlane(tp: number, cp: number): Point {
    if (this.route) return this.route.point(tp, cp);
    return this.vertical ? [cp, tp] : [tp, cp];
  }

  twist(): Twist {
    const windows = this.layout.halfTwistWindows.map(([start, end]): [number, number] => [this.alongAt(start), this.alongAt(end)]);
    return new Twist(windows, this.middleAcross, ((this.slotCount - 1) / 2) * this.spacing);
  }

  private placed(sha: string): Point {
    const point = this.pointBySha.get(sha);
    if (!point) throw new Error(`commit ${sha} has no place on the band`);
    return point;
  }

  edgePoints(edge: Edge, inset = 0): Point[] {
    const [childAlong, childAcross] = this.placed(edge.child);
    if (edge.parent === null) {
      return [
        [this.timeAxisStart - inset, childAcross],
        [childAlong, childAcross],
      ];
    }
    const [parentAlong, parentAcross] = this.placed(edge.parent);
    const bendAt45Degrees = Math.min(Math.abs(childAcross - parentAcross), Math.max(childAlong - parentAlong, 0));
    const bendPoint: Point[] =
      edge.kind === "fork" ? [[parentAlong + bendAt45Degrees, childAcross]] : edge.kind === "merge" ? [[childAlong - bendAt45Degrees, parentAcross]] : [];
    return [[parentAlong, parentAcross], ...bendPoint, [childAlong, childAcross]];
  }
}
