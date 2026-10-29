import type { Graph, TimeMode } from "../../model.ts";
import type { PlacedCommit } from "../../style/view.ts";
import { clamp } from "../../util/maths.ts";
import { seededRandom, seedFromText } from "../../util/random.ts";
import { calendarCuts, interpolateThrough } from "./periods.ts";

export const PITH_REACH = 0.035;
const FEWEST_RINGS = 8;
const MOST_RINGS = 40;
const TOPOLOGICAL_WIDTH_JITTER = 0.3;
const QUIET_RING_SHARE_OF_AVERAGE = 0.3;

export interface Growth {
  readonly radii: readonly number[];
  readonly reachAt: (timeFraction: number) => number;
}

const evenRadii = (ringCount: number) => Array.from({ length: ringCount + 1 }, (_, ring) => PITH_REACH + ((1 - PITH_REACH) * ring) / ringCount);

function radiiFromWidths(widths: readonly number[], totalWidth: number): number[] {
  const radii = [PITH_REACH];
  for (const width of widths) radii.push(radii[radii.length - 1] + ((1 - PITH_REACH) * width) / totalWidth);
  radii[widths.length] = 1;
  return radii;
}

const totalWeight = (commits: readonly PlacedCommit[]) => commits.reduce((sum, commit) => sum + commit.weight, 0);

function rangeSpan(graph: Graph): [start: number, end: number] {
  const start = graph.since ?? graph.commits.reduce((earliest, commit) => Math.min(earliest, commit.earliestCommittedAt ?? commit.committedAt), Infinity);
  const end = graph.until ?? graph.commits.reduce((latest, commit) => Math.max(latest, commit.committedAt), -Infinity);
  return [start, end];
}

function weightInRing(commit: PlacedCommit, ringStart: number, ringEnd: number, isLastRing: boolean): number {
  const { timeFraction: runEnd, runStartTimeFraction: runStart, weight } = commit;
  if (runEnd > runStart) return (weight * Math.max(0, Math.min(ringEnd, runEnd) - Math.max(ringStart, runStart))) / (runEnd - runStart);
  return runEnd >= ringStart && (runEnd < ringEnd || isLastRing) ? weight : 0;
}

function calendarGrowth(commits: readonly PlacedCommit[], [start, end]: [number, number], cuts: readonly number[]): Growth {
  const bounds = [0, ...cuts.map((cut) => (cut - start) / (end - start)), 1];
  const ringCount = bounds.length - 1;
  const loads = bounds
    .slice(1)
    .map((ringEnd, ring) => commits.reduce((load, commit) => load + weightInRing(commit, bounds[ring], ringEnd, ring === ringCount - 1), 0));
  const total = totalWeight(commits);
  const quietGrowth = (QUIET_RING_SHARE_OF_AVERAGE * total) / ringCount;
  const radii = radiiFromWidths(
    loads.map((load) => load + quietGrowth),
    total + quietGrowth * ringCount,
  );
  return { radii, reachAt: interpolateThrough(bounds, radii) };
}

function topologicalGrowth(commits: readonly PlacedCommit[]): Growth {
  const total = totalWeight(commits);
  const ringCount = clamp(Math.round(2 * Math.sqrt(total)), FEWEST_RINGS, MOST_RINGS);
  const grain = seededRandom(seedFromText(`${total}:${commits.length}`));
  const widths = Array.from({ length: ringCount }, () => 1 - TOPOLOGICAL_WIDTH_JITTER + 2 * TOPOLOGICAL_WIDTH_JITTER * grain());
  const radii = radiiFromWidths(
    widths,
    widths.reduce((sum, width) => sum + width, 0),
  );
  const throughRings = interpolateThrough(evenRadii(ringCount), radii);
  let weightSoFar = 0;
  const shareSoFar = commits.map((commit) => {
    weightSoFar += commit.weight;
    return PITH_REACH + ((1 - PITH_REACH) * (weightSoFar - 0.5)) / total;
  });
  const countThrough = interpolateThrough([0, ...commits.map((commit) => commit.timeFraction), 1], [PITH_REACH, ...shareSoFar, 1]);
  return { radii, reachAt: (timeFraction) => throughRings(countThrough(timeFraction)) };
}

function readableCalendarGrowth(graph: Graph, commits: readonly PlacedCommit[]): Growth | undefined {
  const isInstant = commits.every((commit) => commit.timeFraction === commits[0].timeFraction);
  if (isInstant) return undefined;
  const span = rangeSpan(graph);
  const cuts = calendarCuts(span[0], span[1], MOST_RINGS);
  return cuts && calendarGrowth(commits, span, cuts);
}

export function ringGrowth(graph: Graph, commitsInTimeOrder: readonly PlacedCommit[], timeMode: TimeMode): Growth {
  if (commitsInTimeOrder.length === 0) return { radii: evenRadii(FEWEST_RINGS), reachAt: (timeFraction) => PITH_REACH + (1 - PITH_REACH) * timeFraction };
  const calendar = timeMode === "chronological" ? readableCalendarGrowth(graph, commitsInTimeOrder) : undefined;
  return calendar ?? topologicalGrowth(commitsInTimeOrder);
}
