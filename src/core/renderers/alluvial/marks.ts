import type { Band } from "../../draw/band.ts";
import { normalAt } from "../../draw/geometry.ts";
import { element, group, type Point, polylinePath, type SvgElement } from "../../draw/svg.ts";
import type { Theme } from "../../draw/themes.ts";
import type { LayoutView, PlacedCommit } from "../../style/view.ts";
import type { Channels } from "./channels.ts";
import type { Courses } from "./courses.ts";
import type { Ribbon } from "./ribbons.ts";
import { type Sample, subdivide } from "./samples.ts";

const ROUTE_SAMPLE_SPACING = 6;
const ROOM_FOR_MERGE_BARS = 6;
const MERGE_BAR_HALF_THICKNESS = 0.8;
const MERGE_BAR_OVERHANG = 3;
const GAUGE_REACH_PAST_BANKS = 10;
const GAUGE_END_RADIUS = 3;
const GAUGE_DASH = 3;

const differsFromPrevious = (sample: Sample, index: number, all: readonly Sample[]): boolean =>
  index === 0 || sample[0] !== all[index - 1][0] || sample[1] !== all[index - 1][1];

function outline(samples: readonly Sample[], band: Band): string {
  const points = (band.route ? subdivide(samples, ROUTE_SAMPLE_SPACING) : samples).filter(differsFromPrevious);
  const axis = points.map(([along, across]): Point => [along, across]);
  const normals = axis.map((_, index) => normalAt(axis, index));
  const side = (sign: number): Point[] =>
    points.map(([along, across, width], index) =>
      band.toPlane(along + (sign * normals[index][0] * width) / 2, across + (sign * normals[index][1] * width) / 2),
    );
  return `${polylinePath([...side(-1), ...side(1).reverse()])} Z`;
}

export function ribbonLayer(ribbons: readonly Ribbon[], theme: Theme, channels: Channels): SvgElement {
  const widestFirst = [...ribbons].sort((wider, narrower) => narrower.size - wider.size).filter((ribbon) => ribbon.samples.length >= 2);
  return group(
    { "fill-opacity": theme.glow ? 0.5 : 0.55, "stroke-width": 1.2 * channels.unit, "stroke-opacity": 0.95, "stroke-linejoin": "round" },
    widestFirst.map((ribbon) => element("path", { d: outline(ribbon.samples, channels.band), fill: ribbon.colour, stroke: ribbon.colour })),
  );
}

function mergeBar(commit: PlacedCommit, [along, across, width]: Sample, channels: Channels): SvgElement {
  const halfThickness = MERGE_BAR_HALF_THICKNESS * channels.unit;
  const barWidth = width + MERGE_BAR_OVERHANG * channels.unit;
  const bar: Sample[] = [
    [along - halfThickness, across, barWidth],
    [along + halfThickness, across, barWidth],
  ];
  return element("path", { d: outline(bar, channels.band), fill: commit.colour, opacity: 0.9 });
}

function headGauge([along, across, width]: Sample, channels: Channels, theme: Theme): SvgElement[] {
  const { unit, band } = channels;
  const reach = width / 2 + GAUGE_REACH_PAST_BANKS * unit;
  const ends = [band.toPlane(along, across - reach), band.toPlane(along, across + reach)];
  const ink = { stroke: theme.ink, "stroke-width": 1.5 * unit, opacity: 0.85 };
  return [
    element("path", { d: polylinePath(ends), fill: "none", ...ink, "stroke-dasharray": `${GAUGE_DASH * unit} ${GAUGE_DASH * unit}` }),
    ...ends.map(([x, y]) => element("circle", { cx: x, cy: y, r: GAUGE_END_RADIUS * unit, fill: theme.background, ...ink })),
  ];
}

export function markLayer(view: LayoutView, courses: Courses, channels: Channels, theme: Theme): SvgElement {
  const showsMergeBars = channels.band.unit >= ROOM_FOR_MERGE_BARS * channels.unit;
  const inTimeOrder = view.commitsInTimeOrder;
  return group(
    {},
    inTimeOrder.flatMap((commit) => {
      const sample = courses.at(commit);
      const bar = commit.isMerge && showsMergeBars ? [mergeBar(commit, sample, channels)] : [];
      return commit.isHead ? [...bar, ...headGauge(sample, channels, theme)] : bar;
    }),
  );
}
