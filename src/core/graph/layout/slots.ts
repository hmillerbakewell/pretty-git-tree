import type { Options } from "../../model.ts";
import { chainNumberBySha } from "../queries.ts";
import type { Span } from "./chains.ts";

type Interval = [start: number, end: number];

const TRUNK_SLOT = 0;
const TRUNK_CHAIN = 0;
const WHOLE_TIME_AXIS: Interval = [0, 1];
const FIRST_SIDE = 1;

function* slotsNearestTheTrunkFirst(arrange: Options["arrange"], preferredSign: number): Generator<number> {
  for (let distance = 1; ; distance++) {
    if (arrange === "edge") yield distance;
    else {
      yield distance * preferredSign;
      yield -distance * preferredSign;
    }
  }
}

class SlotOccupancy {
  private readonly intervalsBySlot = new Map<number, Interval[]>([[TRUNK_SLOT, [WHOLE_TIME_AXIS]]]);
  private readonly minimumGap: number;

  constructor(minimumGap: number) {
    this.minimumGap = minimumGap;
  }

  fits(slot: number, start: number, end: number): boolean {
    const intervals = this.intervalsBySlot.get(slot) ?? [];
    return intervals.every(([takenStart, takenEnd]) => end + this.minimumGap <= takenStart || takenEnd + this.minimumGap <= start);
  }

  firstFree(arrange: Options["arrange"], preferredSign: number, start: number, end: number): number {
    for (const slot of slotsNearestTheTrunkFirst(arrange, preferredSign)) if (this.fits(slot, start, end)) return slot;
    return TRUNK_SLOT;
  }

  occupy(slot: number, interval: Interval): void {
    const intervals = this.intervalsBySlot.get(slot);
    if (intervals) intervals.push(interval);
    else this.intervalsBySlot.set(slot, [interval]);
  }
}

const shortLivedFirstThenByStart = (spans: Span[]): number[] =>
  spans
    .map((_, chainNumber) => chainNumber)
    .filter((chainNumber) => chainNumber !== TRUNK_CHAIN)
    .sort((a, b) => Number(spans[a].leavesThroughRightEdge) - Number(spans[b].leavesThroughRightEdge) || spans[a].start - spans[b].start);

export function assignSlots(chains: string[][], spans: Span[], arrange: Options["arrange"], minimumGap: number): number[] {
  const chainOf = chainNumberBySha(chains);
  const slotOfChain = new Array<number>(chains.length).fill(TRUNK_SLOT);
  const occupancy = new SlotOccupancy(minimumGap);
  let lastSideOffTrunk = -FIRST_SIDE;
  for (const chainNumber of shortLivedFirstThenByStart(spans)) {
    const { start, end, forkParent } = spans[chainNumber];
    const parentChain = forkParent === undefined ? undefined : chainOf.get(forkParent);
    const parentSlot = parentChain === undefined ? TRUNK_SLOT : slotOfChain[parentChain];
    const preferredSign = parentSlot ? Math.sign(parentSlot) : -lastSideOffTrunk;
    const slot = occupancy.firstFree(arrange, preferredSign, start, end);
    occupancy.occupy(slot, [start, end]);
    slotOfChain[chainNumber] = slot;
    if (parentSlot === TRUNK_SLOT) lastSideOffTrunk = Math.sign(slot);
  }
  return slotOfChain;
}
