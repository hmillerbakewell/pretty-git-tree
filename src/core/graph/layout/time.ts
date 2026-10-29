import { type Commit, type Graph, type HalfTwistWindow, TIME_MODES, type TimeMode } from "../../model.ts";
import { isOneOf } from "../../util/guards.ts";
import { clamp } from "../../util/maths.ts";
import { childrenOf, weight } from "../queries.ts";
import { twistGaps } from "./twists.ts";

export interface TimePositions {
  t: Map<string, number>;
  t0: Map<string, number>;
  windows: [number, number][];
}

const MIDDLE_OF_TIME = 0.5;
const SLOTS_PER_COMMIT = 1;
const EXTRA_SLOTS_PER_DOUBLING_OF_RUN = 0.6;
const SLOTS_TO_BEND_AT_45_DEGREES = 1;
const SLOTS_PER_TWIST = 5;
const TWIST_INSET_SLOTS = 0.25;
const TWIST_PADDING_SHARE_OF_GAP = 0.15;

function allInTheMiddle(commits: Commit[]): TimePositions {
  const t = new Map(commits.map((commit) => [commit.sha, MIDDLE_OF_TIME]));
  return { t, t0: t, windows: [] };
}

function topologicalSlotsFor(commit: Commit, children: Map<string, string[]>): number {
  const forks = commit.parents.length && (children.get(commit.parents[0])?.length ?? 0) > 1;
  const merges = commit.parents.length > 1;
  return (
    SLOTS_PER_COMMIT +
    EXTRA_SLOTS_PER_DOUBLING_OF_RUN * Math.log2(weight(commit)) +
    (forks ? SLOTS_TO_BEND_AT_45_DEGREES : 0) +
    (merges ? SLOTS_TO_BEND_AT_45_DEGREES : 0)
  );
}

function topologicalPositions(graph: Graph, twistEvery: number): TimePositions {
  const commits = graph.commits;
  if (commits.length < 2) return allInTheMiddle(commits);
  const children = childrenOf(graph);
  const twistBefore = new Set(twistGaps(graph, twistEvery).map((gap) => gap + 1));
  const centres: number[] = [];
  const windows: HalfTwistWindow[] = [];
  let slotsSoFar = 0;
  commits.forEach((commit, position) => {
    const slots = topologicalSlotsFor(commit, children);
    if (twistBefore.has(position)) {
      windows.push([slotsSoFar + TWIST_INSET_SLOTS, slotsSoFar + SLOTS_PER_TWIST - TWIST_INSET_SLOTS]);
      slotsSoFar += SLOTS_PER_TWIST;
    }
    centres.push(slotsSoFar + slots / 2);
    slotsSoFar += slots;
  });
  const t = new Map(commits.map((commit, position) => [commit.sha, centres[position] / slotsSoFar]));
  return { t, t0: t, windows: windows.map(([start, end]) => [start / slotsSoFar, end / slotsSoFar]) };
}

function chronologicalBounds(graph: Graph): [earliest: number, latest: number] {
  const earliest = graph.since === null ? graph.commits.reduce((soFar, commit) => Math.min(soFar, commit.earliestCommittedAt), Infinity) : graph.since;
  const latest = graph.until === null ? graph.commits.reduce((soFar, commit) => Math.max(soFar, commit.committedAt), -Infinity) : graph.until;
  return [earliest, latest];
}

function nextDistinctTimes(times: number[]): Map<number, number> {
  const sorted = [...times].sort((a, b) => a - b);
  return new Map(sorted.map((time, rank) => [time, sorted[rank + 1]]));
}

function chronologicalTwistWindows(graph: Graph, times: number[], twistEvery: number): HalfTwistWindow[] {
  const nextTime = nextDistinctTimes(times);
  const noCommitInside = (gap: number) => times[gap + 1] > times[gap] && nextTime.get(times[gap]) === times[gap + 1];
  const windows: HalfTwistWindow[] = [];
  for (const gap of twistGaps(graph, twistEvery, noCommitInside)) {
    const [before, after] = [times[gap], times[gap + 1]];
    const padding = (after - before) * TWIST_PADDING_SHARE_OF_GAP;
    if (after > before) windows.push([before + padding, after - padding]);
  }
  return windows;
}

function chronologicalPositions(graph: Graph, twistEvery: number): TimePositions {
  const commits = graph.commits;
  const [earliest, latest] = chronologicalBounds(graph);
  if (!(latest > earliest)) return allInTheMiddle(commits);
  const span = latest - earliest;
  const fractionAt = (timestamp: number) => clamp((timestamp - earliest) / span, 0, 1);
  const times = commits.map((commit) => fractionAt(commit.committedAt));
  const t = new Map(commits.map((commit, position) => [commit.sha, times[position]]));
  const t0 = new Map(commits.map((commit) => [commit.sha, fractionAt(commit.earliestCommittedAt)]));
  return { t, t0, windows: chronologicalTwistWindows(graph, times, twistEvery) };
}

export function timePositions(graph: Graph, mode: TimeMode, twistEvery = 0): TimePositions {
  if (!isOneOf(TIME_MODES, mode)) throw new Error(`unknown time mode ${mode}; choose from ${TIME_MODES.join(", ")}`);
  return mode === "topological" ? topologicalPositions(graph, twistEvery) : chronologicalPositions(graph, twistEvery);
}
