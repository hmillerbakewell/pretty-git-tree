import type { Frame } from "./frame.ts";
import { element, type SvgElement } from "./svg.ts";
import type { Theme } from "./themes.ts";

const GRID_DOTS_ACROSS_SHORT_SIDE = 40;

const gradientStops = (theme: Theme): SvgElement[] => [
  element("stop", { offset: "0%", "stop-color": theme.background }),
  element("stop", { offset: "100%", "stop-color": theme.backgroundEdge }),
];

const GLOW_FILTER = element("filter", { id: "glow", x: "-20%", y: "-20%", width: "140%", height: "140%" }, [
  element("feGaussianBlur", { stdDeviation: 3.5, result: "blur" }),
  element("feMerge", {}, [element("feMergeNode", { in: "blur" }), element("feMergeNode", { in: "SourceGraphic" })]),
]);

export function backgroundDefinitions(frame: Frame, theme: Theme): SvgElement[] {
  const gridPitch = Math.round(Math.min(frame.width, frame.height) / GRID_DOTS_ACROSS_SHORT_SIDE);
  return [
    element("radialGradient", { id: "bg", cx: "50%", cy: "42%", r: "75%" }, gradientStops(theme)),
    element("pattern", { id: "grid", width: gridPitch, height: gridPitch, patternUnits: "userSpaceOnUse" }, [
      element("circle", { cx: gridPitch / 2, cy: gridPitch / 2, r: 1.1, fill: theme.grid }),
    ]),
    ...(theme.glow ? [GLOW_FILTER] : []),
  ];
}

export const backgroundLayers = (frame: Frame, showsGrid: boolean): SvgElement[] => [
  element("rect", { width: frame.width, height: frame.height, fill: "url(#bg)" }),
  ...(showsGrid ? [element("rect", { width: frame.width, height: frame.height, fill: "url(#grid)" })] : []),
];

export const backgroundPaint = (frame: Frame, theme: Theme, id: string): SvgElement =>
  element(
    "radialGradient",
    { id, gradientUnits: "userSpaceOnUse", cx: 0.5, cy: 0.42, r: 0.75, gradientTransform: `matrix(${frame.width} 0 0 ${frame.height} 0 0)` },
    gradientStops(theme),
  );
