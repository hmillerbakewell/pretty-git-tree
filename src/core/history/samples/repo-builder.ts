import type { LogCommit } from "../../model.ts";
import { seededRandom } from "../../util/random.ts";
import { type Log, orderCommits } from "../log.ts";

const FIXED_CLOCK_START = Date.UTC(2026, 0, 1, 12) / 1000;
const SECONDS_PER_HOUR = 3600;
const DEFAULT_HOURS_BETWEEN_COMMITS = 24;
const SHA_HEX_DIGITS = 40;

export interface Rng {
  random(): number;
  intInclusive(lowest: number, highestInclusive: number): number;
  choice<T>(choices: readonly T[]): T;
}

export function rng(seed: number): Rng {
  const next = seededRandom(seed);
  return {
    random: next,
    intInclusive: (lowest, highestInclusive) => lowest + Math.floor(next() * (highestInclusive - lowest + 1)),
    choice: (choices) => choices[Math.floor(next() * choices.length)],
  };
}

export interface SampleCommit extends LogCommit {
  subject: string;
}

type Ref = [name: string, sha: string];

const refsUnder = (prefix: string, shaByName: Map<string, string>): Ref[] => [...shaByName].map(([name, sha]): Ref => [`${prefix}${name}`, sha]);

export class RepoBuilder {
  commits: SampleCommit[] = [];
  branches = new Map<string, string>();
  tags = new Map<string, string>();
  remotes = new Map<string, string>();
  current = "main";
  private now = FIXED_CLOCK_START;
  private secondsBetweenCommits: number;

  constructor(stepHours = DEFAULT_HOURS_BETWEEN_COMMITS) {
    this.secondsBetweenCommits = stepHours * SECONDS_PER_HOUR;
  }

  get head(): string | undefined {
    return this.branches.get(this.current);
  }

  private requireHead(): string {
    const head = this.head;
    if (!head) throw new Error(`branch ${this.current} has no commits yet`);
    return head;
  }

  private add(subject: string, parents: string[]): string {
    this.now += this.secondsBetweenCommits;
    const sha = (this.commits.length + 1).toString(16).padStart(SHA_HEX_DIGITS, "0");
    this.commits.push({ sha, parents, committedAt: this.now, subject });
    this.branches.set(this.current, sha);
    return sha;
  }

  private resolve(name: string): string {
    const sha = this.branches.get(name);
    if (!sha) throw new Error(`no branch ${name}`);
    return sha;
  }

  commit(subject: string): string {
    return this.add(subject, this.head ? [this.head] : []);
  }

  branch(name: string, start?: string): void {
    const from = start ? this.resolve(start) : this.head;
    if (from) this.branches.set(name, from);
    this.current = name;
  }

  checkout(name: string): void {
    this.resolve(name);
    this.current = name;
  }

  merge(names: string | string[], message?: string): string {
    const merged = typeof names === "string" ? [names] : names;
    return this.add(message ?? `Merge ${merged.join(", ")}`, [this.requireHead(), ...merged.map((name) => this.resolve(name))]);
  }

  delete(name: string): void {
    this.branches.delete(name);
  }

  tag(name: string): void {
    this.tags.set(name, this.requireHead());
  }

  remoteRef(name: string, sha = this.requireHead()): void {
    this.remotes.set(name, sha);
  }

  refs(): [string, string][] {
    return [...refsUnder("refs/heads/", this.branches), ...refsUnder("refs/remotes/origin/", this.remotes), ...refsUnder("refs/tags/", this.tags)];
  }

  private reachableFromRefs(): Set<string> {
    const parentsOf = new Map(this.commits.map((commit) => [commit.sha, commit.parents]));
    const reached = new Set<string>();
    const toVisit = this.refs().map(([, sha]) => sha);
    for (let sha = toVisit.pop(); sha !== undefined; sha = toVisit.pop()) {
      if (reached.has(sha)) continue;
      reached.add(sha);
      toVisit.push(...(parentsOf.get(sha) ?? []));
    }
    return reached;
  }

  log(): Log {
    const reached = this.reachableFromRefs();
    const commits = this.commits.filter((commit) => reached.has(commit.sha)).map(({ sha, parents, committedAt }) => ({ sha, parents, committedAt }));
    return { commits: orderCommits(commits), head: this.head ?? null };
  }
}
