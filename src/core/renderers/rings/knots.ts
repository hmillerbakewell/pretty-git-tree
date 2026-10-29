import { element, group, type Point, type SvgElement } from "../../draw/svg.ts";
import type { LayoutView, PlacedLane } from "../../style/view.ts";
import { clamp } from "../../util/maths.ts";
import type { Growth } from "./growth.ts";
import { branchStart, type Disc, knotDark, outwardAngle, type Section, type Sectors, woodTone } from "./section.ts";

const KNOT_GAP_SHARE_OF_SECTOR = 0.45;
const GRAIN_PUSH_REACH_IN_RADII = 1.3;
const GRAIN_PUSH_CUTOFF_IN_REACHES = 4;
const GRAIN_PUSH_FALLOFF = 0.7;
const KNOT_ELONGATION = 1.3;
const SMALLEST_KNOT_WITH_HEART = 3.5;

export interface Knot {
  readonly centre: Point;
  readonly radius: number;
  readonly tilt: number;
  readonly colour: string;
}

function branchKnot(lane: PlacedLane, disc: Disc, growth: Growth, sectors: Sectors, unit: number): Knot {
  const reach = growth.reachAt(branchStart(lane));
  const angle = sectors.angleOf(lane.slot);
  const commitCount = lane.commits.reduce((sum, commit) => sum + commit.weight, 0);
  const gap = Math.max(reach * disc.radius * sectors.angleBetweenSlots * KNOT_GAP_SHARE_OF_SECTOR, 1.5 * unit);
  return {
    centre: disc.pointAt(reach, angle),
    radius: Math.min(unit * clamp(2.2 + 1.4 * Math.log2(1 + commitCount), 2.5, 11), gap),
    tilt: outwardAngle(disc, reach, angle),
    colour: lane.colour,
  };
}

export const branchKnots = (view: LayoutView, disc: Disc, growth: Growth, sectors: Sectors, unit: number): Knot[] =>
  view.lanes.slice(1).map((lane) => branchKnot(lane, disc, growth, sectors, unit));

function pushAwayFrom(knot: Knot, [x, y]: Point): Point {
  const pushReach = knot.radius * GRAIN_PUSH_REACH_IN_RADII;
  const [knotX, knotY] = knot.centre;
  let [offsetX, offsetY] = [x - knotX, y - knotY];
  if (Math.abs(offsetX) > GRAIN_PUSH_CUTOFF_IN_REACHES * pushReach || Math.abs(offsetY) > GRAIN_PUSH_CUTOFF_IN_REACHES * pushReach) return [x, y];
  let distance = Math.hypot(offsetX, offsetY);
  if (distance < 1e-6) [offsetX, offsetY, distance] = [Math.cos(knot.tilt), Math.sin(knot.tilt), 1];
  const pushedDistance = distance + pushReach * Math.exp(-GRAIN_PUSH_FALLOFF * (distance / pushReach) ** 2);
  return [knotX + (offsetX / distance) * pushedDistance, knotY + (offsetY / distance) * pushedDistance];
}

export const grainFlow =
  (knots: readonly Knot[]) =>
  (point: Point): Point =>
    knots.reduce((flowed, knot) => pushAwayFrom(knot, flowed), point);

function knotScar(knot: Knot, section: Section): SvgElement[] {
  const { unit, theme } = section;
  const [x, y] = knot.centre;
  const transform = `rotate(${((knot.tilt * 180) / Math.PI).toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)})`;
  const scar = element("ellipse", {
    cx: x,
    cy: y,
    rx: knot.radius * KNOT_ELONGATION,
    ry: knot.radius,
    transform,
    fill: knotDark(theme),
    stroke: woodTone(theme, theme.glow ? 0.6 : 0.85),
    "stroke-width": Math.max(0.6 * unit, knot.radius * 0.18),
  });
  if (knot.radius <= SMALLEST_KNOT_WITH_HEART * unit) return [scar];
  const heart = element("ellipse", {
    cx: x,
    cy: y,
    rx: knot.radius * 0.7,
    ry: knot.radius * 0.5,
    transform,
    fill: "none",
    stroke: knot.colour,
    "stroke-width": 0.7 * unit,
    "stroke-opacity": 0.8,
  });
  return [scar, heart];
}

export const knotScars = (knots: readonly Knot[], section: Section): SvgElement =>
  group(
    {},
    knots.flatMap((knot) => knotScar(knot, section)),
  );
