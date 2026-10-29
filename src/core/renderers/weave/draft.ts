import { mix } from "../../draw/colour.ts";
import { type Attributes, element, group, polylinePath, type SvgElement } from "../../draw/svg.ts";
import type { Theme } from "../../draw/themes.ts";
import type { PlacedCommit } from "../../style/view.ts";
import type { Drawdown } from "./drawdown.ts";
import { boxAt, type Loom, rowAt, shaftOf, toScreen } from "./loom.ts";
import { weftColour } from "./patterns.ts";

const THINNEST_VISIBLE_SQUARE = 2.5;
const SQUARE_SIZE_FOR_PADDING = 4;
const SQUARE_PADDING = 0.12;
const ROW_PITCH_FOR_SEPARATE_SQUARES = 4;
const TIED_OPACITY = 0.35;

interface Paper {
  readonly along: number;
  readonly across: number;
  readonly alongCount: number;
  readonly alongPitch: number;
  readonly acrossCount: number;
  readonly acrossPitch: number;
}

interface Square {
  readonly along: number;
  readonly across: number;
  readonly alongSize: number;
  readonly acrossSize: number;
}

const paperLineAttributes = (loom: Loom, theme: Theme): Attributes => ({
  stroke: mix(theme.muted, theme.background, 0.35),
  "stroke-width": Math.max(0.5, 0.8 * loom.unit),
  fill: "none",
});

const everyNthLine = (pitch: number) => (pitch < THINNEST_VISIBLE_SQUARE ? Math.ceil(THINNEST_VISIBLE_SQUARE / pitch) : 1);

const steps = (count: number, stride: number) => Array.from({ length: Math.floor(count / stride) + 1 }, (_, index) => index * stride);

function squaredPaper(loom: Loom, theme: Theme, paper: Paper): SvgElement {
  const { along, across, alongCount, alongPitch, acrossCount, acrossPitch } = paper;
  const alongLines = steps(alongCount, everyNthLine(alongPitch)).map((index) =>
    polylinePath([toScreen(loom, along + index * alongPitch, across), toScreen(loom, along + index * alongPitch, across + acrossCount * acrossPitch)]),
  );
  const acrossLines = steps(acrossCount, everyNthLine(acrossPitch)).map((index) =>
    polylinePath([toScreen(loom, along, across + index * acrossPitch), toScreen(loom, along + alongCount * alongPitch, across + index * acrossPitch)]),
  );
  return element("path", { d: [...alongLines, ...acrossLines].join(" "), ...paperLineAttributes(loom, theme) });
}

function filledSquare(loom: Loom, { along, across, alongSize, acrossSize }: Square, colour: string, opacity = 1): SvgElement {
  const padding = Math.min(alongSize, acrossSize) > SQUARE_SIZE_FOR_PADDING ? SQUARE_PADDING : 0;
  const box = boxAt(loom, along + alongSize * padding, across + acrossSize * padding, alongSize * (1 - 2 * padding), acrossSize * (1 - 2 * padding));
  return element("rect", { ...box, fill: colour, opacity });
}

const threadingEdge = (loom: Loom) => loom.clothStart - loom.fringe - loom.gap * 0.5;
const shaftAlong = (loom: Loom, shaft: number) => threadingEdge(loom) - (shaft + 1) * loom.threadingSquare;
const treadleAcross = (loom: Loom, treadle: number) => loom.firstEnd + loom.clothWidth + loom.gap + treadle * loom.notationSquare;

function threading(loom: Loom, theme: Theme): SvgElement[] {
  const runs: SvgElement[] = [];
  let runStart = 0;
  loom.ends.forEach((end, index) => {
    const next = loom.ends[index + 1];
    if (next && next.slot === end.slot) return;
    if (end.slot !== undefined) {
      const square = {
        along: shaftAlong(loom, shaftOf(loom, end.slot)),
        across: loom.firstEnd + runStart * loom.endPitch,
        alongSize: loom.threadingSquare,
        acrossSize: (index + 1 - runStart) * loom.endPitch,
      };
      runs.push(filledSquare(loom, square, theme.ink));
    }
    runStart = index + 1;
  });
  const paper = {
    along: shaftAlong(loom, loom.slotCount - 1),
    across: loom.firstEnd,
    alongCount: loom.slotCount,
    alongPitch: loom.threadingSquare,
    acrossCount: loom.ends.length,
    acrossPitch: loom.endPitch,
  };
  const colourOrderAlong = shaftAlong(loom, loom.slotCount) - loom.gap * 0.3;
  const colourOrder = loom.ends.map((end, index) =>
    element("rect", { ...boxAt(loom, colourOrderAlong, loom.firstEnd + index * loom.endPitch, loom.threadingSquare, loom.endPitch), fill: end.colour }),
  );
  return [...runs, squaredPaper(loom, theme, paper), ...colourOrder];
}

