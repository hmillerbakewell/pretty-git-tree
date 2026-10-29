import type { Graph } from "../../model.ts";
import type { LayoutView, PlacedCommit, PlacedLane } from "../../style/view.ts";
import { boundaryCircles, connectedComponents } from "./topology.ts";

export type BandKind = "fork" | "merge";

export interface End {
  readonly disk: number;
  readonly timeFraction: number;
  readonly order: number;
  readonly onHighEdge: boolean;
}

export interface RibbonBand {
  readonly kind: BandKind;
  readonly ends: readonly [End, End];
}

export interface Disk {
  readonly slot: number;
  readonly start: number;
  readonly end: number;
  readonly isStub: boolean;
}

export interface Tab extends End {
  readonly kind: BandKind;
}

export interface Surface {
  readonly disks: readonly Disk[];
  readonly bands: readonly RibbonBand[];
  readonly tabs: readonly Tab[];
  readonly euler: number;
  readonly boundaries: number;
  readonly components: number;
  readonly genus: number;
}

const BRANCH_STARTS = 0;
const MERGE_COMES_IN = 1;
const BAND_GOES_OUT = 2;

interface PendingEnd {
  readonly disk: number;
  readonly timeFraction: number;
  readonly onHighEdge: boolean;
  readonly phase: number;
  readonly rank: number;
}

interface PendingBand {
  readonly kind: BandKind;
  readonly ends: readonly [PendingEnd, PendingEnd];
}

interface Reference {
  readonly child: PlacedCommit;
  readonly kind: BandKind;
}

interface Stub {
  readonly sha: string;
  readonly references: readonly Reference[];
  readonly start: number;
  readonly end: number;
  readonly onHighSide: boolean;
}

function referencesToBeforeRange(graph: Graph, placedBySha: ReadonlyMap<string, PlacedCommit>): Map<string, Reference[]> {
  const references = new Map<string, Reference[]>();
  for (const commit of graph.commits) {
    const child = placedBySha.get(commit.sha);
    if (!child) continue;
    commit.parents.forEach((parent, index) => {
      if (placedBySha.has(parent)) return;
      references.set(parent, [...(references.get(parent) ?? []), { child, kind: index ? "merge" : "fork" }]);
    });
  }
  return references;
}

function stubOf(sha: string, references: readonly Reference[], view: LayoutView): Stub {
  const times = references.map(({ child }) => child.timeFraction);
  const meanSlot = references.reduce((sum, { child }) => sum + child.slot, 0) / references.length;
  return { sha, references, start: Math.min(...times), end: Math.max(...times), onHighSide: meanSlot > (view.lowestSlot + view.highestSlot) / 2 };
}

function stubRows(stubs: readonly Stub[], view: LayoutView): number[] {
  const clearance = 2 / Math.max(view.layout.placements.length, 1);
  const rows = new Map<number, [start: number, end: number][]>();
  const isFree = (slot: number, stub: Stub) => (rows.get(slot) ?? []).every(([start, end]) => stub.end + clearance < start || end + clearance < stub.start);
  return stubs.map((stub) => {
    let distance = 1;
    const slotAt = () => (stub.onHighSide ? view.highestSlot + distance : view.lowestSlot - distance);
    while (!isFree(slotAt(), stub)) distance++;
    const slot = slotAt();
    rows.set(slot, [...(rows.get(slot) ?? []), [stub.start, stub.end]]);
    return slot;
  });
}

function laneDisk(lane: PlacedLane): Disk {
  const first = lane.commits[0];
  const last = lane.commits.at(-1);
  return { slot: lane.slot, start: first?.timeFraction ?? 0, end: last?.timeFraction ?? 0, isStub: false };
}

const mergeRank = (child: PlacedCommit, parentSha: string) => child.commit.parents.indexOf(parentSha);

function bandBetween(disks: readonly Disk[], kind: BandKind, from: number, to: number, timeFraction: number, rank: number): PendingBand {
  const sameDisk = from === to;
  const upwards = disks[to].slot > disks[from].slot || sameDisk;
  return {
    kind,
    ends: [
      { disk: from, timeFraction, onHighEdge: upwards, phase: BAND_GOES_OUT, rank },
      { disk: to, timeFraction, onHighEdge: !upwards || sameDisk, phase: kind === "fork" ? BRANCH_STARTS : MERGE_COMES_IN, rank },
    ],
  };
}

