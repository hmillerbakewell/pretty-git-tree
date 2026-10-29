import type { PlacedCommit, PlacedLane } from "../../style/view.ts";
import { clamp } from "../../util/maths.ts";
import type { Channels } from "./channels.ts";
import type { Courses } from "./courses.ts";
import { edgeFacing, forkJoin, mergeJoin } from "./joins.ts";
import { curve, type Sample, type Widening, widen } from "./samples.ts";

export interface Ribbon {
  readonly samples: readonly Sample[];
  readonly colour: string;
  readonly size: number;
}

interface Course {
  readonly line: Sample[];
  readonly widenings: Widening[];
}

interface Opening {
  readonly line: Sample[];
  readonly from: number;
}

function opening(lane: PlacedLane, head: PlacedCommit, courses: Courses, channels: Channels): Opening {
  const leave = courses.leaves.get(lane);
  const arrival = courses.arrivals.get(lane);
  const fork = head.firstParentInRange;
  const first = courses.at(head);
  const thin: Sample = [first[0], first[1], channels.hairline];
  const ownAcross = channels.centreOf(lane.slot);
  const startsOnLeave = leave !== undefined && first[0] > leave.from;
  if (leave && startsOnLeave && leave.sweep) return { line: [], from: leave.from };
  if (arrival) {
    return { line: curve([arrival.from, arrival.fromAcross, 0], [arrival.to, ownAcross, 0], channels.curveSpacing), from: arrival.from };
  }
  if (fork) {
    const landing: Sample = leave && startsOnLeave ? [leave.from, leave.fromAcross, channels.hairline] : thin;
    const line = forkJoin(channels, courses.at(fork), landing, channels.hairline);
    return { line, from: line.at(-2)?.[0] ?? channels.along(fork) };
  }
  if (lane.entersFromBeforeRange) {
    const from = channels.inputStart;
    return { line: startsOnLeave ? [[from, ownAcross, channels.hairline]] : [[from, first[1], channels.hairline], thin], from };
  }
  const from = Math.min(channels.runStart(head), first[0]);
  return { line: [[from, first[1], channels.hairline], thin], from };
}

function alongCommits(lane: PlacedLane, start: Opening, courses: Courses, channels: Channels): Course {
  const leave = courses.leaves.get(lane);
  const arrival = courses.arrivals.get(lane);
  const line = [...start.line];
  const widenings: Widening[] = [];
  let width = channels.hairline;
  let from = start.from;
  for (const commit of lane.commits) {
    const [along, across, commitWidth] = courses.at(commit);
    widenings.push({
      from: clamp(Math.min(along - channels.wideningLength, channels.runStart(commit)), from, along),
      to: along,
      startWidth: width,
      endWidth: commitWidth,
    });
    const onCurve = (leave && along > leave.from) || (arrival && along < arrival.to);
    if (!onCurve) line.push([along, across, commitWidth]);
    width = commitWidth;
    from = along;
  }
  return { line, widenings };
}

function closing(lane: PlacedLane, tip: PlacedCommit, course: Course, courses: Courses, channels: Channels): Course {
  const [tipAlong, , tipWidth] = courses.at(tip);
  const end = course.line.at(-1);
  if (lane.continuesAfterRange) {
    return end ? { ...course, line: [...course.line, [Math.max(channels.coast, end[0]), end[1], tipWidth]] } : course;
  }
  const leave = courses.leaves.get(lane);
  if (!leave) return course;
  const narrowing: Widening =
    tipAlong <= leave.from
      ? { from: Math.max(tipAlong, leave.from - channels.wideningLength), to: leave.from, startWidth: tipWidth, endWidth: leave.width }
      : { from: tipAlong, to: Math.min(tipAlong + channels.wideningLength, leave.to), startWidth: tipWidth, endWidth: leave.width };
  const approach: Sample[] = end && end[0] < leave.from ? [[leave.from, leave.fromAcross, 0]] : [];
  const merging = curve([leave.from, leave.fromAcross, 0], [leave.to, leave.toAcross, 0], channels.curveSpacing);
  const beforeMerging = [...course.line, ...approach];
  return {
    line: beforeMerging.length ? [...beforeMerging, ...merging.slice(1)] : merging,
    widenings: [...course.widenings, narrowing],
  };
}

export function laneRibbon(lane: PlacedLane, courses: Courses, channels: Channels): Ribbon | undefined {
  const head = lane.commits[0];
  const tip = lane.commits.at(-1);
  if (!head || !tip) return undefined;
  const course = closing(lane, tip, alongCommits(lane, opening(lane, head, courses, channels), courses, channels), courses, channels);
  const samples = widen(course.line, course.widenings, channels.hairline);
  return { samples, colour: lane.colour, size: Math.max(...samples.map(([, , width]) => width)) };
}

export function mergeThreads(merges: ReadonlyMap<PlacedCommit, readonly PlacedCommit[]>, courses: Courses, channels: Channels): Ribbon[] {
  const tipsCarriedByRibbons = new Set([...courses.leaves.keys()].flatMap((lane) => lane.commits.at(-1) ?? []));
  const { hairline } = channels;
  return [...merges].flatMap(([parent, children]) => {
    const from = courses.at(parent);
    return children.slice(tipsCarriedByRibbons.has(parent) ? 1 : 0).map((merge) => {
      const to = courses.at(merge);
      const start: Sample = [from[0], edgeFacing(from, to[1], hairline), hairline];
      return { samples: mergeJoin(channels, start, to, hairline), colour: parent.colour, size: hairline };
    });
  });
}
