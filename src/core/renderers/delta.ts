import { mix } from "../draw/colour.ts";
import type { Frame } from "../draw/frame.ts";
import { normalAt } from "../draw/geometry.ts";
import { glowFilter, headRing } from "../draw/marks.ts";
import { element, formatNumber, group, type Point, polylinePath, type SvgElement } from "../draw/svg.ts";
import type { Theme } from "../draw/themes.ts";
import { defineStyle } from "../style/renderer.ts";
import type { LayoutView, PlacedCommit, PlacedEdge, PlacedLane } from "../style/view.ts";
import { consecutivePairs } from "../util/lists.ts";
import { clamp, smoothstep } from "../util/maths.ts";

const WIDEST_FAN_ANGLE = 0.86 * Math.PI;
const WIDEST_ANGLE_BETWEEN_SLOTS = Math.PI / 7;
const BEND_DURATION = 0.1;
const SAMPLES_PER_BEND = 24;
const DEPTH_LINE_COUNT = 6;
const SAMPLES_PER_DEPTH_LINE = 64;
const TIME_AT_SOURCE = -1;
const SOURCE_RADIUS_SHARE = 0.05;
const MERGE_END_WIDTH_SHARE = 0.6;

type TimeAndSlot = [time: number, slot: number];

interface Course {
  readonly samples: TimeAndSlot[];
  readonly widths: number[];
}

interface ColouredCourse extends Course {
  readonly colour: string;
  readonly threadOpacity: number;
}

interface Fan {
  readonly apex: Point;
  readonly axisAngle: number;
  readonly angleBetweenSlots: number;
  readonly middleSlot: number;
  readonly halfSpread: number;
  readonly radius: number;
  readonly innerRadius: number;
}

function bendSamples(fromTime: number, toTime: number, fromSlot: number, toSlot: number, bendsAtStart: boolean): TimeAndSlot[] {
  if (fromSlot === toSlot || toTime <= fromTime) {
    return [
      [fromTime, fromSlot],
      [toTime, toSlot],
    ];
  }
  const bendLength = Math.min(toTime - fromTime, BEND_DURATION);
  const [bendStart, bendEnd] = bendsAtStart ? [fromTime, fromTime + bendLength] : [toTime - bendLength, toTime];
  const samples: TimeAndSlot[] = [];
  if (!bendsAtStart && bendStart > fromTime) samples.push([fromTime, fromSlot]);
  for (let step = 0; step <= SAMPLES_PER_BEND; step++) {
    const time = bendStart + ((bendEnd - bendStart) * step) / SAMPLES_PER_BEND;
    samples.push([time, fromSlot + (toSlot - fromSlot) * smoothstep((time - bendStart) / (bendEnd - bendStart))]);
  }
  if (bendsAtStart && bendEnd < toTime) samples.push([toTime, toSlot]);
  return samples;
}

