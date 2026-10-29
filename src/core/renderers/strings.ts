import type { Frame } from "../draw/frame.ts";
import { glowFilter, headRing } from "../draw/marks.ts";
import { element, group, type Point, polylinePath, type SvgElement } from "../draw/svg.ts";
import type { Theme } from "../draw/themes.ts";
import { defineStyle } from "../style/renderer.ts";
import type { PlacedCommit, PlacedEdge, PlacedLane } from "../style/view.ts";

const GAP_WHERE_TIME_WRAPS = 0.05;
const COMMITS_PER_TURN = 30;
const FEWEST_TURNS = 2;
const MOST_TURNS = 6;
const SPIRAL_INNER_RADIUS = 0.06;
const BOARD_SAMPLES = 720;
const STARTS_AT_TOP = -Math.PI / 2;
const BOARD_INSET = 10;
const BOARD_LINE_WIDTH = 1.5;
const THREAD_WIDTH_PER_DOUBLING = 0.3;
const TAUT_THREAD_WIDTH = 1.1;
const LOOSE_THREAD_WIDTH = 0.6;
const LOOSE_THREAD_OPACITY = 0.28;
const GLOWING_THREAD_OPACITY = 0.75;
const THREAD_OPACITY = 0.85;
const END_PIN_RADIUS = 3.2;
const PIN_RADIUS = 1.8;
const PIN_GROWTH_PER_DOUBLING = 0.25;
const MERGE_PIN_SHARE = 1.3;
const THINNEST_PIN_STROKE = 0.8;
const PIN_STROKE_SHARE = 0.5;
const HEAD_RING_SHARE = 3.4;
const HEAD_MARKER_OFFSET = 14;
const HEAD_MARKER_RADIUS = 2.4;

type BoardShape = (timeFraction: number, outward: number) => Point;
type PinAt = (timeFraction: number, outward?: number) => Point;

interface Thread {
  readonly from: Point;
  readonly to: Point;
  readonly colour: string;
  readonly widthScale: number;
  readonly loose: boolean;
}

const circleWithGap: BoardShape = (timeFraction, outward) => {
  const angle = STARTS_AT_TOP + 2 * Math.PI * (GAP_WHERE_TIME_WRAPS / 2 + timeFraction * (1 - GAP_WHERE_TIME_WRAPS));
  return [(1 + outward) * Math.cos(angle), (1 + outward) * Math.sin(angle)];
};

function spiralOf(turns: number): BoardShape {
  const endAngle = 2 * Math.PI * turns;
  const growthPerRadian = (1 - SPIRAL_INNER_RADIUS) / endAngle;
  const totalLength = SPIRAL_INNER_RADIUS * endAngle + (growthPerRadian * endAngle * endAngle) / 2;
  return (timeFraction, outward) => {
    const lengthSoFar = timeFraction * totalLength;
    const angle = (-SPIRAL_INNER_RADIUS + Math.sqrt(SPIRAL_INNER_RADIUS ** 2 + 2 * growthPerRadian * lengthSoFar)) / growthPerRadian;
    const radius = SPIRAL_INNER_RADIUS + growthPerRadian * angle + outward;
    return [radius * Math.cos(STARTS_AT_TOP + angle), radius * Math.sin(STARTS_AT_TOP + angle)];
  };
}

const boardSamples = (pinAt: (timeFraction: number) => Point): Point[] => Array.from({ length: BOARD_SAMPLES + 1 }, (_, index) => pinAt(index / BOARD_SAMPLES));

function fitBoard([left, top, right, bottom]: Frame["plot"], shape: BoardShape): PinAt {
  const outline = boardSamples((timeFraction) => shape(timeFraction, 0));
  const xs = outline.map(([x]) => x);
  const ys = outline.map(([, y]) => y);
  const [shapeLeft, shapeRight, shapeTop, shapeBottom] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const scale = Math.min((right - left) / (shapeRight - shapeLeft), (bottom - top) / (shapeBottom - shapeTop));
  const centreX = (left + right) / 2 - ((shapeLeft + shapeRight) / 2) * scale;
  const centreY = (top + bottom) / 2 - ((shapeTop + shapeBottom) / 2) * scale;
  return (timeFraction, outward = 0) => {
    const [x, y] = shape(timeFraction, outward / scale);
    return [centreX + x * scale, centreY + y * scale];
  };
}

