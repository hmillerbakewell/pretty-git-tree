import { element, formatNumber, group, type Point, polylinePath, type SvgElement } from "../../draw/svg.ts";
import type { Theme } from "../../draw/themes.ts";
import type { PlacedCommit } from "../../style/view.ts";
import { type Board, commitPlace, DEPTH_SWELL, PAD_STRAND, type Painted } from "./board.ts";

const PAD_LIFT = 0.01;
const MERGE_PAD_SIZE_PER_VIA = 1.25;
const MERGE_PAD_CORNER = 0.25;
const VIA_STROKE_PER_TRACE = 0.9;
const HEAD_RING_PER_VIA = 2;
const MOST_CHIP_PINS = 6;
const CHIP_GROWTH_PER_DOUBLING = 0.45;
const CHIP_WIDTH_PER_VIA = 2.2;
const CHIP_PIN_PER_VIA = 0.7;
const CHIP_CORNER_PER_VIA = 0.35;
const CHIP_ROOM_GROWTH_PER_DOUBLING = 0.6;
const CHIP_ROOM_SHARE = 0.8;
const CHIP_LABEL_MIN_WEIGHT = 3;
const CHIP_LABEL_SIZE_PER_VIA = 0.95;

interface Chip {
  readonly centre: Point;
  readonly radius: number;
  readonly trace: number;
  readonly weight: number;
  readonly colour: string;
  readonly theme: Theme;
  readonly vertical: boolean;
  readonly room: number;
  readonly angle: number;
}

const chipLength = (chip: Chip): number =>
  Math.min(chip.radius * 2 * (1 + CHIP_GROWTH_PER_DOUBLING * Math.log2(chip.weight)), Math.max(chip.room, chip.radius * 2));

function chipPins(chip: Chip, length: number, width: number): SvgElement[] {
  const [x, y] = chip.centre;
  const pinCount = Math.min(chip.weight, MOST_CHIP_PINS);
  const pinLength = chip.radius * CHIP_PIN_PER_VIA;
  return Array.from({ length: pinCount }, (_, pinIndex) => -length / 2 + (length * (pinIndex + 0.5)) / pinCount).flatMap((along) =>
    [-1, 1].map((side) => {
      const [wall, tip]: Point[] = chip.vertical
        ? [
            [x + (side * width) / 2, y + along],
            [x + side * (width / 2 + pinLength), y + along],
          ]
        : [
            [x + along, y + (side * width) / 2],
            [x + along, y + side * (width / 2 + pinLength)],
          ];
      return element("path", { d: polylinePath([wall, tip]), stroke: chip.colour, "stroke-width": chip.trace * 0.5, "stroke-linecap": "round" });
    }),
  );
}

function chipBody(chip: Chip, length: number, width: number): SvgElement {
  const [x, y] = chip.centre;
  const [bodyWidth, bodyHeight] = chip.vertical ? [width, length] : [length, width];
  return element("rect", {
    x: x - bodyWidth / 2,
    y: y - bodyHeight / 2,
    width: bodyWidth,
    height: bodyHeight,
    rx: chip.radius * CHIP_CORNER_PER_VIA,
    fill: chip.theme.background,
    stroke: chip.colour,
    "stroke-width": chip.trace * 0.7,
  });
}

function chipLabel(chip: Chip): SvgElement[] {
  if (chip.weight < CHIP_LABEL_MIN_WEIGHT) return [];
  const [x, y] = chip.centre;
  const font = { "font-family": chip.theme.fontMono, "font-size": chip.radius * CHIP_LABEL_SIZE_PER_VIA, "font-weight": "bold" };
  return [element("text", { x, y, dy: "0.35em", "text-anchor": "middle", ...font, fill: chip.colour }, [String(chip.weight)])];
}

function chipMarks(chip: Chip): SvgElement[] {
  const [x, y] = chip.centre;
  const length = chipLength(chip);
  const width = chip.radius * CHIP_WIDTH_PER_VIA;
  const rotation = chip.angle ? { transform: `rotate(${formatNumber(chip.angle)} ${formatNumber(x)} ${formatNumber(y)})` } : {};
  return [group(rotation, [...chipPins(chip, length, width), chipBody(chip, length, width)]), ...chipLabel(chip)];
}

function mergeDiamond([x, y]: Point, radius: number, colour: string): SvgElement {
  const half = radius * MERGE_PAD_SIZE_PER_VIA;
  return element("rect", {
    x: x - half,
    y: y - half,
    width: 2 * half,
    height: 2 * half,
    rx: half * MERGE_PAD_CORNER,
    fill: colour,
    transform: `rotate(45 ${formatNumber(x)} ${formatNumber(y)})`,
  });
}

const via = ([x, y]: Point, radius: number, board: Board, colour: string): SvgElement =>
  element("circle", { cx: x, cy: y, r: radius, fill: board.theme.background, stroke: colour, "stroke-width": board.band.trace * VIA_STROKE_PER_TRACE });

const headMarker = ([x, y]: Point, radius: number, theme: Theme): SvgElement =>
  element("circle", {
    cx: x,
    cy: y,
    r: radius * HEAD_RING_PER_VIA,
    fill: "none",
    stroke: theme.ink,
    "stroke-width": 1.5,
    "stroke-dasharray": "3 4",
    opacity: 0.8,
  });

function commitPad(board: Board, commit: PlacedCommit, centre: Point, radius: number, along: number): SvgElement[] {
  const { band } = board;
  if (commit.isMerge) return [mergeDiamond(centre, radius, commit.colour)];
  if (commit.weight <= 1) return [via(centre, radius, board, commit.colour)];
  return chipMarks({
    centre,
    radius,
    trace: band.trace,
    weight: commit.weight,
    colour: commit.colour,
    theme: board.theme,
    vertical: board.vertical && !band.route,
    room: band.unit * (1 + CHIP_ROOM_GROWTH_PER_DOUBLING * Math.log2(commit.weight)) * CHIP_ROOM_SHARE,
    angle: band.route ? band.route.angle(along) : 0,
  });
}

export function commitMark(board: Board, commit: PlacedCommit): Painted {
  const [along, across, depth] = board.twist.map(...commitPlace(board.band, commit));
  const centre = board.band.toPlane(along, across);
  const radius = board.band.viaRadius * (1 + DEPTH_SWELL * depth);
  const marks = [...commitPad(board, commit, centre, radius, along), ...(commit.isHead ? [headMarker(centre, radius, board.theme)] : [])];
  return { depth: depth + PAD_LIFT, strand: PAD_STRAND, element: group({}, marks) };
}
