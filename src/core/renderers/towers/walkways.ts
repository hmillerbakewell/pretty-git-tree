import { mix } from "../../draw/colour.ts";
import { normalAt } from "../../draw/geometry.ts";
import { element, type Point, polylinePath, type SvgElement } from "../../draw/svg.ts";
import type { Theme } from "../../draw/themes.ts";
import type { PlacedEdge, PlacedLane } from "../../style/view.ts";
import { consecutivePairs } from "../../util/lists.ts";
import { clamp } from "../../util/maths.ts";
import { type Projection, TOWER_RADIUS, type Tower } from "./plan.ts";

const WALKWAY_WIDTH = 0.15;
const WALKWAY_CLEARANCE = 0.12;
const MOST_DETOURS = 8;
const DETOUR_MARGIN = 1.05;
const CORNER_ROUNDING_PASSES = 3;
const WALL_BISECTION_STEPS = 24;
const LEAST_DECK_THICKNESS = 0.05;
const DECK_THICKNESS_PER_FLOOR = 0.5;
const DECK_PALENESS = 0.15;
const UNDERSIDE_DARKNESS = 0.35;
const DECK_OUTLINE_WIDTH = 0.5;

export interface Piece {
  readonly depth: number;
  readonly elements: readonly SvgElement[];
}

interface Detour {
  readonly index: number;
  readonly point: Point;
}

const lerp = ([fromX, fromY]: Point, [toX, toY]: Point, share: number): Point => [fromX + (toX - fromX) * share, fromY + (toY - fromY) * share];

const blend = ([fromX, fromY]: Point, [toX, toY]: Point, share: number): Point => [(1 - share) * fromX + share * toX, (1 - share) * fromY + share * toY];

function detourAround([fromX, fromY]: Point, [toX, toY]: Point, [centreX, centreY]: Point): Point | undefined {
  const [dx, dy] = [toX - fromX, toY - fromY];
  const lengthSquared = dx * dx + dy * dy || 1e-9;
  const along = clamp(((centreX - fromX) * dx + (centreY - fromY) * dy) / lengthSquared, 0, 1);
  const [nearestX, nearestY] = [fromX + dx * along, fromY + dy * along];
  const distance = Math.hypot(nearestX - centreX, nearestY - centreY);
  const keep = TOWER_RADIUS + WALKWAY_CLEARANCE + WALKWAY_WIDTH / 2;
  if (distance >= keep || along <= 0 || along >= 1) return undefined;
  const length = Math.sqrt(lengthSquared);
  const [awayX, awayY] = distance > 1e-6 ? [(nearestX - centreX) / distance, (nearestY - centreY) / distance] : [-dy / length, dx / length];
  return [centreX + awayX * keep * DETOUR_MARGIN, centreY + awayY * keep * DETOUR_MARGIN];
}

function firstDetour(points: readonly Point[], obstacles: readonly Point[]): Detour | undefined {
  for (const [index, [from, to]] of consecutivePairs(points).entries()) {
    for (const obstacle of obstacles) {
      const point = detourAround(from, to, obstacle);
      if (point) return { index: index + 1, point };
    }
  }
  return undefined;
}

function roundCorners(points: readonly Point[]): Point[] {
  const first = points[0];
  const last = points.at(-1);
  if (!first || !last) return [...points];
  const inner = consecutivePairs(points).flatMap(([from, to], index) => [
    ...(index > 0 ? [blend(from, to, 0.25)] : []),
    ...(index < points.length - 2 ? [blend(from, to, 0.75)] : []),
  ]);
  return [first, ...inner, last];
}

function walkwayRoute(from: Point, to: Point, obstacles: readonly Point[]): Point[] {
  let points: Point[] = [from, to];
  for (let pass = 0; pass < MOST_DETOURS; pass++) {
    const detour = firstDetour(points, obstacles);
    if (!detour) break;
    points = [...points.slice(0, detour.index), detour.point, ...points.slice(detour.index)];
  }
  for (let pass = 0; pass < CORNER_ROUNDING_PASSES; pass++) points = roundCorners(points);
  return points;
}

