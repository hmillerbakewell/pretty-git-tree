import { type Canvas, DEFAULT_FORMAT, parseCanvas } from "./draw/formats.ts";
import { DEFAULT_THEME, THEMES, type Theme } from "./draw/themes.ts";
import { DEFAULT_LEVEL, type Level, simplify } from "./graph/simplify.ts";
import { DEFAULT_OPTIONS, type Graph, type Options } from "./model.ts";
import { getRenderer } from "./renderers/index.ts";

export * from "./draw/formats.ts";
export * from "./draw/themes.ts";
export * from "./graph/layout.ts";
export * from "./graph/queries.ts";
export * from "./graph/simplify.ts";
export * from "./history/dates.ts";
export * from "./history/log.ts";
export * from "./history/samples.ts";
export * from "./history/slice.ts";
export * from "./model.ts";
export { getRenderer, register, renderers } from "./renderers/index.ts";
export type { Renderer, Tune } from "./style/renderer.ts";
export { isOneOf } from "./util/guards.ts";
export { pluralOf } from "./util/text.ts";

export const DEFAULT_STYLE = "circuit";

export interface RenderSettings extends Partial<Options> {
  style?: string;
  theme?: string;
  format?: Canvas | string;
  level?: Level;
}

const canvasFor = (format: RenderSettings["format"]): Canvas => (typeof format === "object" ? format : parseCanvas(format ?? DEFAULT_FORMAT));

function themeNamed(name: string | undefined): Theme {
  const theme = THEMES[name ?? DEFAULT_THEME];
  if (!theme) throw new Error(`unknown theme ${name}; choose from ${Object.keys(THEMES).join(", ")}`);
  return theme;
}

const optionsFrom = (settings: RenderSettings): Options => ({
  timeMode: settings.timeMode ?? DEFAULT_OPTIONS.timeMode,
  arrange: settings.arrange ?? DEFAULT_OPTIONS.arrange,
  route: settings.route ?? DEFAULT_OPTIONS.route,
  twistEvery: settings.twistEvery ?? DEFAULT_OPTIONS.twistEvery,
});

export function renderGraph(graph: Graph, settings: RenderSettings = {}): string {
  const canvas = canvasFor(settings.format);
  const theme = themeNamed(settings.theme);
  const simplified = simplify(graph, settings.level ?? DEFAULT_LEVEL);
  return getRenderer(settings.style ?? DEFAULT_STYLE).render(simplified, canvas, theme, optionsFrom(settings));
}