function edgeThread(edge: PlacedEdge, pinAt: PinAt): Thread {
  const { parent, child } = edge;
  const widthScale = 1 + THREAD_WIDTH_PER_DOUBLING * Math.log2(child.weight);
  if (!parent) return { from: pinAt(0), to: pinAt(child.timeFraction), colour: child.colour, widthScale, loose: true };
  const owner = edge.kind === "merge" ? parent : child;
  return { from: pinAt(parent.timeFraction), to: pinAt(child.timeFraction), colour: owner.colour, widthScale, loose: false };
}

function threadOut(lane: PlacedLane, pinAt: PinAt): Thread[] {
  const tip = lane.commits.at(-1);
  if (!lane.continuesAfterRange || !tip) return [];
  return [{ from: pinAt(tip.timeFraction), to: pinAt(1), colour: lane.colour, widthScale: 1, loose: true }];
}

const threadLength = ({ from, to }: Thread) => Math.hypot(to[0] - from[0], to[1] - from[1]);

function threadLine(thread: Thread, unit: number, theme: Theme): SvgElement {
  const tautOpacity = theme.glow ? GLOWING_THREAD_OPACITY : THREAD_OPACITY;
  return element("line", {
    x1: thread.from[0],
    y1: thread.from[1],
    x2: thread.to[0],
    y2: thread.to[1],
    stroke: thread.colour,
    "stroke-width": (thread.loose ? LOOSE_THREAD_WIDTH : TAUT_THREAD_WIDTH) * unit * thread.widthScale,
    "stroke-opacity": thread.loose ? LOOSE_THREAD_OPACITY : tautOpacity,
  });
}

function commitPin(commit: PlacedCommit, pinAt: PinAt, unit: number, theme: Theme): SvgElement[] {
  const [x, y] = pinAt(commit.timeFraction);
  const radius = unit * PIN_RADIUS * (1 + PIN_GROWTH_PER_DOUBLING * Math.log2(commit.weight));
  const pin = commit.isMerge
    ? element("circle", { cx: x, cy: y, r: radius * MERGE_PIN_SHARE, fill: commit.colour })
    : element("circle", {
        cx: x,
        cy: y,
        r: radius,
        fill: theme.background,
        stroke: theme.muted,
        "stroke-width": Math.max(THINNEST_PIN_STROKE, radius * PIN_STROKE_SHARE),
      });
  if (!commit.isHead) return [pin];
  const [markerX, markerY] = pinAt(commit.timeFraction, HEAD_MARKER_OFFSET * unit);
  return [
    pin,
    headRing([x, y], radius * HEAD_RING_SHARE, theme),
    element("circle", { cx: markerX, cy: markerY, r: HEAD_MARKER_RADIUS * unit, fill: commit.colour }),
  ];
}

const endPins = (pinAt: PinAt, unit: number, theme: Theme): SvgElement[] =>
  [0, 1].map((timeFraction) => {
    const [x, y] = pinAt(timeFraction);
    return element("circle", { cx: x, cy: y, r: END_PIN_RADIUS * unit, fill: theme.ink });
  });

export const strings = defineStyle({
  name: "strings",
  description: "String art: commits as pins round a circle (or a spiral), every parent link a straight thread.",
  tunes: ["route"],

  draw({ frame, theme, options, view }) {
    const { unit } = frame;
    const [left, top, right, bottom] = frame.plot;
    const inset = BOARD_INSET * unit;
    const turns = Math.min(Math.max(Math.round(view.commits.length / COMMITS_PER_TURN), FEWEST_TURNS), MOST_TURNS);
    const shape = options.route === "fill" ? spiralOf(turns) : circleWithGap;
    const pinAt = fitBoard([left + inset, top + inset, right - inset, bottom - inset], shape);
    const threads = [...view.edges.map((edge) => edgeThread(edge, pinAt)), ...view.lanes.flatMap((lane) => threadOut(lane, pinAt))];
    const longestFirst = threads.sort((a, b) => threadLength(b) - threadLength(a));
    const commitsInTimeOrder = view.commitsInTimeOrder;
    return {
      layers: [
        element("path", {
          d: polylinePath(boardSamples((timeFraction) => pinAt(timeFraction))),
          fill: "none",
          stroke: theme.grid,
          "stroke-width": BOARD_LINE_WIDTH * unit,
        }),
        group(
          { "stroke-linecap": "round", ...glowFilter(theme) },
          longestFirst.map((thread) => threadLine(thread, unit, theme)),
        ),
        group({}, [...endPins(pinAt, unit, theme), ...commitsInTimeOrder.flatMap((commit) => commitPin(commit, pinAt, unit, theme))]),
      ],
    };
  },
});