function liftRuns(loom: Loom, drawdown: Drawdown, shaft: number): [first: number, after: number][] {
  const runs: [number, number][] = [];
  let row = 0;
  while (row < loom.rowCount) {
    if (!drawdown.lifts(row, shaft)) {
      row++;
      continue;
    }
    const first = row;
    while (row < loom.rowCount && drawdown.lifts(row, shaft)) row++;
    runs.push([first, row]);
  }
  return runs;
}

function treadleSquares(loom: Loom, drawdown: Drawdown, shaft: number, ink: string): SvgElement[] {
  const { rowPitch, clothStart, notationSquare } = loom;
  const across = treadleAcross(loom, shaft);
  return liftRuns(loom, drawdown, shaft).flatMap(([first, after]) =>
    rowPitch > ROW_PITCH_FOR_SEPARATE_SQUARES
      ? Array.from({ length: after - first }, (_, offset) =>
          filledSquare(loom, { along: clothStart + (first + offset) * rowPitch, across, alongSize: rowPitch, acrossSize: notationSquare }, ink),
        )
      : [filledSquare(loom, { along: clothStart + first * rowPitch, across, alongSize: (after - first) * rowPitch, acrossSize: notationSquare }, ink)],
  );
}

function treadling(loom: Loom, drawdown: Drawdown, theme: Theme): SvgElement[] {
  const { rowPitch, clothStart, notationSquare } = loom;
  const squares = Array.from({ length: loom.slotCount }, (_, shaft) => treadleSquares(loom, drawdown, shaft, theme.ink)).flat();
  const paper = {
    along: clothStart,
    across: treadleAcross(loom, 0),
    alongCount: loom.rowCount,
    alongPitch: rowPitch,
    acrossCount: loom.slotCount,
    acrossPitch: notationSquare,
  };
  const weftAcross = treadleAcross(loom, loom.slotCount) + loom.gap * 0.3;
  const weftColours = Array.from({ length: loom.rowCount }, (_, row) =>
    element("rect", {
      ...boxAt(loom, clothStart + row * rowPitch, weftAcross, rowPitch, notationSquare),
      fill: drawdown.weftColourOf(row) ?? weftColour(theme),
    }),
  );
  const weftOutline = element("rect", { ...boxAt(loom, clothStart, weftAcross, loom.clothLength, notationSquare), ...paperLineAttributes(loom, theme) });
  return [...squares, squaredPaper(loom, theme, paper), ...weftColours, weftOutline];
}

function tieUp(loom: Loom, drawdown: Drawdown, theme: Theme): SvgElement[] {
  const shafts = Array.from({ length: loom.slotCount }, (_, shaft) => shaft);
  const squares = shafts.flatMap((treadle) =>
    shafts.flatMap((shaft) => {
      const square = { along: shaftAlong(loom, shaft), across: treadleAcross(loom, treadle), alongSize: loom.threadingSquare, acrossSize: loom.notationSquare };
      if (treadle === shaft) return [filledSquare(loom, square, theme.ink)];
      return drawdown.isTied(treadle, shaft) ? [filledSquare(loom, square, theme.ink, TIED_OPACITY)] : [];
    }),
  );
  const paper = {
    along: shaftAlong(loom, loom.slotCount - 1),
    across: treadleAcross(loom, 0),
    alongCount: loom.slotCount,
    alongPitch: loom.threadingSquare,
    acrossCount: loom.slotCount,
    acrossPitch: loom.notationSquare,
  };
  return [...squares, squaredPaper(loom, theme, paper)];
}

function headRingOnTreadle(loom: Loom, head: PlacedCommit | undefined, theme: Theme): SvgElement[] {
  if (!head) return [];
  const row = rowAt(loom, head.timeFraction);
  const [x, y] = toScreen(loom, loom.clothStart + (row + 0.5) * loom.rowPitch, treadleAcross(loom, shaftOf(loom, head.slot)) + loom.notationSquare / 2);
  const colour = loom.slotColours.get(head.slot) ?? theme.ink;
  return [
    element("circle", { cx: x, cy: y, r: Math.max(loom.notationSquare, loom.rowPitch) * 0.95, fill: "none", stroke: colour, "stroke-width": 1.6 * loom.unit }),
  ];
}

export function draftNotation(loom: Loom, drawdown: Drawdown, head: PlacedCommit | undefined, theme: Theme): SvgElement {
  return group({}, [...threading(loom, theme), ...treadling(loom, drawdown, theme), ...tieUp(loom, drawdown, theme), ...headRingOnTreadle(loom, head, theme)]);
}
