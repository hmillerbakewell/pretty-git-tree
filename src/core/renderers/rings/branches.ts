import { glowFilter } from "../../draw/marks.ts";
import { element, group, type Point, polylinePath, type SvgElement } from "../../draw/svg.ts";
import type { LayoutView, PlacedCommit, PlacedEdge, PlacedLane } from "../../style/view.ts";
import { PITH_REACH } from "./growth.ts";
import { branchStart, type Section } from "./section.ts";

const WEDGE_HALF_WIDTH_SHARE_OF_SLOT = 0.36;
const WIDEST_WEDGE_HALF_WIDTH = 0.13;
const PIXELS_PER_RADIAL_SAMPLE = 20;
const PIXELS_PER_ARC_SAMPLE = 6;

interface Sector {
  readonly wedge: SvgElement[];
  readonly threads: SvgElement[];
}

function radialLine(section: Section, angle: number, fromReach: number, toReach: number): Point[] {
  const { disc, unit } = section;
  const steps = Math.max(2, Math.ceil(((toReach - fromReach) * disc.radius) / (PIXELS_PER_RADIAL_SAMPLE * unit)));
  return Array.from({ length: steps + 1 }, (_, step) => disc.pointAt(fromReach + ((toReach - fromReach) * step) / steps, angle));
}

function alongRing(section: Section, reach: number, fromSlot: number, toSlot: number): Point[] {
  const { disc, sectors, unit } = section;
  const steps = Math.max(3, Math.ceil((Math.abs(toSlot - fromSlot) * sectors.angleBetweenSlots * reach * disc.radius) / (PIXELS_PER_ARC_SAMPLE * unit)));
  return Array.from({ length: steps + 1 }, (_, step) => disc.pointAt(reach, sectors.angleOf(fromSlot + ((toSlot - fromSlot) * step) / steps)));
}

function laneSector(section: Section, lane: PlacedLane, isTrunk: boolean): Sector {
  const { growth, sectors, unit, theme } = section;
  const angle = sectors.angleOf(lane.slot);
  const startReach = isTrunk ? PITH_REACH : growth.reachAt(branchStart(lane));
  const tip = lane.commits[lane.commits.length - 1];
  const lastActivity = tip ? Math.max(tip.timeFraction, ...tip.childrenInRange.map((child) => child.timeFraction)) : 0;
  const liveReach = Math.max(startReach, growth.reachAt(lastActivity));
  const endReach = lane.continuesAfterRange ? 1 : liveReach;
  const halfWidth = Math.min(sectors.angleBetweenSlots * WEDGE_HALF_WIDTH_SHARE_OF_SLOT, WIDEST_WEDGE_HALF_WIDTH);
  const side = (offset: number) => radialLine(section, angle + offset, startReach, liveReach);
  const wedge =
    liveReach > startReach
      ? [
          element("path", {
            d: `${polylinePath([...side(-halfWidth), ...side(halfWidth).reverse()])} Z`,
            fill: lane.colour,
            "fill-opacity": theme.glow ? 0.08 : 0.07,
          }),
        ]
      : [];
  const solid = element("path", { d: polylinePath(radialLine(section, angle, startReach, liveReach)), stroke: lane.colour, "stroke-width": 1.4 * unit });
  const toBark = element("path", {
    d: polylinePath(radialLine(section, angle, liveReach, endReach)),
    stroke: lane.colour,
    "stroke-width": 0.9 * unit,
    "stroke-opacity": 0.4,
    "stroke-dasharray": `${(3 * unit).toFixed(2)} ${(4 * unit).toFixed(2)}`,
  });
  return { wedge, threads: endReach > liveReach ? [solid, toBark] : [solid] };
}

function laneChange(section: Section, edge: PlacedEdge): SvgElement[] {
  const { parent, child, kind } = edge;
  if (!parent || kind === "line" || parent.slot === child.slot) return [];
  const isFork = kind === "fork";
  const reach = section.growth.reachAt(isFork ? parent.timeFraction : child.timeFraction);
  return [
    element("path", {
      d: polylinePath(alongRing(section, reach, parent.slot, child.slot)),
      stroke: isFork ? child.colour : parent.colour,
      "stroke-width": 1.4 * section.unit,
      "stroke-opacity": 0.85,
    }),
  ];
}

export function branchSectors(section: Section, view: LayoutView): SvgElement[] {
  const sectors = view.lanes.map((lane, laneIndex) => laneSector(section, lane, laneIndex === 0));
  return [
    group(
      {},
      sectors.flatMap((sector) => sector.wedge),
    ),
    group({ fill: "none", "stroke-linecap": "round", "stroke-linejoin": "round", ...glowFilter(section.theme) }, [
      ...sectors.flatMap((sector) => sector.threads),
      ...view.edges.flatMap((edge) => laneChange(section, edge)),
    ]),
  ];
}

function pore(section: Section, commit: PlacedCommit): SvgElement {
  const { disc, growth, sectors, unit, theme } = section;
  const [x, y] = disc.pointAt(growth.reachAt(commit.timeFraction), sectors.angleOf(commit.slot));
  const radius = unit * 1.5 * (1 + 0.25 * Math.log2(commit.weight));
  return commit.isMerge
    ? element("circle", { cx: x, cy: y, r: radius * 1.4, fill: commit.colour })
    : element("circle", { cx: x, cy: y, r: radius, fill: theme.background, stroke: commit.colour, "stroke-width": Math.max(0.7 * unit, radius * 0.5) });
}

export const pores = (section: Section, commitsInTimeOrder: readonly PlacedCommit[]): SvgElement =>
  group(
    {},
    commitsInTimeOrder.map((commit) => pore(section, commit)),
  );
