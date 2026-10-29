import type { Commit, Graph } from "../model.ts";

export const weight = (commit: Commit): number => commit.fusedShas.length;

export const commitsBySha = (graph: Graph): Map<string, Commit> => new Map(graph.commits.map((commit) => [commit.sha, commit]));

export const chainNumberBySha = (chains: string[][]): Map<string, number> =>
  new Map(chains.flatMap((chain, chainNumber) => chain.map((sha) => [sha, chainNumber] as const)));

export function childrenOf(graph: Graph): Map<string, string[]> {
  const childrenBySha = new Map<string, string[]>(graph.commits.map((commit) => [commit.sha, []]));
  for (const commit of graph.commits) {
    for (const parent of commit.parents) childrenBySha.get(parent)?.push(commit.sha);
  }
  return childrenBySha;
}
