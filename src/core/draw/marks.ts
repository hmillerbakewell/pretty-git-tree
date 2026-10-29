import { type Attributes, element, type Point, type SvgElement } from "./svg.ts";
import type { Theme } from "./themes.ts";

export const glowFilter = (theme: Theme): Attributes => ({ filter: theme.glow ? "url(#glow)" : null });

export const headRing = ([x, y]: Point, radius: number, theme: Theme): SvgElement =>
  element("circle", { cx: x, cy: y, r: radius, fill: "none", stroke: theme.ink, "stroke-width": 1.2, "stroke-dasharray": "2 3" });
