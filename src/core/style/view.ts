import { laneColour, type Theme } from "../draw/themes.ts";
import { laneSlotRange } from "../graph/layout.ts";
import { weight } from "../graph/queries.ts";
import type { Commit, Edge, Graph, Lane, Layout } from "../model.ts";

export interface PlacedLane {
  readonly colourIndex: number;
  readonly colour: string;
  readonly slot: number;
  readonly commits: readonly PlacedCommit[];
  readonly entersFromBeforeRange: boolean;
  readonly continuesAfterRange: boolean;
}

export interface PlacedCommit {
  readonly sha: string;
  readonly commit: Commit;
  readonly lane: PlacedLane;
  readonly slot: number;
  readonly timeFraction: number;
  readonly runStartTimeFraction: number;
  readonly colour: string;
  readonly weight: number;
  readonly isMerge: boolean;
  readonly isHead: boolean;
  readonly parentsInRange: readonly PlacedCommit[];
  readonly firstParentInRange: PlacedCommit | undefined;
  readonly childrenInRange: readonly PlacedCommit[];
}

export interface PlacedEdge {
  readonly parent: PlacedCommit | undefined;
  readonly child: PlacedCommit;
  readonly kind: Edge["kind"];
}

export interface LayoutView {
  readonly layout: Layout;
  readonly lanes: readonly PlacedLane[];
  readonly commits: readonly PlacedCommit[];
  readonly commitsInTimeOrder: readonly PlacedCommit[];
  readonly edges: readonly PlacedEdge[];
  readonly lowestSlot: number;
  readonly highestSlot: number;
}

type Building<T> = { -readonly [K in keyof T]: T[K] extends readonly (infer Item)[] ? Item[] : T[K] };

type PlaceCommit = (sha: string, lane: Building<PlacedLane>) => Building<PlacedCommit> | undefined;

function commitPlacer(graph: Graph, layout: Layout, placedBySha: Map<string, Building<PlacedCommit>>): PlaceCommit {
  const commitBySha = new Map(graph.commits.map((commit) => [commit.sha, commit]));
  const placementBySha = new Map(layout.placements.map((placement) => [placement.sha, placement]));
  return (sha, lane) => {
    const commit = commitBySha.get(sha);
    const placement = placementBySha.get(sha);
    if (!commit || !placement) return undefined;
    const placed: Building<PlacedCommit> = {
      sha,
      commit,
      lane,
      slot: placement.slot,
      timeFraction: placement.timeFraction,
      runStartTimeFraction: placement.runStartTimeFraction,
      colour: lane.colour,
      weight: weight(commit),
      isMerge: commit.parents.length > 1,
      isHead: sha === graph.headSha,
      parentsInRange: [],
      firstParentInRange: undefined,
      childrenInRange: [],
    };
    placedBySha.set(sha, placed);
    return placed;
  };
}

function placeLane(lane: Lane, theme: Theme, placeCommit: PlaceCommit): Building<PlacedLane> {
  const placedLane: Building<PlacedLane> = {
    colourIndex: lane.colourIndex,
    colour: laneColour(theme, lane.colourIndex),
    slot: lane.slot,
    commits: [],
    entersFromBeforeRange: lane.entersFromLeftEdge,
    continuesAfterRange: lane.leavesThroughRightEdge,
  };
  placedLane.commits = lane.shas.flatMap((sha) => placeCommit(sha, placedLane) ?? []);
  return placedLane;
}

function linkParents(placedBySha: ReadonlyMap<string, Building<PlacedCommit>>): void {
  for (const placed of placedBySha.values()) {
    placed.parentsInRange = placed.commit.parents.flatMap((parent) => placedBySha.get(parent) ?? []);
    placed.firstParentInRange = placedBySha.get(placed.commit.parents[0] ?? "");
    for (const parent of placed.parentsInRange) placedBySha.get(parent.sha)?.childrenInRange.push(placed);
  }
}

function placeEdge(edge: Edge, placedBySha: ReadonlyMap<string, PlacedCommit>): PlacedEdge[] {
  const child = placedBySha.get(edge.child);
  const parent = edge.parent === null ? undefined : placedBySha.get(edge.parent);
  const parentMissing = edge.parent !== null && parent === undefined;
  return child && !parentMissing ? [{ parent, child, kind: edge.kind }] : [];
}

export function viewLayout(graph: Graph, layout: Layout, theme: Theme): LayoutView {
  const placedBySha = new Map<string, Building<PlacedCommit>>();
  const placeCommit = commitPlacer(graph, layout, placedBySha);
  const lanes = layout.lanes.map((lane) => placeLane(lane, theme, placeCommit));
  linkParents(placedBySha);
  const edges = layout.edges.flatMap((edge) => placeEdge(edge, placedBySha));
  const [lowestSlot, highestSlot] = laneSlotRange(layout);
  const commits = [...placedBySha.values()];
  const commitsInTimeOrder = [...commits].sort((earlier, later) => earlier.timeFraction - later.timeFraction);
  return { layout, lanes, commits, commitsInTimeOrder, edges, lowestSlot, highestSlot };
}
