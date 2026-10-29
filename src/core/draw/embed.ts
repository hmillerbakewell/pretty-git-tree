import { clamp } from "../util/maths.ts";
import { normalAt } from "./geometry.ts";
import { generalisedHilbertCells, roundCorners } from "./hilbert.ts";
import type { Point } from "./svg.ts";

const SMALLEST_HALF_WIDTH = 1e-6;

const easeInOutCosine = (progress: number) => (1 - Math.cos(Math.PI * progress)) / 2;

export class Twist {
  readonly windows: readonly [number, number][];
  readonly axis: number;
  readonly halfWidth: number;

  constructor(windows: [number, number][], axis: number, halfWidth: number) {
    this.windows = [...windows].sort((a, b) => a[0] - b[0]);
    this.axis = axis;
    this.halfWidth = Math.max(halfWidth, SMALLEST_HALF_WIDTH);
  }

  private rotationAt(along: number): number {
    let halfTurns = 0;
    for (const [start, end] of this.windows) {
      if (along >= end) halfTurns += 1;
      else if (along > start) halfTurns += easeInOutCosine((along - start) / (end - start));
    }
    return Math.PI * halfTurns;
  }

  map(along: number, across: number): [along: number, across: number, depthNearerViewerIsPositive: number] {
    const rotation = this.rotationAt(along);
    const offAxis = across - this.axis;
    return [along, this.axis + offAxis * Math.cos(rotation), (offAxis * Math.sin(rotation)) / this.halfWidth];
  }

  private twistsBetween(fromAlong: number, toAlong: number): boolean {
    const earlier = Math.min(fromAlong, toAlong);
    const later = Math.max(fromAlong, toAlong);
    return this.windows.some(([start, end]) => start < later && earlier < end);
  }

  densify(points: Point[], step: number, always = false): Point[] {
    const densified: Point[] = [points[0]];
    for (let index = 1; index < points.length; index++) {
      const [fromAlong, fromAcross] = points[index - 1];
      const [toAlong, toAcross] = points[index];
      if (!always && !this.twistsBetween(fromAlong, toAlong)) {
        densified.push([toAlong, toAcross]);
        continue;
      }
      const pieces = Math.max(1, Math.ceil(Math.abs(toAlong - fromAlong) / step));
      for (let piece = 1; piece <= pieces; piece++) {
        densified.push([fromAlong + ((toAlong - fromAlong) * piece) / pieces, fromAcross + ((toAcross - fromAcross) * piece) / pieces]);
      }
    }
    return densified;
  }
}

function cumulativeLengths(points: Point[]): number[] {
  const lengths = [0];
  for (let index = 1; index < points.length; index++) {
    lengths.push(lengths[index - 1] + Math.hypot(points[index][0] - points[index - 1][0], points[index][1] - points[index - 1][1]));
  }
  return lengths;
}

function bracketingVertices(cumulative: number[], distance: number): [before: number, after: number] {
  let before = 0;
  let after = cumulative.length - 1;
  while (after - before > 1) {
    const middle = (before + after) >> 1;
    if (cumulative[middle] <= distance) before = middle;
    else after = middle;
  }
  return [before, after];
}

export class Route {
  readonly length: number;
  private readonly points: Point[];
  private readonly cumulative: number[];
  private readonly unitTangentsSoOffsetsBendSmoothly: Point[];

  constructor(points: Point[]) {
    this.points = points;
    this.cumulative = cumulativeLengths(points);
    this.length = this.cumulative[this.cumulative.length - 1];
    this.unitTangentsSoOffsetsBendSmoothly = points.map((_, index) => {
      const [normalX, normalY] = normalAt(points, index);
      return [normalY, -normalX];
    });
  }

  at(distance: number): { x: number; y: number; tangentX: number; tangentY: number } {
    const { points, cumulative } = this;
    const clamped = clamp(distance, 0, this.length);
    const [before, after] = bracketingVertices(cumulative, clamped);
    const segment = cumulative[after] - cumulative[before] || 1;
    const fraction = (clamped - cumulative[before]) / segment;
    const [fromX, fromY] = points[before];
    const [toX, toY] = points[after];
    const tangents = this.unitTangentsSoOffsetsBendSmoothly;
    const tangentX = tangents[before][0] * (1 - fraction) + tangents[after][0] * fraction;
    const tangentY = tangents[before][1] * (1 - fraction) + tangents[after][1] * fraction;
    const norm = Math.hypot(tangentX, tangentY) || 1;
    return { x: fromX + (toX - fromX) * fraction, y: fromY + (toY - fromY) * fraction, tangentX: tangentX / norm, tangentY: tangentY / norm };
  }

  point(distance: number, offsetToTheLeft: number): Point {
    const { x, y, tangentX: tx, tangentY: ty } = this.at(distance);
    return [x - ty * offsetToTheLeft, y + tx * offsetToTheLeft];
  }

  angle(distance: number): number {
    const { tangentX: tx, tangentY: ty } = this.at(distance);
    return (Math.atan2(ty, tx) * 180) / Math.PI;
  }
}

const CORNER_ROUNDING_ROUNDS = 4;
const CELL_CENTRE = 0.5;

export function hilbertRoute(rect: [number, number, number, number], cols: number, rows: number): Route {
  const [left, top, right, bottom] = rect;
  const [cellWidth, cellHeight] = [(right - left) / cols, (bottom - top) / rows];
  const cells = cols >= rows ? generalisedHilbertCells(0, 0, cols, 0, 0, rows) : generalisedHilbertCells(0, 0, 0, rows, cols, 0);
  const centres: Point[] = [...cells].map(([column, row]) => [left + (column + CELL_CENTRE) * cellWidth, top + (row + CELL_CENTRE) * cellHeight]);
  return new Route(centres.length > 2 ? roundCorners(centres, CORNER_ROUNDING_ROUNDS) : centres);
}
