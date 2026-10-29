import type { Log } from "./log.ts";
import { RepoBuilder, type Rng, rng } from "./samples/repo-builder.ts";
import { busyTeam, featureBranches, gitflow, githubFlow, linear, longLived, octopus, openWork } from "./samples/shapes.ts";

export { RepoBuilder, type Rng, rng, type SampleCommit } from "./samples/repo-builder.ts";

const DEFAULT_SEED = 7;

export interface Sample {
  name: string;
  description: string;
  build: (repo: RepoBuilder, rand: Rng) => void;
  stepHours: number;
}

export const SAMPLES: Sample[] = [
  { name: "linear", description: "No branches at all: the minimum case.", build: linear, stepHours: 24 },
  { name: "feature-branches", description: "Small: one merged feature, one open, one stale spike.", build: featureBranches, stepHours: 24 },
  { name: "github-flow", description: "One PR at a time, merged with merge commits.", build: githubFlow, stepHours: 8 },
  { name: "busy-team", description: "Up to five PRs open at once, merged out of order.", build: busyTeam, stepHours: 5 },
  { name: "gitflow", description: "main + develop, releases, hotfixes and tags.", build: gitflow, stepHours: 12 },
  { name: "long-lived", description: "Two long-running branches that sync from main.", build: longLived, stepHours: 24 },
  { name: "octopus", description: "Topic branches landed in octopus merges.", build: octopus, stepHours: 24 },
  { name: "open-work", description: "Lots of unmerged work, some only on the remote.", build: openWork, stepHours: 24 },
];

export function buildSample(name: string, seed = DEFAULT_SEED): RepoBuilder {
  const sample = SAMPLES.find((candidate) => candidate.name === name);
  if (!sample) throw new Error(`unknown sample ${name}; choose from ${SAMPLES.map((candidate) => candidate.name).join(", ")}`);
  const builder = new RepoBuilder(sample.stepHours);
  sample.build(builder, rng(seed));
  return builder;
}

export const sampleLog = (name: string, seed = DEFAULT_SEED): Log => buildSample(name, seed).log();
