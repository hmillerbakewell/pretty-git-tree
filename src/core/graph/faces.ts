import type { Commit, Graph } from "../model.ts";

export interface Face {
  merge: string;
  base: string;
  firstParentPath: string[];
  mergedParentPath: string[];
}

export const cycle = (face: Face): string[] => [face.base, ...face.mergedParentPath, face.merge, ...[...face.firstParentPath].reverse()];

export const mergedSide = (face: Face): string => face.mergedParentPath.at(-1) ?? face.base;

export const firstSide = (face: Face): string => face.firstParentPath.at(-1) ?? face.base;

function firstParentPath(sha: string, index: Map<string, Commit>): string[] {
  const path: string[] = [];
  let current = index.get(sha);
  while (current) {
    path.push(current.sha);
    const firstParent = current.parents[0];
    current = firstParent === undefined ? undefined : index.get(firstParent);
  }
  return path;
}

function faceWithMergedParent(merge: Commit, mergedParent: string, firstPath: string[], index: Map<string, Commit>): Face | undefined {
  const stepsAlongFirstPath = new Map(firstPath.map((sha, steps) => [sha, steps]));
  const otherPath = firstParentPath(mergedParent, index);
  const baseAt = otherPath.findIndex((sha) => stepsAlongFirstPath.has(sha));
  if (baseAt < 0) return undefined;
  const base = otherPath[baseAt];
  return {
    merge: merge.sha,
    base,
    firstParentPath: firstPath.slice(0, stepsAlongFirstPath.get(base)).reverse(),
    mergedParentPath: otherPath.slice(0, baseAt).reverse(),
  };
}

export function mergeFaces(graph: Graph): Face[] {
  const index = new Map(graph.commits.map((commit) => [commit.sha, commit]));
  return graph.commits.flatMap((commit) => {
    if (commit.parents.length < 2 || !index.has(commit.parents[0])) return [];
    const firstPath = firstParentPath(commit.parents[0], index);
    return commit.parents.slice(1).flatMap((mergedParent) => faceWithMergedParent(commit, mergedParent, firstPath, index) ?? []);
  });
}

function ancestorMasksInTopologicalOrder(graph: Graph, positionOf: Map<string, number>): bigint[] {
  const ancestors: bigint[] = [];
  graph.commits.forEach((commit, position) => {
    let mask = 1n << BigInt(position);
    for (const parent of commit.parents) {
      const parentPosition = positionOf.get(parent);
      if (parentPosition !== undefined) mask |= ancestors[parentPosition];
    }
    ancestors.push(mask);
  });
  return ancestors;
}

const newestPositionIn = (mask: bigint) => mask.toString(2).length - 1;

export function mergeBases(graph: Graph): Map<string, string> {
  const positionOf = new Map(graph.commits.map((commit, position) => [commit.sha, position]));
  const ancestors = ancestorMasksInTopologicalOrder(graph, positionOf);
  const bases = new Map<string, string>();
  for (const commit of graph.commits) {
    const firstParentPosition = positionOf.get(commit.parents[0]);
    if (commit.parents.length < 2 || firstParentPosition === undefined) continue;
    for (const mergedParent of commit.parents.slice(1)) {
      const mergedPosition = positionOf.get(mergedParent);
      if (mergedPosition === undefined) continue;
      const common = ancestors[firstParentPosition] & ancestors[mergedPosition];
      if (common) bases.set(`${commit.sha}:${mergedParent}`, graph.commits[newestPositionIn(common)].sha);
    }
  }
  return bases;
}
