import type { Point } from "./svg.ts";

type Vector = Point;

const NEAR_SHARE = 0.75;
const FAR_SHARE = 0.25;

const plus = ([x, y]: Vector, [dx, dy]: Vector): Vector => [x + dx, y + dy];
const minus = ([x, y]: Vector, [dx, dy]: Vector): Vector => [x - dx, y - dy];
const negate = ([x, y]: Vector): Vector => [-x, -y];
const direction = ([x, y]: Vector): Vector => [Math.sign(x), Math.sign(y)];
const halve = ([x, y]: Vector): Vector => [Math.floor(x / 2), Math.floor(y / 2)];
const cellsAlong = ([x, y]: Vector): number => Math.abs(x + y);

function* straightRun([x, y]: Point, count: number, [stepX, stepY]: Vector): Generator<Point> {
  for (let step = 0; step < count; step++) yield [x + step * stepX, y + step * stepY];
}

function* splitAlongTheLongSide(origin: Point, along: Vector, across: Vector, alongCells: number): Generator<Point> {
  let firstHalf = halve(along);
  if (cellsAlong(firstHalf) % 2 && alongCells > 2) firstHalf = plus(firstHalf, direction(along));
  yield* cellsInOrder(origin, firstHalf, across);
  yield* cellsInOrder(plus(origin, firstHalf), minus(along, firstHalf), across);
}

function* splitIntoUpOverAndBack(origin: Point, along: Vector, across: Vector, acrossCells: number): Generator<Point> {
  const halfAlong = halve(along);
  let halfAcross = halve(across);
  if (cellsAlong(halfAcross) % 2 && acrossCells > 2) halfAcross = plus(halfAcross, direction(across));
  yield* cellsInOrder(origin, halfAcross, halfAlong);
  yield* cellsInOrder(plus(origin, halfAcross), along, minus(across, halfAcross));
  const backStart = plus(plus(origin, minus(along, direction(along))), minus(halfAcross, direction(across)));
  yield* cellsInOrder(backStart, negate(halfAcross), negate(minus(along, halfAlong)));
}

function* cellsInOrder(origin: Point, along: Vector, across: Vector): Generator<Point> {
  const alongCells = cellsAlong(along);
  const acrossCells = cellsAlong(across);
  if (acrossCells === 1) yield* straightRun(origin, alongCells, direction(along));
  else if (alongCells === 1) yield* straightRun(origin, acrossCells, direction(across));
  else if (2 * alongCells > 3 * acrossCells) yield* splitAlongTheLongSide(origin, along, across, alongCells);
  else yield* splitIntoUpOverAndBack(origin, along, across, acrossCells);
}

export const generalisedHilbertCells = (x: number, y: number, alongX: number, alongY: number, acrossX: number, acrossY: number): Generator<Point> =>
  cellsInOrder([x, y], [alongX, alongY], [acrossX, acrossY]);

function cutCornersOnce(points: Point[]): Point[] {
  const cut: Point[] = [points[0]];
  for (let index = 0; index < points.length - 1; index++) {
    const [from, to] = [points[index], points[index + 1]];
    cut.push(
      [from[0] * NEAR_SHARE + to[0] * FAR_SHARE, from[1] * NEAR_SHARE + to[1] * FAR_SHARE],
      [from[0] * FAR_SHARE + to[0] * NEAR_SHARE, from[1] * FAR_SHARE + to[1] * NEAR_SHARE],
    );
  }
  cut.push(points[points.length - 1]);
  return cut;
}

export function roundCorners(points: Point[], rounds: number): Point[] {
  let rounded = points;
  for (let round = 0; round < rounds; round++) rounded = cutCornersOnce(rounded);
  return rounded;
}
