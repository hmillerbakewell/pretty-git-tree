import { backgroundPaint } from "../draw/backdrop.ts";
import type { Frame } from "../draw/frame.ts";
import { glowFilter } from "../draw/marks.ts";
import { element, formatNumber, group, type Point, polylinePath, type SvgElement } from "../draw/svg.ts";
import type { Theme } from "../draw/themes.ts";
import { defineStyle } from "../style/renderer.ts";
import type { LayoutView, PlacedCommit, PlacedLane } from "../style/view.ts";
import { consecutivePairs } from "../util/lists.ts";
import { clamp } from "../util/maths.ts";
import { arrowheads, gluon, photon } from "./feynman/propagators.ts";

const EXTERNAL_LEG_SHARE = 0.07;
const EXTERNAL_LEG_LENGTH = 70;
const WIDEST_LANE_SPACING = 150;
const FERMION_WIDTH = 1.7;
const PHOTON_HALF_WAVELENGTH = 9;
const PHOTON_AMPLITUDE = 4;
const GLUON_MINIMUM_WEIGHT = 6;
const GLUON_LOOP_PITCH = 9;
const SHORTEST_GLUON = 14;
const LONGEST_GLUON = 120;
const CROWDED_MERGE_COUNT = 80;
const BLANK_PAINT_ID = "blank";

type Segment = readonly [start: Point, end: Point];

interface Axes {
  readonly timeStart: number;
  readonly timeEnd: number;
  readonly timeAt: (timeFraction: number) => number;
  readonly acrossAt: (slot: number) => number;
  readonly toScreen: (alongAndAcross: Point) => Point;
  readonly forward: Point;
}

interface Placement {
  readonly lineOf: (lane: PlacedLane) => Segment;
  readonly place: (commit: PlacedCommit) => Point;
}

interface LaneMarks {
  readonly fermions: SvgElement[];
  readonly arrows: SvgElement[];
  readonly erasers: SvgElement[];
  readonly coils: SvgElement[];
  readonly vertices: SvgElement[];
}

const noMarks = (): LaneMarks => ({ fermions: [], arrows: [], erasers: [], coils: [], vertices: [] });

const combineMarks = (marks: readonly LaneMarks[]): LaneMarks =>
  marks.reduce<LaneMarks>(
    (all, next) => ({
      fermions: [...all.fermions, ...next.fermions],
      arrows: [...all.arrows, ...next.arrows],
      erasers: [...all.erasers, ...next.erasers],
      coils: [...all.coils, ...next.coils],
      vertices: [...all.vertices, ...next.vertices],
    }),
    noMarks(),
  );

function fitAxes(frame: Frame, view: LayoutView): Axes {
  const [left, top, right, bottom] = frame.plot;
  const [timeStart, timeEnd] = frame.vertical ? [top, bottom] : [left, right];
  const [acrossStart, acrossEnd] = frame.vertical ? [left, right] : [top, bottom];
  const legRoom = (timeEnd - timeStart) * EXTERNAL_LEG_SHARE;
  const [firstTime, lastTime] = [timeStart + legRoom, timeEnd - legRoom];
  const spacing = Math.min((acrossEnd - acrossStart) / Math.max(view.highestSlot - view.lowestSlot + 1, 1), WIDEST_LANE_SPACING * frame.unit);
  const middleSlot = (view.lowestSlot + view.highestSlot) / 2;
  return {
    timeStart,
    timeEnd,
    timeAt: (timeFraction) => firstTime + timeFraction * (lastTime - firstTime),
    acrossAt: (slot) => (acrossStart + acrossEnd) / 2 + (slot - middleSlot) * spacing,
    toScreen: ([along, across]) => (frame.vertical ? [across, along] : [along, across]),
    forward: frame.vertical ? [0, 1] : [1, 0],
  };
}

