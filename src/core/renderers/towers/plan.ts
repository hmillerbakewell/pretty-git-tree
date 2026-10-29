import type { Frame } from "../../draw/frame.ts";
import type { Point } from "../../draw/svg.ts";
import type { LayoutView, PlacedLane } from "../../style/view.ts";

export const TOWER_RADIUS = 0.3;
export const GROUND_TILT = 0.42;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const SPIRAL_SPACING = 1.05;
const WIDEST_SPIRAL_STRETCH = 2.2;
const PLAN_MARGIN = 0.3;
const LEAST_HEIGHT_PER_PLAN_WIDTH = 0.3;
const LEAST_HEIGHT = 2;
const ROOF_ABOVE_LAST_FLOOR = 0.5;

export interface Tower {
  readonly lane: PlacedLane;
  readonly site: Point;
  readonly bottom: number;
  readonly top: number;
}

export interface Projection {
  readonly scale: number;
  readonly towerRadius: number;
  readonly elevation: (time: number) => number;
  readonly screen: (x: number, y: number, z: number) => Point;
  readonly ground: { readonly centre: Point; readonly radiusX: number; readonly radiusY: number };
}

interface PlanBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
}

const spiralIndex = (slot: number): number => (slot === 0 ? 0 : slot > 0 ? 2 * slot - 1 : -2 * slot);

function spiralSite(slot: number, stretch: number): Point {
  const index = spiralIndex(slot);
  const distance = Math.sqrt(index) * SPIRAL_SPACING;
  return [distance * Math.cos(index * GOLDEN_ANGLE) * Math.sqrt(stretch), (distance * Math.sin(index * GOLDEN_ANGLE)) / Math.sqrt(stretch)];
}

function laneEnd(lane: PlacedLane, view: LayoutView, tipTime: number): number {
  const tip = lane.commits.at(-1);
  if (lane.continuesAfterRange || !tip) return tipTime;
  const childTimes = view.commits.filter((commit) => commit.parentsInRange.includes(tip)).map((commit) => commit.timeFraction);
  return Math.max(tipTime, ...childTimes);
}

function towerOf(lane: PlacedLane, view: LayoutView, stretch: number, floorHeight: number): Tower | undefined {
  const first = lane.commits[0];
  const tip = lane.commits.at(-1);
  if (!first || !tip) return undefined;
  const bottom = first.firstParentInRange?.timeFraction ?? (lane.entersFromBeforeRange ? 0 : first.timeFraction);
  const top = Math.max(laneEnd(lane, view, tip.timeFraction), bottom + floorHeight) + floorHeight * ROOF_ABOVE_LAST_FLOOR;
  return { lane, site: spiralSite(lane.slot, stretch), bottom, top };
}

export function towersOf(view: LayoutView, frame: Frame, floorHeight: number): Tower[] {
  const [left, top, right, bottom] = frame.plot;
  const stretch = Math.min(Math.max((right - left) / (bottom - top), 1), WIDEST_SPIRAL_STRETCH);
  return view.lanes.flatMap((lane) => towerOf(lane, view, stretch, floorHeight) ?? []);
}

function planBounds(towers: readonly Tower[]): PlanBounds {
  const reach = TOWER_RADIUS + PLAN_MARGIN;
  const xs = towers.map(({ site: [x] }) => x);
  const ys = towers.map(({ site: [, y] }) => y);
  return { minX: Math.min(...xs) - reach, maxX: Math.max(...xs) + reach, minY: Math.min(...ys) - reach, maxY: Math.max(...ys) + reach };
}

export function projectionOf(towers: readonly Tower[], frame: Frame): Projection {
  const { minX, maxX, minY, maxY } = planBounds(towers);
  const [left, top, right, bottom] = frame.plot;
  const [plotWidth, plotHeight] = [right - left, bottom - top];
  const planWidth = maxX - minX;
  const planDepth = (maxY - minY) * GROUND_TILT;
  const tallest = Math.max(planWidth * LEAST_HEIGHT_PER_PLAN_WIDTH, (plotHeight / plotWidth) * planWidth - planDepth, LEAST_HEIGHT);
  const scale = Math.min(plotWidth / planWidth, plotHeight / (planDepth + tallest));
  const originY = top + (plotHeight - (planDepth + tallest) * scale) / 2 + tallest * scale - minY * GROUND_TILT * scale;
  const originX = (left + right) / 2 - ((minX + maxX) / 2) * scale;
  const screen = (x: number, y: number, z: number): Point => [originX + x * scale, originY + (y * GROUND_TILT - z) * scale];
  return {
    scale,
    towerRadius: TOWER_RADIUS * scale,
    elevation: (time) => time * tallest,
    screen,
    ground: {
      centre: screen((minX + maxX) / 2, (minY + maxY) / 2, 0),
      radiusX: (planWidth / 2) * scale,
      radiusY: ((maxY - minY) / 2) * GROUND_TILT * scale,
    },
  };
}
