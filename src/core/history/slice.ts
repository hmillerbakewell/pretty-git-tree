import type { Commit, Graph, LogCommit } from "../model.ts";
import type { Log } from "./log.ts";

export interface Selection {
  since?: number | null;
  until?: number | null;
  repoName?: string;
}

function outOfRangeParents(commits: Commit[], kept: Set<string>): string[] {
  const parents = new Set<string>();
  for (const commit of commits) for (const parent of commit.parents) if (!kept.has(parent)) parents.add(parent);
  return [...parents];
}

function withChildrenAfterRange(log: Log, kept: Set<string>): string[] {
  const continuing = new Set<string>();
  for (const commit of log.commits) {
    if (!kept.has(commit.sha)) for (const parent of commit.parents) if (kept.has(parent)) continuing.add(parent);
  }
  return [...continuing];
}

function newestInRangeOnHeadsFirstParentLine(log: Log, kept: Set<string>): string | null {
  const index = new Map(log.commits.map((commit) => [commit.sha, commit]));
  let commit = log.head === null ? undefined : index.get(log.head);
  while (commit) {
    if (kept.has(commit.sha)) return commit.sha;
    const firstParent = commit.parents[0];
    commit = firstParent === undefined ? undefined : index.get(firstParent);
  }
  return null;
}

function timestampBounds(commits: Commit[]): [first: number | null, last: number | null] {
  if (commits.length === 0) return [null, null];
  const timestamps = commits.map((commit) => commit.committedAt);
  return [timestamps.reduce((soFar, time) => Math.min(soFar, time)), timestamps.reduce((soFar, time) => Math.max(soFar, time))];
}

export function sliceLog(log: Log, range: Selection = {}): Graph {
  const since = range.since ?? null;
  const until = range.until ?? null;
  const inRange = (commit: LogCommit) => (since === null || commit.committedAt >= since) && (until === null || commit.committedAt <= until);
  const commits: Commit[] = log.commits.filter(inRange).map((commit) => ({ ...commit, fusedShas: [commit.sha], earliestCommittedAt: commit.committedAt }));
  const kept = new Set(commits.map((commit) => commit.sha));
  const [first, last] = timestampBounds(commits);
  return {
    commits,
    outOfRangeParents: outOfRangeParents(commits, kept),
    continuingAfterRange: withChildrenAfterRange(log, kept),
    headSha: log.head && kept.has(log.head) ? log.head : null,
    trunkTipSha: newestInRangeOnHeadsFirstParentLine(log, kept),
    since,
    until,
    repoName: range.repoName ?? "",
    firstCommittedAt: first,
    lastCommittedAt: last,
  };
}