function placeOnLines(view: LayoutView, axes: Axes, unit: number): Placement {
  const lines = new Map<PlacedLane, Segment>();
  const positions = new Map<PlacedCommit, Point>();
  const trunk = view.lanes[0];
  const lineOf = (lane: PlacedLane): Segment => {
    const known = lines.get(lane);
    if (known) return known;
    const first = lane.commits[0];
    const across = axes.acrossAt(lane.slot);
    const legLength = lane === trunk ? Number.POSITIVE_INFINITY : EXTERNAL_LEG_LENGTH * unit;
    const [firstTime, lastTime] = [axes.timeAt(first?.timeFraction ?? 0), axes.timeAt(lane.commits.at(-1)?.timeFraction ?? 0)];
    const fork = first?.firstParentInRange;
    const start: Point = fork ? place(fork) : lane.entersFromBeforeRange ? [Math.max(axes.timeStart, firstTime - legLength), across] : [firstTime, across];
    const end: Point = [Math.max(lane.continuesAfterRange ? Math.min(axes.timeEnd, lastTime + legLength) : lastTime, start[0]), across];
    lines.set(lane, [start, end]);
    return [start, end];
  };
  function place(commit: PlacedCommit): Point {
    const known = positions.get(commit);
    if (known) return known;
    const [start, end] = lineOf(commit.lane);
    const along = axes.timeAt(commit.timeFraction);
    const share = end[0] - start[0] > 1e-6 ? clamp((along - start[0]) / (end[0] - start[0]), 0, 1) : 1;
    const point: Point = [start[0] + share * (end[0] - start[0]), start[1] + share * (end[1] - start[1])];
    positions.set(commit, point);
    return point;
  }
  return { lineOf, place };
}

function fermionLines(lane: PlacedLane, [start, end]: Segment, [first, tip]: Segment, axes: Axes, unit: number): SvgElement[] {
  const forked = lane.commits[0]?.firstParentInRange !== undefined;
  const dashes = `${formatNumber(6 * unit)} ${formatNumber(5 * unit)}`;
  const line = (from: Point, to: Point, dashed: boolean) =>
    element("path", { d: polylinePath([axes.toScreen(from), axes.toScreen(to)]), stroke: lane.colour, "stroke-dasharray": dashed ? dashes : null });
  return [
    line(forked ? start : first, tip, false),
    ...(lane.entersFromBeforeRange ? [line(start, first, true)] : []),
    ...(lane.continuesAfterRange ? [line(tip, end, true)] : []),
  ];
}

interface VertexContext {
  readonly colour: string;
  readonly direction: Point;
  readonly unit: number;
  readonly isFork: (commit: PlacedCommit) => boolean;
}

function vertexMarks(commit: PlacedCommit, room: number, screen: Point, context: VertexContext): LaneMarks {
  const { colour, direction, unit } = context;
  const coilLength = Math.min(unit * (14 + 14 * Math.log2(commit.weight / GLUON_MINIMUM_WEIGHT + 1)), room * 0.8, LONGEST_GLUON * unit);
  if (commit.weight >= GLUON_MINIMUM_WEIGHT && coilLength >= SHORTEST_GLUON * unit) {
    const half: Point = [(direction[0] * coilLength) / 2, (direction[1] * coilLength) / 2];
    const eraser = element("path", {
      d: polylinePath([
        [screen[0] - half[0], screen[1] - half[1]],
        [screen[0] + half[0], screen[1] + half[1]],
      ]),
      "stroke-width": FERMION_WIDTH * unit * 3,
    });
    const coil = element("path", { d: gluon(screen, direction, coilLength, GLUON_LOOP_PITCH * unit), stroke: colour });
    return { ...noMarks(), erasers: [eraser], coils: [coil] };
  }
  const radius = unit * (commit.isMerge || context.isFork(commit) ? 4 : 2.8) * (commit.weight > 1 ? 1.2 : 1);
  return { ...noMarks(), vertices: [element("circle", { cx: screen[0], cy: screen[1], r: radius, fill: colour })] };
}

function laneVertices(lane: PlacedLane, points: readonly Point[], context: VertexContext, axes: Axes): LaneMarks {
  const distance = (index: number, other: number) => {
    const [here, there] = [points[index], points[other]];
    return here && there ? Math.hypot(here[0] - there[0], here[1] - there[1]) : Number.POSITIVE_INFINITY;
  };
  return combineMarks(
    lane.commits.map((commit, index) => {
      const room = Math.min(distance(index, index - 1), distance(index, index + 1));
      return vertexMarks(commit, room, axes.toScreen(points[index] ?? [0, 0]), context);
    }),
  );
}

