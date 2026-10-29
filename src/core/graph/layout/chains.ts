import type { Commit, Graph } from "../../model.ts";
import { childrenOf, commitsBySha } from "../queries.ts";

export interface Span {
  start: number;
  end: number;
  entersFromLeftEdge: boolean;
  leavesThroughRightEdge: boolean;
  forkParent: string | undefined;
}

const OPEN_END = 1;

function tipsTrunkFirstThenNewest(graph: Graph): string[] {
  const newestFirst = graph.commits.map((commit) => commit.sha).reverse();
  return graph.trunkTipSha ? [graph.trunkTipSha, ...newestFirst] : newestFirst;
}

function firstParentOf(commit: Commit, index: Map<string, Commit>): Commit | undefined {
  const firstParent = commit.parents[0];
  return firstParent === undefined ? undefined : index.get(firstParent);
}

function unassignedFirstParentRun(tip: string, index: Map<string, Commit>, assigned: Set<string>): string[] {
  const newestFirst: string[] = [];
  let commit = index.get(tip);
  while (commit && !assigned.has(commit.sha)) {
    newestFirst.push(commit.sha);
    assigned.add(commit.sha);
    commit = firstParentOf(commit, index);
  }
  return newestFirst.reverse();
}

export function buildChains(graph: Graph): string[][] {
  const index = commitsBySha(graph);
  const assigned = new Set<string>();
  const chains: string[][] = [];
  for (const tip of tipsTrunkFirstThenNewest(graph)) {
    if (!assigned.has(tip)) chains.push(unassignedFirstParentRun(tip, index, assigned));
  }
  return chains;
}

function isStillOpen(tip: string, graph: Graph, continues: Set<string>, childrenOfTip: string[]): boolean {
  const pointedAtByARefOnly = childrenOfTip.length === 0;
  return continues.has(tip) || pointedAtByARefOnly || tip === graph.headSha;
}

export function chainSpans(graph: Graph, chains: string[][], t: Map<string, number>): Span[] {
  const index = commitsBySha(graph);
  const children = childrenOf(graph);
  const continues = new Set(graph.continuingAfterRange);
  const timeOf = (sha: string) => t.get(sha) ?? 0;
  return chains.map((chain) => {
    const oldest = chain[0];
    const tip = chain[chain.length - 1];
    const childrenOfTip = children.get(tip) ?? [];
    const forkParent = index.get(oldest)?.parents[0];
    const start = forkParent === undefined ? timeOf(oldest) : timeOf(forkParent);
    const entersFromLeftEdge = forkParent !== undefined && !t.has(forkParent);
    const leavesThroughRightEdge = isStillOpen(tip, graph, continues, childrenOfTip);
    const end = leavesThroughRightEdge ? OPEN_END : Math.max(timeOf(tip), ...childrenOfTip.map(timeOf));
    return { start, end, entersFromLeftEdge, leavesThroughRightEdge, forkParent };
  });
}
