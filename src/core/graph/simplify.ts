import type { Commit, Graph } from "../model.ts";
import { isOneOf } from "../util/guards.ts";
import { childrenOf, commitsBySha } from "./queries.ts";

export const LEVELS = ["fused", "full"] as const;
export type Level = (typeof LEVELS)[number];
export const DEFAULT_LEVEL: Level = "fused";

type AbsorberOf = Map<string, string>;

function shasKeptOpen(graph: Graph): Set<string> {
  const keptOpen = new Set(graph.continuingAfterRange);
  for (const sha of [graph.headSha, graph.trunkTipSha]) if (sha) keptOpen.add(sha);
  return keptOpen;
}

const isMerge = (commit: Commit) => commit.parents.length > 1;

function canAbsorb(parent: Commit | undefined, children: Map<string, string[]>, keptOpen: Set<string>): parent is Commit {
  if (!parent || isMerge(parent) || keptOpen.has(parent.sha)) return false;
  return children.get(parent.sha)?.length === 1;
}

function absorbParentInto(commit: Commit, parent: Commit): void {
  commit.fusedShas = [...parent.fusedShas, ...commit.fusedShas];
  commit.parents = parent.parents;
  commit.committedAt = Math.max(commit.committedAt, parent.committedAt);
  commit.earliestCommittedAt = Math.min(commit.earliestCommittedAt, parent.earliestCommittedAt);
}

function takeOverParentAsChild(children: Map<string, string[]>, parent: Commit, absorber: Commit): void {
  for (const grandparent of parent.parents) {
    const siblings = children.get(grandparent);
    const withAbsorber = siblings?.map((sibling) => (sibling === parent.sha ? absorber.sha : sibling));
    if (withAbsorber) children.set(grandparent, withAbsorber);
  }
}

function fuseRunsOldestFirst(graph: Graph): AbsorberOf {
  const index = commitsBySha(graph);
  const children = childrenOf(graph);
  const keptOpen = shasKeptOpen(graph);
  const absorberOf: AbsorberOf = new Map();
  for (const commit of graph.commits) {
    if (commit.parents.length !== 1) continue;
    const parentSha = absorberOf.get(commit.parents[0]) ?? commit.parents[0];
    const parent = index.get(parentSha);
    if (!canAbsorb(parent, children, keptOpen)) continue;
    absorbParentInto(commit, parent);
    absorberOf.set(parent.sha, commit.sha);
    takeOverParentAsChild(children, parent, commit);
  }
  return absorberOf;
}

export function simplify(input: Graph, level: Level = DEFAULT_LEVEL): Graph {
  if (!isOneOf(LEVELS, level)) throw new Error(`unknown level ${level}; choose from ${LEVELS.join(", ")}`);
  const graph: Graph = structuredClone(input);
  if (level === "full") return graph;
  const absorberOf = fuseRunsOldestFirst(graph);
  graph.commits = graph.commits.filter((commit) => !absorberOf.has(commit.sha));
  graph.continuingAfterRange = graph.continuingAfterRange.filter((sha) => !absorberOf.has(sha));
  return graph;
}
