import type { Frame } from "../draw/frame.ts";
import { glowFilter, headRing } from "../draw/marks.ts";
import { element, formatNumber, group, type Point, polylinePath, type SvgElement } from "../draw/svg.ts";
import type { Theme } from "../draw/themes.ts";
import { defineStyle } from "../style/renderer.ts";
import type { LayoutView, PlacedLane } from "../style/view.ts";
import { clamp } from "../util/maths.ts";

const HEIGHT_GROWTH_WITH_HALF_SPAN = 0.6;
const SAMPLES_PER_ARCH = 48;
const PADDING = 24;
const OPEN_END_OVERHANG_SHARE = 0.015;
const NARROWEST_ARCH = 1;
const TALLEST_HEIGHT_PER_SPAN = 1.5;
const BEAD_RADIUS_PER_SPACING = 0.35;

interface Axes {
  readonly vertical: boolean;
  readonly padding: number;
  readonly alongStart: number;
  readonly alongLength: number;
  readonly acrossStart: number;
  readonly acrossEnd: number;
}

interface Arch {
  readonly lane: PlacedLane;
  readonly from: number;
  readonly to: number;
  readonly mergedBack: boolean;
  readonly naturalHeight: number;
  readonly commitCount: number;
}

interface SizedArch extends Arch {
  readonly height: number;
}

interface Arrangement {
  readonly arches: readonly SizedArch[];
  readonly point: (along: number, across: number) => Point;
}

function axesOf(frame: Frame): Axes {
  const [left, top, right, bottom] = frame.plot;
  const padding = PADDING * frame.unit;
  const [alongLow, alongHigh] = frame.vertical ? [top, bottom] : [left, right];
  const [acrossStart, acrossEnd] = frame.vertical ? [left, right] : [top, bottom];
  return { vertical: frame.vertical, padding, alongStart: alongLow + padding, alongLength: alongHigh - alongLow - 2 * padding, acrossStart, acrossEnd };
}

const alongAt = (axes: Axes, time: number): number => axes.alongStart + time * axes.alongLength;

function archOf(lane: PlacedLane, axes: Axes): Arch | undefined {
  const first = lane.commits[0];
  const last = lane.commits.at(-1);
  if (!first || !last) return undefined;
  const overhang = axes.alongLength * OPEN_END_OVERHANG_SHARE;
  const forkTime = first.firstParentInRange?.timeFraction ?? first.timeFraction;
  const lastMergeTime = Math.max(last.timeFraction, ...last.childrenInRange.map((child) => child.timeFraction));
  const from = lane.entersFromBeforeRange ? Math.max(alongAt(axes, 0), alongAt(axes, first.runStartTimeFraction) - overhang) : alongAt(axes, forkTime);
  const to = lane.continuesAfterRange ? Math.min(alongAt(axes, 1), alongAt(axes, last.timeFraction) + overhang) : alongAt(axes, lastMergeTime);
  if (to - from < NARROWEST_ARCH) return undefined;
  const commitCount = lane.commits.reduce((total, commit) => total + commit.weight, 0);
  const naturalHeight = ((to - from) / 2) ** HEIGHT_GROWTH_WITH_HALF_SPAN;
  return { lane, from, to, mergedBack: !lane.continuesAfterRange, naturalHeight, commitCount };
}

const tallest = (heights: readonly number[]): number => Math.max(0, ...heights);

function arrange(arches: readonly Arch[], axes: Axes): Arrangement {
  const room = axes.acrossEnd - axes.acrossStart - 2 * axes.padding;
  const upward = tallest(arches.filter((arch) => arch.mergedBack).map((arch) => arch.naturalHeight));
  const downward = tallest(arches.filter((arch) => !arch.mergedBack).map((arch) => arch.naturalHeight));
  const scale = upward + downward > 0 ? room / (upward + downward) : 0;
  const sized = arches.map((arch) => ({
    ...arch,
    height: Math.min(arch.naturalHeight * scale, (arch.to - arch.from) * TALLEST_HEIGHT_PER_SPAN) * (arch.mergedBack ? 1 : -1),
  }));
  const drawnUp = tallest(sized.map((arch) => arch.height));
  const drawnDown = tallest(sized.map((arch) => -arch.height));
  const baseline = axes.padding + (room - drawnUp - drawnDown) / 2 + drawnDown;
  const point = (along: number, across: number): Point =>
    axes.vertical ? [axes.acrossStart + baseline + across, along] : [along, axes.acrossEnd - baseline - across];
  return { arches: sized, point };
}