function laneMarks(lane: PlacedLane, placement: Placement, axes: Axes, unit: number, isFork: (commit: PlacedCommit) => boolean): LaneMarks {
  const [start, end] = placement.lineOf(lane);
  const points = lane.commits.map(placement.place);
  const first = points[0];
  const tip = points.at(-1);
  if (!first || !tip) return noMarks();
  const forked = lane.commits[0]?.firstParentInRange !== undefined;
  const stops = [...(lane.entersFromBeforeRange || forked ? [start] : []), ...points, ...(lane.continuesAfterRange ? [end] : [])].map(axes.toScreen);
  const direction = unitVector(axes.toScreen(start), axes.toScreen(end), axes.forward);
  return combineMarks([
    { ...noMarks(), fermions: fermionLines(lane, [start, end], [first, tip], axes, unit) },
    { ...noMarks(), arrows: arrowheads(consecutivePairs(stops), direction, lane.colour, unit) },
    laneVertices(lane, points, { colour: lane.colour, direction, unit, isFork }, axes),
  ]);
}

function unitVector([fromX, fromY]: Point, [toX, toY]: Point, fallback: Point): Point {
  const length = Math.hypot(toX - fromX, toY - fromY);
  return length > 1e-6 ? [(toX - fromX) / length, (toY - fromY) / length] : fallback;
}

function photons(view: LayoutView, placement: Placement, axes: Axes, unit: number): SvgElement {
  const merges = view.edges.filter((edge) => edge.kind === "merge");
  const waves = merges.flatMap((edge) => {
    if (!edge.parent) return [];
    const d = photon(
      axes.toScreen(placement.place(edge.parent)),
      axes.toScreen(placement.place(edge.child)),
      PHOTON_HALF_WAVELENGTH * unit,
      PHOTON_AMPLITUDE * unit,
    );
    return d ? [element("path", { d, stroke: edge.parent.colour })] : [];
  });
  const crowded = merges.length > CROWDED_MERGE_COUNT;
  return group({ fill: "none", "stroke-width": FERMION_WIDTH * unit * 0.85, "stroke-linecap": "round", opacity: crowded ? 0.6 : null }, waves);
}

function headMarker(view: LayoutView, placement: Placement, axes: Axes, theme: Theme, unit: number): SvgElement[] {
  const head = view.commits.find((commit) => commit.isHead);
  if (!head) return [];
  const [x, y] = axes.toScreen(placement.place(head));
  return [
    element("circle", {
      cx: x,
      cy: y,
      r: 11 * unit,
      fill: "none",
      stroke: theme.ink,
      "stroke-width": 1.2 * unit,
      "stroke-dasharray": `${formatNumber(2.5 * unit)} ${formatNumber(3 * unit)}`,
    }),
  ];
}

export const feynman = defineStyle({
  name: "feynman",
  description: "A Feynman diagram: branches as fermion lines, forks as pair creation, merges as photons.",
  tunes: ["arrange"],

  draw({ frame, theme, view }) {
    const { unit } = frame;
    const axes = fitAxes(frame, view);
    const placement = placeOnLines(view, axes, unit);
    const isFork = (commit: PlacedCommit) => commit.childrenInRange.length > 1;
    const marks = combineMarks(view.lanes.map((lane) => laneMarks(lane, placement, axes, unit, isFork)));
    const strokeWidth = FERMION_WIDTH * unit;
    return {
      definitions: [backgroundPaint(frame, theme, BLANK_PAINT_ID)],
      layers: [
        group(glowFilter(theme), [
          group({ fill: "none", "stroke-width": strokeWidth, "stroke-linecap": "round" }, marks.fermions),
          photons(view, placement, axes, unit),
          group({ fill: "none", stroke: `url(#${BLANK_PAINT_ID})`, "stroke-linecap": "butt" }, marks.erasers),
          group({ fill: "none", "stroke-width": strokeWidth, "stroke-linecap": "round", "stroke-linejoin": "round" }, marks.coils),
          group({ stroke: "none" }, marks.arrows),
          group({ stroke: "none" }, marks.vertices),
          group({}, headMarker(view, placement, axes, theme, unit)),
        ]),
      ],
    };
  },
});
