import { type Attributes, element, formatNumber, type Point, polylinePath, type SvgElement } from "../../draw/svg.ts";
import type { Theme } from "../../draw/themes.ts";

const KET_SIZE_SHARE = 0.62;
const OPLUS_RADIUS_SHARE = 0.42;
const GATE_SIDE_SHARE = 0.78;
const LONGEST_GATE_SHARE = 1.2;
const GATE_LENGTH_PER_DOUBLING = 0.35;
const GATE_CORNER_SHARE = 0.12;
const COUNT_FONT_SHARE = 0.55;
const THREE_DIGIT_COUNT_FONT_SHARE = 0.42;
const THREE_DIGIT_COUNT = 100;
const SMALLEST_COUNT_FONT = 6;
const METER_SHORT_SIDE_SHARE = 0.8;
const METER_CORNER_SHARE = 0.1;
const METER_ARC_RADIUS_SHARE = 0.34;
const METER_ARC_DROP_SHARE = 0.22;
const HEAD_RING_SHARE = 0.95;
const NEEDLE_REACH_ACROSS_SHARE = 0.8;
const NEEDLE_REACH_UP_SHARE = 1.1;

export interface GlyphSpot {
  readonly centre: Point;
  readonly size: number;
  readonly angle: number;
}

const rotatedAbout = (angle: number, [x, y]: Point): Attributes =>
  angle ? { transform: `rotate(${formatNumber(angle)} ${formatNumber(x)} ${formatNumber(y)})` } : {};

const centredText = ([x, y]: Point, fontSize: number, fontFamily: string, colour: string, text: string, extra: Attributes = {}): SvgElement =>
  element("text", { x, y, dy: "0.35em", "text-anchor": "middle", "font-family": fontFamily, "font-size": fontSize, ...extra, fill: colour, stroke: "none" }, [
    text,
  ]);

export const ket = ({ centre, size }: GlyphSpot, label: string, colour: string, theme: Theme): SvgElement =>
  centredText(centre, size * KET_SIZE_SHARE, theme.fontMono, colour, label);

export const dot = ({ centre: [x, y], size }: GlyphSpot, radiusShare: number, colour: string): SvgElement =>
  element("circle", { cx: x, cy: y, r: size * radiusShare, fill: colour, stroke: "none" });

export function oplus({ centre: [x, y], size }: GlyphSpot, colour: string, theme: Theme): SvgElement[] {
  const radius = size * OPLUS_RADIUS_SHARE;
  const across = polylinePath([
    [x - radius, y],
    [x + radius, y],
  ]);
  const down = polylinePath([
    [x, y - radius],
    [x, y + radius],
  ]);
  return [element("circle", { cx: x, cy: y, r: radius, fill: theme.background, stroke: colour }), element("path", { d: `${across} ${down}`, stroke: colour })];
}

function commitCount(centre: Point, side: number, count: number, colour: string, theme: Theme): SvgElement[] {
  const fontSize = side * (count >= THREE_DIGIT_COUNT ? THREE_DIGIT_COUNT_FONT_SHARE : COUNT_FONT_SHARE);
  if (count < 2 || fontSize < SMALLEST_COUNT_FONT) return [];
  return [centredText(centre, fontSize, theme.fontMono, colour, String(count), { "font-weight": "bold" })];
}

export function gateBox(spot: GlyphSpot, count: number, timeRunsDown: boolean, colour: string, theme: Theme): SvgElement[] {
  const [x, y] = spot.centre;
  const side = spot.size * GATE_SIDE_SHARE;
  const length = Math.min(side * (1 + GATE_LENGTH_PER_DOUBLING * Math.log2(count)), spot.size * LONGEST_GATE_SHARE);
  const [width, height] = timeRunsDown ? [side, length] : [length, side];
  const box = element("rect", {
    x: x - width / 2,
    y: y - height / 2,
    width,
    height,
    rx: side * GATE_CORNER_SHARE,
    fill: theme.background,
    stroke: colour,
    ...rotatedAbout(spot.angle, spot.centre),
  });
  return [box, ...commitCount(spot.centre, side, count, colour, theme)];
}

export function meter(spot: GlyphSpot, timeRunsDown: boolean, colour: string, theme: Theme): SvgElement[] {
  const [x, y] = spot.centre;
  const { size } = spot;
  const [width, height] = timeRunsDown ? [size * METER_SHORT_SIDE_SHARE, size] : [size, size * METER_SHORT_SIDE_SHARE];
  const radius = Math.min(width, height) * METER_ARC_RADIUS_SHARE;
  const arcY = y + height * METER_ARC_DROP_SHARE;
  const turn = rotatedAbout(spot.angle, spot.centre);
  const needle = polylinePath([
    [x, arcY],
    [x + radius * NEEDLE_REACH_ACROSS_SHARE, arcY - radius * NEEDLE_REACH_UP_SHARE],
  ]);
  return [
    element("rect", { x: x - width / 2, y: y - height / 2, width, height, rx: size * METER_CORNER_SHARE, fill: theme.background, stroke: colour, ...turn }),
    element("path", {
      d: `M${formatNumber(x - radius)} ${formatNumber(arcY)} A${formatNumber(radius)} ${formatNumber(radius)} 0 0 1 ${formatNumber(x + radius)} ${formatNumber(arcY)}`,
      stroke: colour,
      ...turn,
    }),
    element("path", { d: needle, stroke: colour, ...turn }),
  ];
}

export const headMarker = ({ centre: [x, y], size }: GlyphSpot, theme: Theme): SvgElement =>
  element("circle", { cx: x, cy: y, r: size * HEAD_RING_SHARE, stroke: theme.ink, "stroke-width": 1.5, "stroke-dasharray": "3 4", opacity: 0.8 });
