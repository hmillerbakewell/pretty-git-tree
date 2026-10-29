import type { Point } from "./svg.ts";

export function densify(points: Point[], step: number): Point[] {
  const densified: Point[] = [points[0]];
  for (let index = 1; index < points.length; index++) {
    const [fromX, fromY] = points[index - 1];
    const [toX, toY] = points[index];
    const pieces = Math.max(1, Math.ceil(Math.hypot(toX - fromX, toY - fromY) / step));
    for (let piece = 1; piece <= pieces; piece++) densified.push([fromX + ((toX - fromX) * piece) / pieces, fromY + ((toY - fromY) * piece) / pieces]);
  }
  return densified;
}

export function normalAt(points: readonly Point[], index: number): Point {
  const [beforeX, beforeY] = points[Math.max(0, index - 1)];
  const [afterX, afterY] = points[Math.min(points.length - 1, index + 1)];
  const chord = Math.hypot(afterX - beforeX, afterY - beforeY) || 1;
  return [-(afterY - beforeY) / chord, (afterX - beforeX) / chord];
}

function trimStart(points: Point[], distance: number): Point[] | null {
  let remaining = distance;
  for (let index = 0; index < points.length - 1; index++) {
    const [fromX, fromY] = points[index];
    const [toX, toY] = points[index + 1];
    const segment = Math.hypot(toX - fromX, toY - fromY);
    if (segment > remaining) {
      const fraction = remaining / segment;
      return [[fromX + (toX - fromX) * fraction, fromY + (toY - fromY) * fraction], ...points.slice(index + 1)];
    }
    remaining -= segment;
  }
  return null;
}

export function trim(points: Point[], distance: number): Point[] | null {
  const withoutStart = trimStart(points, distance);
  if (!withoutStart) return null;
  const reversedWithoutEither = trimStart([...withoutStart].reverse(), distance);
  return reversedWithoutEither ? reversedWithoutEither.reverse() : null;
}