const isOutside = ([x, y]: Point, [centreX, centreY]: Point) => Math.hypot(x - centreX, y - centreY) >= TOWER_RADIUS;

function wallCrossing(inside: Point, outside: Point, centre: Point): Point {
  let [insideShare, outsideShare] = [0, 1];
  for (let step = 0; step < WALL_BISECTION_STEPS; step++) {
    const middle = (insideShare + outsideShare) / 2;
    if (isOutside(lerp(inside, outside, middle), centre)) outsideShare = middle;
    else insideShare = middle;
  }
  return lerp(inside, outside, outsideShare);
}

function outsideWalls(points: readonly Point[], start: Point, end: Point): Point[] {
  let first = 0;
  while (first < points.length - 1 && !isOutside(points[first + 1], start)) first++;
  let last = points.length - 1;
  while (last > 0 && !isOutside(points[last - 1], end)) last--;
  if (last <= first) return [];
  return [wallCrossing(points[first], points[first + 1], start), ...points.slice(first + 1, last), wallCrossing(points[last], points[last - 1], end)];
}

function deckPieces(path: readonly Point[], colour: string, elevation: number, thickness: number, projection: Projection): Piece[] {
  const halfNormal = (index: number): Point => {
    const [normalX, normalY] = normalAt(path, index);
    return [normalX * (WALKWAY_WIDTH / 2), normalY * (WALKWAY_WIDTH / 2)];
  };
  const underside = mix(colour, "#000000", UNDERSIDE_DARKNESS);
  return consecutivePairs(path).map(([from, to], index) => {
    const [fromNormal, toNormal] = [halfNormal(index), halfNormal(index + 1)];
    const quad = (z: number): Point[] => [
      projection.screen(from[0] + fromNormal[0], from[1] + fromNormal[1], z),
      projection.screen(to[0] + toNormal[0], to[1] + toNormal[1], z),
      projection.screen(to[0] - toNormal[0], to[1] - toNormal[1], z),
      projection.screen(from[0] - fromNormal[0], from[1] - fromNormal[1], z),
    ];
    return {
      depth: (from[1] + to[1]) / 2,
      elements: [
        element("path", { d: `${polylinePath(quad(elevation - thickness))} Z`, fill: underside, stroke: underside, "stroke-width": DECK_OUTLINE_WIDTH }),
        element("path", { d: `${polylinePath(quad(elevation))} Z`, fill: colour, stroke: colour, "stroke-width": DECK_OUTLINE_WIDTH }),
      ],
    };
  });
}

export interface WalkwayScene {
  readonly towers: readonly Tower[];
  readonly towerOfLane: ReadonlyMap<PlacedLane, Tower>;
  readonly projection: Projection;
  readonly theme: Theme;
  readonly floorHeight: number;
}

export function walkwayPieces(scene: WalkwayScene, edge: PlacedEdge): Piece[] {
  if (!edge.parent || edge.kind === "line") return [];
  const from = scene.towerOfLane.get(edge.parent.lane);
  const to = scene.towerOfLane.get(edge.child.lane);
  if (!from || !to || from.lane.slot === to.lane.slot) return [];
  const when = (edge.kind === "fork" ? edge.parent : edge.child).timeFraction;
  const standing = scene.towers.filter((tower) => tower !== from && tower !== to && tower.bottom <= when && when <= tower.top).map((tower) => tower.site);
  const path = outsideWalls(walkwayRoute(from.site, to.site, standing), from.site, to.site);
  if (path.length < 2) return [];
  const colour = mix((edge.kind === "merge" ? from : to).lane.colour, scene.theme.background, DECK_PALENESS);
  const thickness = Math.max(scene.projection.elevation(scene.floorHeight) * DECK_THICKNESS_PER_FLOOR, LEAST_DECK_THICKNESS);
  return deckPieces(path, colour, scene.projection.elevation(when), thickness, scene.projection);
}
