export type Sha = string;

export type UnixSeconds = number;

export type TimeFraction = number;

export type ColourIndex = number;

export type SlotAcrossBand = number;

export type HalfTwistWindow = [start: TimeFraction, end: TimeFraction];

export interface LogCommit {
  sha: Sha;
  parents: Sha[];
  committedAt: UnixSeconds;
}

export interface Commit extends LogCommit {
  fusedShas: Sha[];
  earliestCommittedAt: UnixSeconds;
}

export interface Graph {
  commits: Commit[];
  outOfRangeParents: Sha[];
  continuingAfterRange: Sha[];
  headSha: Sha | null;
  trunkTipSha: Sha | null;
  since: UnixSeconds | null;
  until: UnixSeconds | null;
  repoName: string;
  firstCommittedAt: UnixSeconds | null;
  lastCommittedAt: UnixSeconds | null;
}

export const TIME_MODES = ["topological", "chronological"] as const;

export const ARRANGEMENTS = ["centre", "edge"] as const;

export const ROUTES = ["straight", "fill"] as const;

export type RouteKind = (typeof ROUTES)[number];

export type TimeMode = (typeof TIME_MODES)[number];

export type Arrangement = (typeof ARRANGEMENTS)[number];

export interface Options {
  timeMode: TimeMode;
  arrange: Arrangement;
  route: RouteKind;
  twistEvery: number;
}

const NO_TWISTS = 0;

export const DEFAULT_OPTIONS: Options = { timeMode: "topological", arrange: "centre", route: "straight", twistEvery: NO_TWISTS };

export interface Lane {
  colourIndex: ColourIndex;
  slot: SlotAcrossBand;
  shas: Sha[];
  entersFromLeftEdge: boolean;
  leavesThroughRightEdge: boolean;
}

export type EnteringFromLeftEdge = null;

export interface Edge {
  parent: Sha | EnteringFromLeftEdge;
  child: Sha;
  kind: "line" | "fork" | "merge";
}

export interface Placement {
  sha: Sha;
  colourIndex: ColourIndex;
  slot: SlotAcrossBand;
  timeFraction: TimeFraction;
  runStartTimeFraction: TimeFraction;
}

export interface Layout {
  lanes: Lane[];
  placements: Placement[];
  edges: Edge[];
  options: Options;
  halfTwistWindows: HalfTwistWindow[];
}
