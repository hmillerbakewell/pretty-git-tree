import type { Band } from "../../draw/band.ts";
import { normalAt } from "../../draw/geometry.ts";
import type { Point } from "../../draw/svg.ts";
import type { End, Surface } from "./surface.ts";

export const PAPER_ID = "paper";
export const PAPER = `url(#${PAPER_ID})`;
const DRIFT_MEMORY = 0.8;
const DRIFT_KICK_SHARE = 0.6;
const WOBBLE_SAMPLE_STEP = 7;

export interface Sketch {
  readonly band: Band;
  readonly surface: Surface;
  readonly unit: number;
  readonly ink: string;
  readonly halfDiskHeight: number;
  readonly ribbonWidth: number;
  readonly penWidth: number;
  readonly fineWidth: number;
  readonly wobbleAmplitude: number;
  readonly diskExtents: readonly (readonly [start: number, end: number])[];
  readonly nextRandom: () => number;
}

export const endAlong = (sketch: Pick<Sketch, "band" | "ribbonWidth">, end: End): number =>
  sketch.band.alongAt(end.timeFraction) + end.order * sketch.ribbonWidth * 1.3;

export const diskCentreAcross = (sketch: Sketch, disk: number): number => sketch.band.acrossAt(sketch.surface.disks[disk].slot);

export const edgeAcross = (sketch: Sketch, end: End): number =>
  diskCentreAcross(sketch, end.disk) + (end.onHighEdge ? sketch.halfDiskHeight : -sketch.halfDiskHeight);

export const onPage = (band: Band, bandPoints: readonly Point[]): Point[] => bandPoints.map(([along, across]) => band.toPlane(along, across));

export function wobble(points: readonly Point[], amplitude: number, nextRandom: () => number): Point[] {
  let drift = (nextRandom() - 0.5) * amplitude;
  return points.map(([x, y], index): Point => {
    const [normalX, normalY] = normalAt(points, index);
    const moved: Point = [x + normalX * drift, y + normalY * drift];
    const [beforeX, beforeY] = points[Math.max(0, index - 1)];
    const [afterX, afterY] = points[Math.min(points.length - 1, index + 1)];
    const chord = Math.hypot(afterX - beforeX, afterY - beforeY) || 1;
    drift = DRIFT_MEMORY * drift + (nextRandom() - 0.5) * amplitude * DRIFT_KICK_SHARE * Math.min(1, chord / (2 * WOBBLE_SAMPLE_STEP));
    return moved;
  });
}
