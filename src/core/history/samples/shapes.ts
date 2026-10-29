import type { RepoBuilder, Rng } from "./repo-builder.ts";

const LINEAR_COMMITS = 30;
const GITHUB_FLOW_LAST_PULL_REQUEST = 24;
const HOTFIX_ON_MAIN_CHANCE = 0.25;
const BUSY_TEAM_STEPS = 140;
const MOST_PULL_REQUESTS_OPEN_AT_ONCE = 5;
const OPEN_PULL_REQUEST_BELOW = 0.22;
const MERGE_PULL_REQUEST_BELOW = 0.38;
const COMMIT_TO_MAIN_BELOW = 0.42;
const GITFLOW_MINOR_VERSIONS = [2, 3, 4];
const FEATURES_PER_RELEASE = 3;
const LONG_LIVED_ROUNDS = 6;
const OCTOPUS_WAVES = 2;
const OCTOPUS_TOPICS = [..."abcd"];
const OPEN_WORK_BRANCHES = ["feat/search", "feat/dark-mode", "fix/memory-leak", "chore/deps", "feat/export-pdf", "experiment/wasm"];

function commitEach(repo: RepoBuilder, count: number, subjectOf: (step: number) => string): void {
  for (let step = 0; step < count; step++) repo.commit(subjectOf(step));
}

function mergeAndDelete(repo: RepoBuilder, name: string, message?: string): void {
  repo.merge(name, message);
  repo.delete(name);
}

export function linear(repo: RepoBuilder): void {
  commitEach(repo, LINEAR_COMMITS, (step) => `step ${step}`);
}

export function featureBranches(repo: RepoBuilder): void {
  commitEach(repo, 3, (step) => `main ${step}`);
  repo.branch("feature/login");
  commitEach(repo, 4, (step) => `login ${step}`);
  repo.checkout("main");
  repo.commit("main 3");
  repo.branch("spike");
  repo.commit("spike 0");
  repo.checkout("main");
  repo.merge("feature/login");
  repo.branch("feature/search");
  repo.commit("search 0");
  repo.commit("search 1");
  repo.checkout("main");
  repo.commit("main 4");
  repo.delete("feature/login");
}

export function githubFlow(repo: RepoBuilder, rand: Rng): void {
  repo.commit("initial commit");
  for (let pullRequest = 1; pullRequest <= GITHUB_FLOW_LAST_PULL_REQUEST; pullRequest++) {
    const name = `pr-${pullRequest}`;
    repo.branch(name, "main");
    commitEach(repo, rand.intInclusive(1, 4), (step) => `${name}: change ${step}`);
    repo.checkout("main");
    if (rand.random() < HOTFIX_ON_MAIN_CHANCE) repo.commit("hotfix on main");
    mergeAndDelete(repo, name, `Merge pull request #${pullRequest}`);
  }
}

function busyTeamStep(repo: RepoBuilder, rand: Rng, open: string[], openedSoFar: number): number {
  const roll = rand.random();
  if ((roll < OPEN_PULL_REQUEST_BELOW && open.length < MOST_PULL_REQUESTS_OPEN_AT_ONCE) || !open.length) {
    const name = `feat/${String(openedSoFar + 1).padStart(2, "0")}`;
    repo.branch(name, "main");
    open.push(name);
    repo.commit(`${name}: start`);
    return openedSoFar + 1;
  }
  if (roll < MERGE_PULL_REQUEST_BELOW) {
    const name = rand.choice(open);
    repo.checkout("main");
    mergeAndDelete(repo, name);
    open.splice(open.indexOf(name), 1);
  } else if (roll < COMMIT_TO_MAIN_BELOW) {
    repo.checkout("main");
    repo.commit("direct commit to main");
  } else {
    const name = rand.choice(open);
    repo.checkout(name);
    repo.commit(`${name}: work`);
  }
  return openedSoFar;
}

