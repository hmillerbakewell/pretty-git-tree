import type { Graph } from "../../model.ts";
import { childrenOf, weight } from "../queries.ts";

type GapAfterCommit = number;

function quietGaps(graph: Graph): GapAfterCommit[] {
  const children = childrenOf(graph);
  const commits = graph.commits;
  const gaps: GapAfterCommit[] = [];
  for (let gap = 0; gap < commits.length - 1; gap++) {
    const noForkBefore = (children.get(commits[gap].sha)?.length ?? 0) <= 1;
    const noMergeAfter = commits[gap + 1].parents.length <= 1;
    if (noForkBefore && noMergeAfter) gaps.push(gap);
  }
  return gaps;
}

function runningWeights(graph: Graph): number[] {
  let total = 0;
  return graph.commits.map((commit) => {
    total += weight(commit);
    return total;
  });
}

function nearestGap(free: Set<GapAfterCommit>, weightThrough: number[], target: number): GapAfterCommit | undefined {
  let nearest: GapAfterCommit | undefined;
  for (const gap of free) {
    if (nearest === undefined || Math.abs(weightThrough[gap] - target) < Math.abs(weightThrough[nearest] - target)) nearest = gap;
  }
  return nearest;
}

export function twistGaps(graph: Graph, commitsPerTwist: number, usable: (gap: GapAfterCommit) => boolean = () => true): GapAfterCommit[] {
  if (!(commitsPerTwist > 0) || graph.commits.length < 2) return [];
  const weightThrough = runningWeights(graph);
  const totalWeight = weightThrough[weightThrough.length - 1];
  const twistCount = Math.floor(totalWeight / commitsPerTwist);
  const free = new Set(quietGaps(graph).filter(usable));
  const picked: GapAfterCommit[] = [];
  for (let twist = 0; twist < twistCount; twist++) {
    const target = totalWeight / 2 + (twist - (twistCount - 1) / 2) * commitsPerTwist;
    const nearest = nearestGap(free, weightThrough, target);
    if (nearest === undefined) break;
    free.delete(nearest);
    picked.push(nearest);
  }
  return picked.sort((a, b) => a - b);
}