function unitSectorBounds(fromAngle: number, toAngle: number): [left: number, top: number, right: number, bottom: number] {
  const quarterTurn = Math.PI / 2;
  const points: Point[] = [
    [0, 0],
    [Math.cos(fromAngle), Math.sin(fromAngle)],
    [Math.cos(toAngle), Math.sin(toAngle)],
  ];
  for (let quarter = Math.ceil(fromAngle / quarterTurn); quarter * quarterTurn <= toAngle; quarter++) {
    points.push([Math.cos(quarter * quarterTurn), Math.sin(quarter * quarterTurn)]);
  }
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

function fitFan(frame: Frame, lowestSlot: number, highestSlot: number): Fan {
  const [left, top, right, bottom] = frame.plot;
  const padding = 24 * frame.unit;
  const slotSpan = highestSlot - lowestSlot;
  const angleBetweenSlots = Math.min(WIDEST_FAN_ANGLE / Math.max(slotSpan, 1), WIDEST_ANGLE_BETWEEN_SLOTS);
  const halfSpread = Math.min((slotSpan / 2 + 0.6) * angleBetweenSlots, Math.PI / 2);
  const opensUp = -Math.PI / 2;
  const opensRight = 0;
  const candidates = [opensUp, opensRight].map((axisAngle) => {
    const [boundsLeft, boundsTop, boundsRight, boundsBottom] = unitSectorBounds(axisAngle - halfSpread, axisAngle + halfSpread);
    const radius = Math.max(
      Math.min((right - left - 2 * padding) / (boundsRight - boundsLeft), (bottom - top - 2 * padding) / (boundsBottom - boundsTop)),
      padding,
    );
    const apex: Point = [(left + right) / 2 - ((boundsLeft + boundsRight) / 2) * radius, (top + bottom) / 2 - ((boundsTop + boundsBottom) / 2) * radius];
    return { apex, axisAngle, radius };
  });
  const best = candidates.reduce((largest, candidate) => (candidate.radius > largest.radius ? candidate : largest));
  return { ...best, angleBetweenSlots, middleSlot: (lowestSlot + highestSlot) / 2, halfSpread, innerRadius: best.radius * SOURCE_RADIUS_SHARE };
}

const polar = ([apexX, apexY]: Point, radius: number, angle: number): Point => [apexX + radius * Math.cos(angle), apexY + radius * Math.sin(angle)];

function fanPoint(fan: Fan, [time, slot]: TimeAndSlot): Point {
  const radius = time === TIME_AT_SOURCE ? 0 : fan.innerRadius + time * (fan.radius - fan.innerRadius);
  return polar(fan.apex, radius, fan.axisAngle - (slot - fan.middleSlot) * fan.angleBetweenSlots);
}

function taperedOutline(points: readonly Point[], widths: readonly number[]): string {
  const offsetSide = (side: 1 | -1) =>
    points.map(([x, y], index): Point => {
      const [normalX, normalY] = normalAt(points, index);
      const halfWidth = (side * (widths[index] ?? 0)) / 2;
      return [x + normalX * halfWidth, y + normalY * halfWidth];
    });
  return `${polylinePath([...offsetSide(1), ...offsetSide(-1).reverse()])} Z`;
}

function easedWidths(samples: readonly TimeAndSlot[], startWidth: number, endWidth: number): number[] {
  const startTime = samples[0]?.[0] ?? 0;
  const endTime = samples.at(-1)?.[0] ?? startTime;
  return samples.map(([time]) => (endTime > startTime ? startWidth + (endWidth - startWidth) * ((time - startTime) / (endTime - startTime)) : endWidth));
}

const easedCourse = (samples: TimeAndSlot[], startWidth: number, endWidth: number): Course => ({ samples, widths: easedWidths(samples, startWidth, endWidth) });

const evenCourse = (samples: TimeAndSlot[], width: number): Course => ({ samples, widths: samples.map(() => width) });

const joinCourses = (courses: readonly Course[]): Course =>
  courses.reduce<Course>(
    (joined, next) =>
      joined.samples.length === 0 ? next : { samples: [...joined.samples, ...next.samples.slice(1)], widths: [...joined.widths, ...next.widths.slice(1)] },
    { samples: [], widths: [] },
  );

function cumulativeWeights(view: LayoutView): Map<PlacedCommit, number> {
  const carried = new Map<PlacedCommit, number>();
  for (const lane of view.lanes) {
    let runningWeight = 0;
    for (const commit of lane.commits) {
      runningWeight += commit.weight;
      carried.set(commit, runningWeight);
    }
  }
  return carried;
}

function laneCourse(lane: PlacedLane, channelWidth: (commit: PlacedCommit) => number, thinnestWidth: number): ColouredCourse | undefined {
  const first = lane.commits[0];
  const last = lane.commits.at(-1);
  if (!first || !last) return undefined;
  const fork = first.firstParentInRange;
  const fromFork = fork && easedCourse(bendSamples(fork.timeFraction, first.timeFraction, fork.slot, lane.slot, true), thinnestWidth, channelWidth(first));
  const fromSource = evenCourse(
    lane.entersFromBeforeRange
      ? [
          [TIME_AT_SOURCE, lane.slot],
          [first.timeFraction, lane.slot],
        ]
      : [[first.timeFraction, lane.slot]],
    channelWidth(first),
  );
  const alongCommits = consecutivePairs(lane.commits).map(([previous, next]) =>
    easedCourse(bendSamples(previous.timeFraction, next.timeFraction, lane.slot, lane.slot, true), channelWidth(previous), channelWidth(next)),
  );
  const toCoast =
    lane.continuesAfterRange && last.timeFraction < 1
      ? [
          evenCourse(
            [
              [last.timeFraction, lane.slot],
              [1, lane.slot],
            ],
            channelWidth(last),
          ),
        ]
      : [];
  return { ...joinCourses([fromFork ?? fromSource, ...alongCommits, ...toCoast]), colour: lane.colour, threadOpacity: 1 };
}

function mergeCourse(edge: PlacedEdge, channelWidth: (commit: PlacedCommit) => number): ColouredCourse | undefined {
  if (edge.kind !== "merge" || !edge.parent) return undefined;
  const width = channelWidth(edge.parent);
  const samples = bendSamples(edge.parent.timeFraction, edge.child.timeFraction, edge.parent.slot, edge.child.slot, false);
  return { ...easedCourse(samples, width, width * MERGE_END_WIDTH_SHARE), colour: edge.parent.colour, threadOpacity: 0.8 };
}

function depthLines(fan: Fan, theme: Theme, unit: number): SvgElement {
  const lines = Array.from({ length: DEPTH_LINE_COUNT }, (_, index) => {
    const isCoast = index === DEPTH_LINE_COUNT - 1;
    const radius = fan.innerRadius + ((index + 1) / DEPTH_LINE_COUNT) * (fan.radius - fan.innerRadius);
    const points = Array.from({ length: SAMPLES_PER_DEPTH_LINE + 1 }, (_, step) =>
      polar(fan.apex, radius, fan.axisAngle - fan.halfSpread + (2 * fan.halfSpread * step) / SAMPLES_PER_DEPTH_LINE),
    );
    return element("path", {
      d: polylinePath(points),
      "stroke-dasharray": isCoast ? null : `${formatNumber(2 * unit)} ${formatNumber(6 * unit)}`,
      stroke: isCoast ? theme.muted : theme.grid,
      "stroke-opacity": isCoast ? 0.5 : 1,
    });
  });
  return group({ fill: "none", stroke: theme.grid, "stroke-width": 1.2 * unit }, lines);
}

const channelBody = (fan: Fan, theme: Theme, course: ColouredCourse): SvgElement =>
  element("path", {
    d: taperedOutline(
      course.samples.map((sample) => fanPoint(fan, sample)),
      course.widths,
    ),
    fill: mix(course.colour, theme.background, 0.3),
    "fill-opacity": 0.9,
  });

const channelThread = (fan: Fan, unit: number, course: ColouredCourse): SvgElement =>
  element("path", {
    d: polylinePath(course.samples.map((sample) => fanPoint(fan, sample))),
    stroke: course.colour,
    "stroke-width": 1.1 * unit,
    "stroke-opacity": course.threadOpacity === 1 ? null : course.threadOpacity,
  });

function commitBead(fan: Fan, theme: Theme, unit: number, commit: PlacedCommit): SvgElement[] {
  const [x, y] = fanPoint(fan, [commit.timeFraction, commit.slot]);
  const radius = unit * 1.6 * (1 + 0.25 * Math.log2(commit.weight));
  const bead = commit.isMerge
    ? element("circle", { cx: x, cy: y, r: radius * 1.5, fill: commit.colour })
    : element("circle", { cx: x, cy: y, r: radius, fill: theme.background, stroke: commit.colour, "stroke-width": Math.max(0.8, radius * 0.5) });
  return commit.isHead ? [bead, headRing([x, y], radius * 5, theme)] : [bead];
}

export const delta = defineStyle({
  name: "delta",
  description: "A river delta: time flows out from one point, branches as channels fanning to the sea.",
  tunes: ["arrange"],

  draw({ frame, theme, view }) {
    const { unit } = frame;
    const fan = fitFan(frame, view.lowestSlot, view.highestSlot);
    const carried = cumulativeWeights(view);
    const channelWidth = (commit: PlacedCommit) => unit * clamp(2 + 2.4 * Math.log2(1 + (carried.get(commit) ?? 0)), 2, 26);
    const trunkLast = [...view.lanes].reverse();
    const channels = trunkLast.flatMap((lane) => laneCourse(lane, channelWidth, 2 * unit) ?? []).filter((course) => course.samples.length > 1);
    const merges = view.edges.flatMap((edge) => mergeCourse(edge, channelWidth) ?? []);
    return {
      layers: [
        depthLines(fan, theme, unit),
        group(
          {},
          merges.map((course) => channelBody(fan, theme, course)),
        ),
        group(
          {},
          channels.map((course) => channelBody(fan, theme, course)),
        ),
        group(
          { ...glowFilter(theme), fill: "none", "stroke-linecap": "round" },
          [...channels, ...merges].map((course) => channelThread(fan, unit, course)),
        ),
        group(
          {},
          view.commits.flatMap((commit) => commitBead(fan, theme, unit, commit)),
        ),
      ],
    };
  },
});
