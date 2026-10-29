import type { LayoutView, PlacedCommit, PlacedEdge, PlacedLane } from "../../style/view.ts";
import { endsOnSlot, type Loom, rowAt, shaftOf } from "./loom.ts";

export type CellState = "asleep" | "alive" | "lifted" | "float";

interface Float {
  readonly row: number;
  readonly colour: string;
  readonly covers: (end: number) => boolean;
  readonly treadle: number;
  readonly shaft: number;
}

export interface Drawdown {
  readonly stateAt: (row: number, end: number) => CellState;
  readonly floatColourAt: (row: number, end: number) => string | undefined;
  readonly weftColourOf: (row: number) => string | undefined;
  readonly lifts: (row: number, shaft: number) => boolean;
  readonly isTied: (treadle: number, shaft: number) => boolean;
}

function childrenInRange(view: LayoutView): Map<PlacedCommit, PlacedCommit[]> {
  const children = new Map<PlacedCommit, PlacedCommit[]>();
  for (const commit of view.commits) {
    for (const parent of commit.parentsInRange) children.set(parent, [...(children.get(parent) ?? []), commit]);
  }
  return children;
}

function laneSpan(lane: PlacedLane, children: ReadonlyMap<PlacedCommit, readonly PlacedCommit[]>): [start: number, end: number] | undefined {
  const first = lane.commits[0];
  const tip = lane.commits.at(-1);
  if (!first || !tip) return undefined;
  const start = lane.entersFromBeforeRange ? 0 : (first.firstParentInRange?.timeFraction ?? first.timeFraction);
  const childTimes = (children.get(tip) ?? []).map((child) => child.timeFraction);
  return [start, lane.continuesAfterRange ? 1 : Math.max(tip.timeFraction, ...childTimes)];
}

function aliveRowsBySlot(view: LayoutView, loom: Loom): Map<number, [first: number, last: number][]> {
  const children = childrenInRange(view);
  const alive = new Map<number, [number, number][]>();
  for (const lane of view.lanes) {
    const span = laneSpan(lane, children);
    if (span) alive.set(lane.slot, [...(alive.get(lane.slot) ?? []), [rowAt(loom, span[0]), rowAt(loom, span[1])]]);
  }
  return alive;
}

function liftedRows(commit: PlacedCommit, loom: Loom): number[] {
  const [oldest, newest] = [commit.runStartTimeFraction, commit.timeFraction];
  if (newest <= oldest) return [rowAt(loom, newest)];
  return Array.from({ length: commit.weight }, (_, index) => rowAt(loom, oldest + ((newest - oldest) * (index + 0.5)) / commit.weight));
}

function liftedRowsBySlot(view: LayoutView, loom: Loom): Map<number, Set<number>> {
  const lifted = new Map<number, Set<number>>();
  for (const commit of view.commits) {
    const rows = lifted.get(commit.slot) ?? new Set<number>();
    for (const row of liftedRows(commit, loom)) rows.add(row);
    lifted.set(commit.slot, rows);
  }
  return lifted;
}

function floatOf(edge: PlacedEdge, loom: Loom): Float | undefined {
  const { parent, child } = edge;
  if (!parent || edge.kind === "line" || parent.slot === child.slot) return undefined;
  const isMerge = edge.kind === "merge";
  const carrierSlot = isMerge ? parent.slot : child.slot;
  const lastOfLower = endsOnSlot(loom, Math.min(parent.slot, child.slot)).at(-1) ?? Number.POSITIVE_INFINITY;
  const firstOfHigher = endsOnSlot(loom, Math.max(parent.slot, child.slot))[0] ?? Number.NEGATIVE_INFINITY;
  return {
    row: rowAt(loom, isMerge ? child.timeFraction : parent.timeFraction),
    colour: loom.slotColours.get(carrierSlot) ?? loom.groundColour,
    covers: (end) => (end > lastOfLower && end < firstOfHigher) || loom.ends[end]?.slot === carrierSlot,
    treadle: shaftOf(loom, child.slot),
    shaft: shaftOf(loom, parent.slot),
  };
}

function floatsByRow(floats: readonly Float[]): Map<number, Float[]> {
  const byRow = new Map<number, Float[]>();
  for (const float of floats) byRow.set(float.row, [...(byRow.get(float.row) ?? []), float]);
  return byRow;
}

export function weaveDrawdown(view: LayoutView, loom: Loom): Drawdown {
  const alive = aliveRowsBySlot(view, loom);
  const lifted = liftedRowsBySlot(view, loom);
  const floats = view.edges.flatMap((edge) => floatOf(edge, loom) ?? []);
  const rowFloats = floatsByRow(floats);
  const ties = new Set(floats.flatMap((float) => [`${float.treadle}:${float.shaft}`, `${float.shaft}:${float.treadle}`]));
  const floatAt = (row: number, end: number) => (rowFloats.get(row) ?? []).findLast((float) => float.covers(end));
  const slotOfEnd = (end: number) => loom.ends[end]?.slot;
  const isLifted = (row: number, slot: number | undefined) => slot !== undefined && (lifted.get(slot)?.has(row) ?? false);
  const isAlive = (row: number, slot: number | undefined) => slot !== undefined && (alive.get(slot) ?? []).some(([first, last]) => row >= first && row <= last);
  return {
    stateAt: (row, end) => {
      if (floatAt(row, end)) return "float";
      if (isLifted(row, slotOfEnd(end))) return "lifted";
      return isAlive(row, slotOfEnd(end)) ? "alive" : "asleep";
    },
    floatColourAt: (row, end) => floatAt(row, end)?.colour,
    weftColourOf: (row) => rowFloats.get(row)?.at(-1)?.colour,
    lifts: (row, shaft) => isLifted(row, shaft + loom.lowestSlot),
    isTied: (treadle, shaft) => ties.has(`${treadle}:${shaft}`),
  };
}
