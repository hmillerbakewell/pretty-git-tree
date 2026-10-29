import { mix } from "../../draw/colour.ts";
import type { Frame } from "../../draw/frame.ts";
import type { Point } from "../../draw/svg.ts";
import type { Theme } from "../../draw/themes.ts";
import type { LayoutView } from "../../style/view.ts";
import { clamp } from "../../util/maths.ts";

const THREAD_PITCH = 9;
const MOST_ROWS = 220;
const SELVEDGE_ENDS = 2;
const NOTATION_SQUARE = 9;
const SMALLEST_NOTATION_SQUARE = 1.5;
const NOTATION_SHARE = 0.17;
const THREADING_SHARE_OF_NOTATION = 0.6;
const LONGEST_FRINGE = 26;
const FRINGE_SHARE = 0.06;
const NOTATION_GAP = 10;
const PERSLOT_FOR_PLAIN_DIVIDER = 3;
const PERSLOT_FOR_ROUNDED_FIT = 4;

export interface WarpEnd {
  readonly slot: number | undefined;
  readonly colour: string;
}

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface Loom {
  readonly unit: number;
  readonly vertical: boolean;
  readonly ends: readonly WarpEnd[];
  readonly slotColours: ReadonlyMap<number, string>;
  readonly groundColour: string;
  readonly lowestSlot: number;
  readonly slotCount: number;
  readonly rowCount: number;
  readonly rowPitch: number;
  readonly endPitch: number;
  readonly clothStart: number;
  readonly clothLength: number;
  readonly firstEnd: number;
  readonly clothWidth: number;
  readonly notationSquare: number;
  readonly threadingSquare: number;
  readonly gap: number;
  readonly fringe: number;
}

export const shaftOf = (loom: Loom, slot: number) => slot - loom.lowestSlot;

export const rowAt = (loom: Loom, timeFraction: number) => clamp(Math.floor(timeFraction * loom.rowCount), 0, loom.rowCount - 1);

export const toScreen = (loom: Loom, along: number, across: number): Point => (loom.vertical ? [across, along] : [along, across]);

export const boxAt = (loom: Loom, along: number, across: number, alongSize: number, acrossSize: number): Box =>
  loom.vertical ? { x: across, y: along, width: acrossSize, height: alongSize } : { x: along, y: across, width: alongSize, height: acrossSize };

export const endsOnSlot = (loom: Loom, slot: number): number[] => loom.ends.flatMap((end, index) => (end.slot === slot ? [index] : []));

function warpEnds(view: LayoutView, endsPerSlot: number, slotColours: ReadonlyMap<number, string>, ground: string): WarpEnd[] {
  const plain: WarpEnd = { slot: undefined, colour: ground };
  const selvedge = Array.from({ length: SELVEDGE_ENDS }, () => plain);
  const stripes = Array.from({ length: view.highestSlot - view.lowestSlot + 1 }, (_, offset) => {
    const slot = view.lowestSlot + offset;
    const divider = offset > 0 && endsPerSlot >= PERSLOT_FOR_PLAIN_DIVIDER ? [plain] : [];
    const stripe = Array.from({ length: endsPerSlot }, (): WarpEnd => ({ slot, colour: slotColours.get(slot) ?? ground }));
    return [...divider, ...stripe];
  });
  return [...selvedge, ...stripes.flat(), ...selvedge];
}

function endsPerSlot(warpWidth: number, unit: number, slotCount: number): number {
  const fit = (warpWidth / (THREAD_PITCH * unit) - 2 * SELVEDGE_ENDS) / slotCount;
  return fit >= PERSLOT_FOR_ROUNDED_FIT ? Math.round(fit + 1 / slotCount) - 1 : Math.max(1, Math.round(fit));
}

function slotColoursOf(view: LayoutView): Map<number, string> {
  return new Map(view.lanes.map((lane) => [lane.slot, lane.colour]));
}

export function setUpLoom(view: LayoutView, frame: Frame, theme: Theme): Loom {
  const { unit, vertical } = frame;
  const [left, top, right, bottom] = frame.plot;
  const [alongStart, alongEnd, acrossStart, acrossEnd] = vertical ? [top, bottom, left, right] : [left, right, top, bottom];
  const slotCount = view.highestSlot - view.lowestSlot + 1;
  const notationSquare = clamp(
    Math.min(NOTATION_SQUARE * unit, ((acrossEnd - acrossStart) * NOTATION_SHARE) / (slotCount + 1)),
    SMALLEST_NOTATION_SQUARE,
    NOTATION_SQUARE * unit,
  );
  const gap = NOTATION_GAP * unit;
  const clothWidth = acrossEnd - acrossStart - (slotCount + 1) * notationSquare - 2 * gap;
  const slotColours = slotColoursOf(view);
  const groundColour = mix(theme.muted, theme.background, theme.glow ? 0.35 : 0.55);
  const ends = warpEnds(view, endsPerSlot(clothWidth, unit, slotCount), slotColours, groundColour);
  const endPitch = clothWidth / ends.length;
  const alongLength = alongEnd - alongStart;
  const threadingSquare = Math.max(1, Math.min(notationSquare, endPitch * 1.2, (alongLength * NOTATION_SHARE * THREADING_SHARE_OF_NOTATION) / (slotCount + 1)));
  const fringe = Math.min(LONGEST_FRINGE * unit, alongLength * FRINGE_SHARE);
  const threadingBlock = (slotCount + 1) * threadingSquare + gap;
  const clothLength = alongLength - threadingBlock - 2 * fringe;
  const rowCount = clamp(Math.round(clothLength / endPitch), 1, MOST_ROWS);
  return {
    unit,
    vertical,
    ends,
    slotColours,
    groundColour,
    lowestSlot: view.lowestSlot,
    slotCount,
    rowCount,
    rowPitch: clothLength / rowCount,
    endPitch,
    clothStart: alongStart + threadingBlock + fringe,
    clothLength,
    firstEnd: acrossStart,
    clothWidth,
    notationSquare,
    threadingSquare,
    gap,
    fringe,
  };
}
