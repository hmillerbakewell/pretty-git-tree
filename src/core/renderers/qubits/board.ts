import type { Band } from "../../draw/band.ts";
import type { Twist } from "../../draw/embed.ts";
import type { Frame } from "../../draw/frame.ts";
import { type Attributes, element, group, type Point, polylinePath, type SvgElement } from "../../draw/svg.ts";
import { consecutivePairs } from "../../util/lists.ts";
import { smallestGapBetweenTimes } from "../../util/maths.ts";
import type { GlyphSpot } from "./glyphs.ts";

const GATE_SHARE_OF_SPACING = 0.62;
const GATE_SHARE_OF_STEP = 0.82;
const LARGEST_GATE = 40;
const SMALLEST_GATE = 2;
const LINE_SHARE_OF_TRACE = 0.55;
const LINE_SHARE_OF_GATE = 0.08;
const THINNEST_LINE = 1;
const SMALLEST_READABLE_LABEL = 7;
const KET_SHARE_OF_GATE = 0.62;
const DENSIFY_STEP = 5;
const DEPTH_BUCKETS_PER_UNIT = 8;
const NEARNESS_GROWTH = 0.2;
const GLYPH_DEPTH_NUDGE = 0.01;

export const PaintLayer = { wire: 0, connector: 1, glyph: 2 } as const;

export interface Painted {
  readonly depth: number;
  readonly layer: number;
  readonly element: SvgElement;
}

export interface Board {
  readonly band: Band;
  readonly twist: Twist;
  readonly gateSize: number;
  readonly lineWidth: number;
  readonly showsLabels: boolean;
  readonly timeRunsDown: boolean;
}

type Embedded = [along: number, across: number, depth: number];

export function boardFor(band: Band, frame: Frame, eventTimes: readonly number[]): Board {
  const step = smallestGapBetweenTimes(eventTimes);
  const stepAlongBand = band.alongAt(step) - band.alongAt(0);
  const gateSize = Math.max(Math.min(band.spacing * GATE_SHARE_OF_SPACING, stepAlongBand * GATE_SHARE_OF_STEP, LARGEST_GATE), SMALLEST_GATE);
  return {
    band,
    twist: band.twist(),
    gateSize,
    lineWidth: Math.max(THINNEST_LINE, Math.min(band.trace * LINE_SHARE_OF_TRACE, gateSize * LINE_SHARE_OF_GATE)),
    showsLabels: gateSize * KET_SHARE_OF_GATE >= SMALLEST_READABLE_LABEL,
    timeRunsDown: frame.vertical && !band.route,
  };
}

const depthBucket = (depth: number) => Math.round(depth * DEPTH_BUCKETS_PER_UNIT);

function sameDepthRuns(points: readonly Embedded[]): Embedded[][] {
  const runs: Embedded[][] = [];
  for (const [previous, next] of consecutivePairs(points)) {
    const run = runs.at(-1);
    const runEnd = run?.at(-1);
    if (run && runEnd && depthBucket(runEnd[2]) === depthBucket(next[2])) run.push(next);
    else runs.push([previous, next]);
  }
  return runs;
}

const meanDepth = (run: readonly Embedded[]) => run.reduce((sum, [, , depth]) => sum + depth, 0) / run.length;

export function strand(board: Board, points: Point[], colour: string, layer: number, attributes: Attributes = {}): Painted[] {
  const { band, twist } = board;
  const embedded = twist.densify(points, DENSIFY_STEP, band.route !== null).map(([along, across]) => twist.map(along, across));
  return sameDepthRuns(embedded).map((run) => ({
    depth: meanDepth(run),
    layer,
    element: element("path", { d: polylinePath(run.map(([along, across]) => band.toPlane(along, across))), stroke: colour, ...attributes }),
  }));
}

export function glyph(board: Board, [along, across]: Point, draw: (spot: GlyphSpot) => SvgElement[]): Painted {
  const [twistedAlong, twistedAcross, depth] = board.twist.map(along, across);
  const spot = {
    centre: board.band.toPlane(twistedAlong, twistedAcross),
    size: board.gateSize * (1 + NEARNESS_GROWTH * depth),
    angle: board.band.route ? board.band.route.angle(twistedAlong) : 0,
  };
  return { depth: depth + GLYPH_DEPTH_NUDGE, layer: PaintLayer.glyph, element: group({}, draw(spot)) };
}

export const backToFront = (painted: readonly Painted[]): Painted[] =>
  [...painted].sort((a, b) => depthBucket(a.depth) - depthBucket(b.depth) || a.layer - b.layer || a.depth - b.depth);
