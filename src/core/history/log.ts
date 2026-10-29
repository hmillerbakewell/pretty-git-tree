import type { LogCommit } from "../model.ts";

const SHA_COMMITTER_TIME_PARENTS_AND_HEAD_MARKER = "%H %ct %P%d";

export interface LogRequest {
  refs?: string[];
  excludeGlobs?: string[];
  since?: string;
  until?: string;
}

const allRefsExceptGlobs = (globs: string[]): string[] => [...globs.map((glob) => `--exclude=refs/*/${glob}`), "--all"];

export function logArgs(request: LogRequest = {}): string[] {
  return [
    "log",
    ...(request.refs?.length ? request.refs : allRefsExceptGlobs(request.excludeGlobs ?? [])),
    "--no-color",
    "--decorate-refs=HEAD",
    ...(request.since ? [`--since=${request.since}`] : []),
    ...(request.until ? [`--until=${request.until}`] : []),
    `--format=${SHA_COMMITTER_TIME_PARENTS_AND_HEAD_MARKER}`,
  ];
}

const SAFE_UNQUOTED = /^[\w=.:-]+$/;

const shellQuoted = (argument: string): string => (SAFE_UNQUOTED.test(argument) ? argument : `'${argument.replace(/'/g, `'\\''`)}'`);

export const logCommand = (request: LogRequest = {}): string => `git ${logArgs(request).map(shellQuoted).join(" ")}`;

export interface Log {
  commits: LogCommit[];
  head: string | null;
}

const SHA = "(?:[0-9a-f]{64}|[0-9a-f]{40})(?![0-9a-f])";

const COMMIT_LINE_IGNORING_ANY_TRAILING_NAMES = new RegExp(`^(${SHA}) (\\d+)((?: ${SHA})*)(?: \\(HEAD\\b)?`);

const HEAD_MARKER = "(HEAD";

export function parseLog(text: string): Log {
  const commits: LogCommit[] = [];
  let head: string | null = null;
  for (const line of text.split(/\r?\n/)) {
    const match = COMMIT_LINE_IGNORING_ANY_TRAILING_NAMES.exec(line.trim());
    if (!match) continue;
    const [matched, sha, committerTime, parents] = match;
    if (matched.endsWith(HEAD_MARKER)) head = sha;
    commits.push({ sha, parents: parents.split(" ").filter(Boolean), committedAt: Number(committerTime) });
  }
  return { commits: orderCommits(commits), head };
}

export const formatLog = (log: Log): string =>
  log.commits
    .map((commit) => [commit.sha, commit.committedAt, ...commit.parents].join(" ") + (commit.sha === log.head ? " (HEAD)" : ""))
    .reverse()
    .join("\n");

function childCounts<C extends LogCommit>(commits: C[]): Map<string, number> {
  const pending = new Map<string, number>(commits.map((commit) => [commit.sha, 0]));
  for (const commit of commits) {
    for (const parent of new Set(commit.parents)) {
      const count = pending.get(parent);
      if (count !== undefined) pending.set(parent, count + 1);
    }
  }
  return pending;
}

const newestLastSoPoppedFirst = <C extends LogCommit>(commits: C[]): C[] => [...commits].sort((a, b) => a.committedAt - b.committedAt);

export function orderCommits<C extends LogCommit>(commits: C[]): C[] {
  const index = new Map(commits.map((commit) => [commit.sha, commit]));
  const childrenNotYetOut = childCounts(commits);
  const toVisit = newestLastSoPoppedFirst(commits.filter((commit) => childrenNotYetOut.get(commit.sha) === 0));
  const childrenFirst: C[] = [];
  for (let commit = toVisit.pop(); commit !== undefined; commit = toVisit.pop()) {
    childrenFirst.push(commit);
    for (const parent of new Set(commit.parents)) {
      const remaining = childrenNotYetOut.get(parent);
      if (remaining === undefined) continue;
      childrenNotYetOut.set(parent, remaining - 1);
      const parentCommit = index.get(parent);
      if (remaining === 1 && parentCommit) toVisit.push(parentCommit);
    }
  }
  return childrenFirst.reverse();
}
