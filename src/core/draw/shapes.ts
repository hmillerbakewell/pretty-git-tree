import { element, type Point, polylinePath, type SvgElement } from "./svg.ts";

const HEAD_HALF_WIDTH_SHARE = 0.45;
const SHAFT_OVERLAP_SHARE = 0.3;

export function arrow(
  [fromX, fromY]: Point,
  [toX, toY]: Point,
  colour: string,
  width: number,
  headLength: number,
  [trimAtStart, trimAtEnd]: [number, number] = [0, 0],
): SvgElement[] {
  const length = Math.hypot(toX - fromX, toY - fromY);
  if (length <= trimAtStart + trimAtEnd + headLength) return [];
  const alongX = (toX - fromX) / length;
  const alongY = (toY - fromY) / length;
  const along = ([x, y]: Point, distance: number): Point => [x + alongX * distance, y + alongY * distance];
  const shaftStart = along([fromX, fromY], trimAtStart);
  const tip = along([toX, toY], -trimAtEnd);
  const [baseX, baseY] = along(tip, -headLength);
  const [acrossX, acrossY] = [-alongY * headLength * HEAD_HALF_WIDTH_SHARE, alongX * headLength * HEAD_HALF_WIDTH_SHARE];
  return [
    element("path", {
      d: polylinePath([shaftStart, along([baseX, baseY], headLength * SHAFT_OVERLAP_SHARE)]),
      stroke: colour,
      "stroke-width": width,
      fill: "none",
      "stroke-linecap": "round",
    }),
    element("path", {
      d: `${polylinePath([tip, [baseX + acrossX, baseY + acrossY], [baseX - acrossX, baseY - acrossY]])} Z`,
      fill: colour,
    }),
  ];
}