function archCurve(arch: SizedArch, point: Arrangement["point"]): Point[] {
  const middle = (arch.from + arch.to) / 2;
  const halfSpan = (arch.to - arch.from) / 2;
  return Array.from({ length: SAMPLES_PER_ARCH + 1 }, (_, step) => {
    const angle = Math.PI * (1 - step / SAMPLES_PER_ARCH);
    return point(middle + halfSpan * Math.cos(angle), arch.height * Math.sin(angle));
  });
}

function liftAt(arch: SizedArch, along: number): number {
  const middle = (arch.from + arch.to) / 2;
  const halfSpan = (arch.to - arch.from) / 2;
  return arch.height * Math.sqrt(Math.max(0, 1 - ((along - middle) / halfSpan) ** 2));
}

const veil = (arch: SizedArch, d: string, theme: Theme, unit: number): SvgElement =>
  element("path", {
    d,
    stroke: arch.lane.colour,
    "stroke-opacity": theme.glow ? 0.2 : 0.24,
    "stroke-width": unit * clamp(3 + 3.2 * Math.log2(arch.commitCount + 1), 3, 26),
    fill: "none",
    "stroke-linecap": "round",
  });

const archLine = (arch: SizedArch, d: string, unit: number): SvgElement =>
  element("path", {
    d,
    stroke: arch.lane.colour,
    "stroke-width": 1.4 * unit,
    "stroke-opacity": 0.9,
    "stroke-dasharray": arch.mergedBack ? null : `${formatNumber(5 * unit)} ${formatNumber(4 * unit)}`,
    fill: "none",
  });

function baseline(view: LayoutView, axes: Axes, arrangement: Arrangement, unit: number): SvgElement[] {
  const trunk = view.lanes[0];
  if (!trunk) return [];
  const ends = [arrangement.point(alongAt(axes, 0), 0), arrangement.point(alongAt(axes, 1), 0)];
  return [element("path", { d: polylinePath(ends), stroke: trunk.colour, "stroke-width": 2.4 * unit, "stroke-linecap": "round", fill: "none" })];
}

function beads(view: LayoutView, axes: Axes, arrangement: Arrangement, theme: Theme, unit: number): SvgElement[] {
  const archByLane = new Map(arrangement.arches.map((arch) => [arch.lane, arch]));
  const spacing = axes.alongLength / Math.max(view.commits.length, 1);
  const baseRadius = clamp(spacing * BEAD_RADIUS_PER_SPACING, 1.6 * unit, 6 * unit);
  const inTimeOrder = view.commitsInTimeOrder;
  return inTimeOrder.flatMap((commit) => {
    const along = alongAt(axes, commit.timeFraction);
    const arch = archByLane.get(commit.lane);
    const [x, y] = arrangement.point(along, arch ? liftAt(arch, along) : 0);
    const radius = baseRadius * (1 + 0.25 * Math.log2(commit.weight));
    const bead = commit.isMerge
      ? element("circle", { cx: x, cy: y, r: radius * 1.15, fill: commit.colour })
      : element("circle", { cx: x, cy: y, r: radius, fill: theme.background, stroke: commit.colour, "stroke-width": Math.max(1, radius * 0.45) });
    return commit.isHead ? [bead, headRing([x, y], radius * 2.6, theme)] : [bead];
  });
}

export const arcs = defineStyle({
  name: "arcs",
  description: "One line of time; every branch an arch from fork to merge, open ones hanging below.",
  tunes: [],
  showsGrid: true,

  draw({ frame, theme, view }) {
    const { unit } = frame;
    const axes = axesOf(frame);
    const branches = view.lanes.slice(1).flatMap((lane) => archOf(lane, axes) ?? []);
    const arrangement = arrange(branches, axes);
    const widestFirst = [...arrangement.arches].sort((wider, narrower) => narrower.to - narrower.from - (wider.to - wider.from));
    const curves = widestFirst.map((arch) => ({ arch, d: polylinePath(archCurve(arch, arrangement.point)) }));
    return {
      layers: [
        group(
          {},
          curves.map(({ arch, d }) => veil(arch, d, theme, unit)),
        ),
        group(glowFilter(theme), [...baseline(view, axes, arrangement, unit), ...curves.map(({ arch, d }) => archLine(arch, d, unit))]),
        group({}, beads(view, axes, arrangement, theme, unit)),
      ],
    };
  },
});
