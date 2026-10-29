import type { Graph } from "../../model.ts";
import type { LayoutView, PlacedCommit } from "../../style/view.ts";

export interface Carried {
  readonly total: ReadonlyMap<PlacedCommit, number>;
  readonly addedByMerge: (merge: PlacedCommit, mergedParent: PlacedCommit) => number;
}

const HEX_DIGIT_BITS = 4;

function parentsFirst(graph: Graph, view: LayoutView): PlacedCommit[] {
  const placedByCommit = new Map(view.commits.map((placed) => [placed.commit, placed]));
  return graph.commits.flatMap((commit) => placedByCommit.get(commit) ?? []);
}

function weightOfSet(members: bigint, weights: readonly number[]): number {
  const digits = members.toString(16);
  let sum = 0;
  for (let digitIndex = 0; digitIndex < digits.length; digitIndex++) {
    let digit = parseInt(digits[digits.length - 1 - digitIndex], 16);
    for (let bit = HEX_DIGIT_BITS * digitIndex; digit; digit >>= 1, bit++) if (digit & 1) sum += weights[bit];
  }
  return sum;
}

export function carriedWeights(graph: Graph, view: LayoutView): Carried {
  const ordered = parentsFirst(graph, view);
  const position = new Map(ordered.map((commit, index) => [commit, index]));
  const weights = ordered.map((commit) => commit.weight);
  const ancestors: bigint[] = [];
  const totals: number[] = [];
  const added = new Map<PlacedCommit, Map<PlacedCommit, number>>();
  ordered.forEach((commit, index) => {
    const firstParent = commit.firstParentInRange && position.get(commit.firstParentInRange);
    let members = firstParent === undefined ? 0n : ancestors[firstParent];
    let total = firstParent === undefined ? 0 : totals[firstParent];
    const addedByParent = new Map<PlacedCommit, number>();
    for (const mergedParent of commit.parentsInRange.filter((parent) => parent !== commit.firstParentInRange)) {
      const mergedPosition = position.get(mergedParent);
      if (mergedPosition === undefined) continue;
      const more = weightOfSet(ancestors[mergedPosition] & ~members, weights);
      addedByParent.set(mergedParent, more);
      total += more;
      members |= ancestors[mergedPosition];
    }
    added.set(commit, addedByParent);
    ancestors.push(members | (1n << BigInt(index)));
    totals.push(total + weights[index]);
  });
  return {
    total: new Map(ordered.map((commit, index) => [commit, totals[index]])),
    addedByMerge: (merge, mergedParent) => added.get(merge)?.get(mergedParent) ?? 0,
  };
}
