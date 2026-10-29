import type { LayoutView, PlacedCommit, PlacedLane } from "../../style/view.ts";
import { clamp } from "../../util/maths.ts";
import type { Channels } from "./channels.ts";
import type { Carried } from "./flow.ts";
import { bankFacing, edgeFacing } from "./joins.ts";
import { easedShare, type Sample } from "./samples.ts";

const MERGE_WIDTH_SHARE = 0.5;
const THIN_START_IN_HAIRLINES = 3;

export interface Leave {
  readonly merge: PlacedCommit;
  readonly from: number;
  readonly to: number;
  readonly fromAcross: number;
  readonly toAcross: number;
  readonly width: number;
  readonly sweep: boolean;
  readonly outside: boolean;
}

export interface Arrival {
  readonly from: number;
  readonly to: number;
  readonly fromAcross: number;
}

export interface Courses {
  readonly leaves: ReadonlyMap<PlacedLane, Leave>;
  readonly arrivals: ReadonlyMap<PlacedLane, Arrival>;
  readonly at: (commit: PlacedCommit) => Sample;
}

interface Leaving {
  readonly lane: PlacedLane;
  readonly head: PlacedCommit;
  readonly tip: PlacedCommit;
  readonly merge: PlacedCommit;
}

interface LeaveStart {
  readonly from: number;
  readonly fromAcross: number;
  readonly sweep: boolean;
  readonly outside: boolean;
}

interface LeaveAim {
  readonly to: number;
  readonly wanted: number;
  readonly lastWithRoom: number;
  readonly ownAcross: number;
}

type SampleAt = (commit: PlacedCommit) => Sample;

export function mergesByParent(view: LayoutView): Map<PlacedCommit, PlacedCommit[]> {
  const merges = new Map<PlacedCommit, PlacedCommit[]>();
  for (const edge of view.edges) {
    if (edge.kind === "merge" && edge.parent) merges.set(edge.parent, [...(merges.get(edge.parent) ?? []), edge.child]);
  }
  return merges;
}

const aimAt = (target: Sample, fromAcross: number, width: number, outside: boolean): number =>
  outside ? bankFacing(target, fromAcross, width) : edgeFacing(target, fromAcross, width);

function leavingLanes(view: LayoutView, merges: ReadonlyMap<PlacedCommit, readonly PlacedCommit[]>, channels: Channels): Leaving[] {
  const leaving = view.lanes.flatMap((lane) => {
    const head = lane.commits[0];
    const tip = lane.commits.at(-1);
    const merge = tip && !lane.continuesAfterRange ? merges.get(tip)?.[0] : undefined;
    return head && tip && merge ? [{ lane, head, tip, merge }] : [];
  });
  return leaving.sort((earlier, later) => channels.along(later.merge) - channels.along(earlier.merge));
}

function leaveStart({ lane, head, merge }: Leaving, aim: LeaveAim, at: SampleAt, channels: Channels): LeaveStart {
  const headAlong = channels.along(head);
  const fork = head.firstParentInRange;
  const roundTrip = fork !== undefined && fork.lane === merge.lane;
  const tooLate = aim.wanted < headAlong;
  const straight = { fromAcross: aim.ownAcross, sweep: false, outside: false };
  if (fork && tooLate) {
    const forkAlong = channels.along(fork);
    const sweep = roundTrip ? aim.to - forkAlong < channels.bendLength(0) : aim.lastWithRoom === -Infinity;
    if (sweep && roundTrip) return { from: forkAlong, fromAcross: bankFacing(at(fork), aim.ownAcross, channels.hairline), sweep, outside: true };
    if (sweep) return { from: forkAlong, fromAcross: edgeFacing(at(fork), at(merge)[1], channels.hairline), sweep, outside: false };
    if (roundTrip) return { ...straight, from: Math.max(aim.wanted, aim.lastWithRoom, (forkAlong + aim.to) / 2) };
  }
  if (tooLate && lane.entersFromBeforeRange) return { ...straight, from: Math.max(aim.wanted, aim.lastWithRoom, channels.inputStart) };
  return { ...straight, from: clamp(aim.wanted, Math.min(Math.max(headAlong, aim.lastWithRoom), aim.to), aim.to) };
}