export function busyTeam(repo: RepoBuilder, rand: Rng): void {
  repo.commit("initial commit");
  const open: string[] = [];
  let openedSoFar = 0;
  for (let step = 0; step < BUSY_TEAM_STEPS; step++) openedSoFar = busyTeamStep(repo, rand, open, openedSoFar);
  repo.checkout("main");
}

function mergeIntoMainAndDevelop(repo: RepoBuilder, name: string, tag: string): void {
  repo.checkout("main");
  repo.merge(name);
  repo.tag(tag);
  repo.checkout("develop");
  mergeAndDelete(repo, name);
}

function gitflowRelease(repo: RepoBuilder, rand: Rng, minor: number, featuresSoFar: number): void {
  for (let feature = featuresSoFar + 1; feature <= featuresSoFar + FEATURES_PER_RELEASE; feature++) {
    const name = `feature/f${feature}`;
    repo.branch(name, "develop");
    commitEach(repo, rand.intInclusive(2, 4), (step) => `${name} ${step}`);
    repo.checkout("develop");
    mergeAndDelete(repo, name);
  }
  const release = `release/0.${minor}`;
  repo.branch(release, "develop");
  repo.commit(`bump version to 0.${minor}.0`);
  mergeIntoMainAndDevelop(repo, release, `v0.${minor}.0`);
  if (minor % 2 === 0) {
    const hotfix = `hotfix/0.${minor}.1`;
    repo.branch(hotfix, "main");
    repo.commit("fix crash");
    mergeIntoMainAndDevelop(repo, hotfix, `v0.${minor}.1`);
  }
}

export function gitflow(repo: RepoBuilder, rand: Rng): void {
  repo.commit("initial commit");
  repo.tag("v0.1.0");
  repo.branch("develop");
  GITFLOW_MINOR_VERSIONS.forEach((minor, release) => {
    gitflowRelease(repo, rand, minor, release * FEATURES_PER_RELEASE);
  });
  repo.checkout("main");
}

export function longLived(repo: RepoBuilder, rand: Rng): void {
  commitEach(repo, 3, (step) => `main ${step}`);
  repo.branch("rewrite");
  repo.commit("rewrite: scaffold");
  repo.checkout("main");
  repo.branch("experiment");
  repo.commit("experiment: idea");
  for (let round = 0; round < LONG_LIVED_ROUNDS; round++) {
    repo.checkout("main");
    commitEach(repo, rand.intInclusive(1, 3), (step) => `main work ${round}.${step}`);
    for (const name of ["rewrite", "experiment"]) {
      repo.checkout(name);
      repo.commit(`${name}: progress ${round}`);
      if (round % 2 === 1) repo.merge("main", `Sync main into ${name}`);
    }
  }
  repo.checkout("main");
  mergeAndDelete(repo, "rewrite", "Land the rewrite");
  repo.commit("post-rewrite cleanup");
}

export function octopus(repo: RepoBuilder, rand: Rng): void {
  repo.commit("initial commit");
  for (let wave = 0; wave < OCTOPUS_WAVES; wave++) {
    const names = OCTOPUS_TOPICS.map((topic) => `topic/${wave}-${topic}`);
    for (const name of names) {
      repo.branch(name, "main");
      commitEach(repo, rand.intInclusive(1, 3), (step) => `${name} ${step}`);
    }
    repo.checkout("main");
    repo.commit(`main before wave ${wave}`);
    repo.merge(names, `Octopus merge wave ${wave}`);
    for (const name of names) repo.delete(name);
  }
}

const onlyOnTheRemote = (name: string) => name.startsWith("chore") || name.startsWith("experiment");

export function openWork(repo: RepoBuilder, rand: Rng): void {
  commitEach(repo, 6, (step) => `main ${step}`);
  for (const name of OPEN_WORK_BRANCHES) {
    repo.checkout("main");
    repo.commit("main progress");
    repo.branch(name);
    commitEach(repo, rand.intInclusive(1, 5), (step) => `${name} ${step}`);
    if (onlyOnTheRemote(name)) {
      repo.remoteRef(name);
      repo.checkout("main");
      repo.delete(name);
    }
  }
  repo.checkout("main");
  repo.remoteRef("main");
}
