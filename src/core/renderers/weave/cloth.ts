import { mix } from "../../draw/colour.ts";
import { element, formatNumber, group, polylinePath, type SvgElement } from "../../draw/svg.ts";
import type { Theme } from "../../draw/themes.ts";
import type { LayoutView } from "../../style/view.ts";
import { boxAt, type Loom, toScreen } from "./loom.ts";
import { weftColour } from "./patterns.ts";

interface Block {
  readonly firstRow: number;
  readonly firstEnd: number;
  readonly endAfter: number;
  readonly fill: string;
}

function rowRuns(row: number, endCount: number, fillAt: (row: number, end: number) => string): Map<string, Block> {
  const runs = new Map<string, Block>();
  let runStart = 0;
  let current = fillAt(row, 0);
  for (let end = 1; end <= endCount; end++) {
    const fill = end < endCount ? fillAt(row, end) : "";
    if (fill === current) continue;
    runs.set(`${runStart}:${end}:${current}`, { firstRow: row, firstEnd: runStart, endAfter: end, fill: current });
    runStart = end;
    current = fill;
  }
  return runs;
}

function stackedBlocks(loom: Loom, fillAt: (row: number, end: number) => string): [Block, number][] {
  const finished: [Block, number][] = [];
  let open = new Map<string, Block>();
  for (let row = 0; row < loom.rowCount; row++) {
    const runs = rowRuns(row, loom.ends.length, fillAt);
    const next = new Map([...runs].map(([key, run]): [string, Block] => [key, open.get(key) ?? run]));
    for (const [key, block] of open) if (!next.has(key)) finished.push([block, row]);
    open = next;
  }
  return [...finished, ...[...open.values()].map((block): [Block, number] => [block, loom.rowCount])];
}

export function clothLayer(loom: Loom, theme: Theme, fillAt: (row: number, end: number) => string): SvgElement {
  const { unit, rowPitch, endPitch, clothStart, firstEnd } = loom;
  const shadowBox = boxAt(loom, clothStart, firstEnd, loom.clothLength, loom.clothWidth);
  const dropShadow = element("rect", {
    ...shadowBox,
    x: shadowBox.x + 4 * unit,
    y: shadowBox.y + 5 * unit,
    fill: "#000000",
    opacity: theme.glow ? 0.45 : 0.12,
    rx: 2 * unit,
  });
  const blocks = stackedBlocks(loom, fillAt).map(([block, rowAfter]) =>
    element("rect", {
      ...boxAt(
        loom,
        clothStart + block.firstRow * rowPitch,
        firstEnd + block.firstEnd * endPitch,
        (rowAfter - block.firstRow) * rowPitch,
        (block.endAfter - block.firstEnd) * endPitch,
      ),
      fill: block.fill,
    }),
  );
  return group({}, [dropShadow, ...blocks]);
}

export function selvedgeTurns(loom: Loom, theme: Theme): SvgElement {
  const { rowPitch, endPitch, clothStart, firstEnd } = loom;
  const loops = Array.from({ length: Math.max(loom.rowCount - 1, 0) }, (_, row) => {
    const side = row % 2 ? firstEnd + loom.clothWidth : firstEnd;
    const outwards = row % 2 ? 1 : -1;
    const turnStart = clothStart + row * rowPitch + rowPitch * 0.5;
    const turnEnd = turnStart + rowPitch;
    const [startX, startY] = toScreen(loom, turnStart, side);
    const [controlX, controlY] = toScreen(loom, (turnStart + turnEnd) / 2, side + outwards * endPitch * 0.9);
    const [endX, endY] = toScreen(loom, turnEnd, side);
    return `M${formatNumber(startX)},${formatNumber(startY)} Q${formatNumber(controlX)},${formatNumber(controlY)} ${formatNumber(endX)},${formatNumber(endY)}`;
  });
  return group(
    { fill: "none", stroke: mix(weftColour(theme), theme.ink, 0.15), "stroke-width": Math.max(0.6, rowPitch * 0.4), "stroke-linecap": "round" },
    loops.length ? [element("path", { d: loops.join(" ") })] : [],
  );
}

export function fringe(view: LayoutView, loom: Loom, random: () => number): SvgElement {
  const entering = new Set(view.lanes.filter((lane) => lane.entersFromBeforeRange).map((lane) => lane.slot));
  const continuing = new Set(view.lanes.filter((lane) => lane.continuesAfterRange).map((lane) => lane.slot));
  const clothEnd = loom.clothStart + loom.clothLength;
  const tassels = loom.ends.flatMap((end, index) => {
    const across = loom.firstEnd + (index + 0.5) * loom.endPitch;
    const sides = [
      [loom.clothStart, -1, end.slot !== undefined && entering.has(end.slot)],
      [clothEnd, 1, end.slot !== undefined && continuing.has(end.slot)],
    ] as const;
    return sides.map(([edge, direction, isLong]) => {
      const length = loom.fringe * (isLong ? 0.75 + 0.25 * random() : 0.2 + 0.12 * random());
      const sway = (random() - 0.5) * loom.endPitch * 0.8;
      return element("path", {
        d: polylinePath([toScreen(loom, edge, across), toScreen(loom, edge + direction * length, across + sway)]),
        stroke: end.colour,
        "stroke-opacity": isLong ? 0.95 : 0.55,
      });
    });
  });
  return group({ fill: "none", "stroke-linecap": "round", "stroke-width": Math.max(0.6, loom.endPitch * 0.55) }, tassels);
}