function layoutBands(view: LayoutView, disks: readonly Disk[], diskOfLane: ReadonlyMap<PlacedLane, number>): PendingBand[] {
  return view.edges.flatMap((edge) => {
    const { parent, child, kind } = edge;
    if (!parent || kind === "line") return [];
    const from = diskOfLane.get(parent.lane);
    const to = diskOfLane.get(child.lane);
    if (from === undefined || to === undefined) return [];
    const when = (kind === "fork" ? parent : child).timeFraction;
    return [bandBetween(disks, kind, from, to, when, kind === "fork" ? child.timeFraction : mergeRank(child, parent.sha))];
  });
}

function stubBands(stubs: readonly Stub[], firstStubDisk: number, disks: readonly Disk[], diskOfLane: ReadonlyMap<PlacedLane, number>): PendingBand[] {
  return stubs.flatMap((stub, index) =>
    stub.references.flatMap(({ child, kind }) => {
      const to = diskOfLane.get(child.lane);
      if (to === undefined) return [];
      const rank = kind === "fork" ? child.timeFraction : mergeRank(child, stub.sha);
      return [bandBetween(disks, kind, firstStubDisk + index, to, child.timeFraction, rank)];
    }),
  );
}

function tabEnds(onceUsed: readonly Reference[], disks: readonly Disk[], diskOfLane: ReadonlyMap<PlacedLane, number>): (PendingEnd & { kind: BandKind })[] {
  return onceUsed.flatMap(({ child, kind }) => {
    const disk = diskOfLane.get(child.lane);
    if (disk === undefined) return [];
    const phase = kind === "fork" ? BRANCH_STARTS : MERGE_COMES_IN;
    const rank = kind === "fork" ? 0 : child.commit.parents.length;
    return [{ disk, timeFraction: child.timeFraction, onHighEdge: disks[disk].slot >= 0, phase, rank, kind }];
  });
}

function orderAtSameMoment(ends: readonly PendingEnd[]): Map<PendingEnd, number> {
  const crowds = new Map<string, PendingEnd[]>();
  for (const end of ends) {
    const key = `${end.disk}:${end.onHighEdge}:${end.timeFraction}`;
    crowds.set(key, [...(crowds.get(key) ?? []), end]);
  }
  const order = new Map<PendingEnd, number>();
  for (const crowd of crowds.values()) {
    crowd
      .sort((a, b) => a.phase - b.phase || a.rank - b.rank)
      .forEach((end, position) => {
        order.set(end, position);
      });
  }
  return order;
}

const settle = (end: PendingEnd, order: ReadonlyMap<PendingEnd, number>): End => ({
  disk: end.disk,
  timeFraction: end.timeFraction,
  order: order.get(end) ?? 0,
  onHighEdge: end.onHighEdge,
});

const stretchToEnds = (disks: readonly Disk[], ends: readonly PendingEnd[]): Disk[] =>
  disks.map((disk, index) => {
    const times = ends.filter((end) => end.disk === index).map((end) => end.timeFraction);
    return { ...disk, start: Math.min(disk.start, ...times), end: Math.max(disk.end, ...times) };
  });

export function ribbonSurface(graph: Graph, view: LayoutView): Surface {
  const placedBySha = new Map(view.commits.map((commit) => [commit.sha, commit]));
  const references = [...referencesToBeforeRange(graph, placedBySha)];
  const onceUsed = references.filter(([, uses]) => uses.length === 1).map(([, [use]]) => use);
  const stubs = references
    .filter(([, uses]) => uses.length > 1)
    .map(([sha, uses]) => stubOf(sha, uses, view))
    .sort((a, b) => a.start - b.start);
  const slots = stubRows(stubs, view);
  const placedDisks = [
    ...view.lanes.map(laneDisk),
    ...stubs.map((stub, index): Disk => ({ slot: slots[index], start: stub.start, end: stub.end, isStub: true })),
  ];
  const diskOfLane = new Map(view.lanes.map((lane, index) => [lane, index]));
  const pendingBands = [...layoutBands(view, placedDisks, diskOfLane), ...stubBands(stubs, view.lanes.length, placedDisks, diskOfLane)];
  const pendingTabs = tabEnds(onceUsed, placedDisks, diskOfLane);
  const allEnds = [...pendingBands.flatMap((band) => band.ends), ...pendingTabs];
  const order = orderAtSameMoment(allEnds);
  const disks = stretchToEnds(placedDisks, allEnds);
  const bands = pendingBands.map((band): RibbonBand => ({ kind: band.kind, ends: [settle(band.ends[0], order), settle(band.ends[1], order)] }));
  const tabs = pendingTabs.map((tab): Tab => ({ ...settle(tab, order), kind: tab.kind }));
  const euler = disks.length - bands.length;
  const boundaries = boundaryCircles(disks.length, bands);
  const components = connectedComponents(disks.length, bands);
  return { disks, bands, tabs, euler, boundaries, components, genus: (2 * components - euler - boundaries) / 2 };
}