function leaveFor(leaving: Leaving, at: SampleAt, channels: Channels, carried: Carried): Leave {
  const { lane, tip, merge } = leaving;
  const to = channels.along(merge);
  const width = channels.widthOf(MERGE_WIDTH_SHARE * Math.min(carried.addedByMerge(merge, tip), channels.flow(tip)));
  const ownAcross = channels.centreOf(lane.slot);
  const wanted = to - channels.bendLength(edgeFacing(at(merge), ownAcross, width) - ownAcross);
  const lastWithRoom =
    lane.commits
      .map(channels.along)
      .filter((along) => along <= to - channels.bendLength(0))
      .at(-1) ?? -Infinity;
  const start = leaveStart(leaving, { to, wanted, lastWithRoom, ownAcross }, at, channels);
  return { merge, ...start, to, toAcross: aimAt(at(merge), start.fromAcross, width, start.outside), width };
}

function slideOntoLeave(lane: PlacedLane, leave: Leave, slid: Map<PlacedCommit, number>, channels: Channels): void {
  for (const commit of lane.commits) {
    const along = channels.along(commit);
    if (along > leave.from) slid.set(commit, leave.fromAcross + (leave.toAcross - leave.fromAcross) * easedShare(along, leave.from, leave.to));
  }
}

function arrivalFor(lane: PlacedLane, leave: Leave | undefined, at: SampleAt, channels: Channels): Arrival | undefined {
  const head = lane.commits[0];
  const fork = head?.firstParentInRange;
  if (!head || !fork || channels.widthOf(channels.flow(head)) > THIN_START_IN_HAIRLINES * channels.hairline) return undefined;
  const headAlong = channels.along(head);
  if (leave && (leave.sweep || headAlong > leave.from)) return undefined;
  const ownAcross = channels.centreOf(lane.slot);
  const fromAcross = edgeFacing(at(fork), ownAcross, channels.hairline);
  const from = channels.along(fork);
  const second = lane.commits[1];
  const next = second ? channels.along(second) : lane.continuesAfterRange ? channels.band.timeAxisEnd : headAlong;
  const limit = Math.min(next, leave?.from ?? Infinity);
  const to = clamp(from + channels.bendLength(ownAcross - fromAcross), headAlong, Math.max(headAlong, limit));
  return to > headAlong ? { from, to, fromAcross } : undefined;
}

function slideOntoArrival(lane: PlacedLane, arrival: Arrival, slid: Map<PlacedCommit, number>, channels: Channels): void {
  const ownAcross = channels.centreOf(lane.slot);
  for (const commit of lane.commits) {
    const along = channels.along(commit);
    if (along < arrival.to) slid.set(commit, arrival.fromAcross + (ownAcross - arrival.fromAcross) * easedShare(along, arrival.from, arrival.to));
  }
}

export function planCourses(view: LayoutView, channels: Channels, carried: Carried, merges: ReadonlyMap<PlacedCommit, readonly PlacedCommit[]>): Courses {
  const slid = new Map<PlacedCommit, number>();
  const at: SampleAt = (commit) => [channels.along(commit), slid.get(commit) ?? channels.centreOf(commit.lane.slot), channels.widthOf(channels.flow(commit))];
  const leaves = new Map<PlacedLane, Leave>();
  for (const leaving of leavingLanes(view, merges, channels)) {
    const leave = leaveFor(leaving, at, channels, carried);
    leaves.set(leaving.lane, leave);
    slideOntoLeave(leaving.lane, leave, slid, channels);
  }
  const arrivals = new Map<PlacedLane, Arrival>();
  for (const lane of view.lanes) {
    const arrival = arrivalFor(lane, leaves.get(lane), at, channels);
    if (!arrival) continue;
    arrivals.set(lane, arrival);
    slideOntoArrival(lane, arrival, slid, channels);
  }
  const reaimed = new Map<PlacedLane, Leave>();
  for (const [lane, leave] of leaves) {
    const aimed = { ...leave, toAcross: aimAt(at(leave.merge), leave.fromAcross, leave.width, leave.outside) };
    reaimed.set(lane, aimed);
    slideOntoLeave(lane, aimed, slid, channels);
  }
  return { leaves: reaimed, arrivals, at };
}
