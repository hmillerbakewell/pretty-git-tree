import { backgroundDefinitions, backgroundLayers } from "../draw/backdrop.ts";
import type { Canvas } from "../draw/formats.ts";
import { type Frame, frameOf } from "../draw/frame.ts";
import { element, renderSvg, type SvgChild, svgDocument } from "../draw/svg.ts";
import type { Theme } from "../draw/themes.ts";
import { layout } from "../graph/layout.ts";
import { DEFAULT_OPTIONS, type Graph, type Options } from "../model.ts";
import { titleLayers } from "./titles.ts";
import { type LayoutView, viewLayout } from "./view.ts";

export type Tune = Exclude<keyof Options, "timeMode">;

export interface Renderer {
  readonly name: string;
  readonly description: string;
  readonly tunes: readonly Tune[];
  render(graph: Graph, canvas: Canvas, theme: Theme, options: Options): string;
}

export interface StyleScene {
  readonly graph: Graph;
  readonly frame: Frame;
  readonly theme: Theme;
  readonly options: Options;
  readonly view: LayoutView;
}

export interface Drawing {
  readonly layers: readonly SvgChild[];
  readonly definitions?: readonly SvgChild[];
  readonly branchCount?: number;
  readonly headingFont?: string;
}

export interface StyleDefinition {
  readonly name: string;
  readonly description: string;
  readonly tunes: readonly Tune[];
  readonly showsGrid?: boolean;
  draw(scene: StyleScene): Drawing;
}

const optionsTunedBy = (tunes: readonly Tune[], options: Options): Options => ({
  ...DEFAULT_OPTIONS,
  timeMode: options.timeMode,
  ...Object.fromEntries(tunes.map((tune) => [tune, options[tune]])),
});

export const defineStyle = (style: StyleDefinition): Renderer => ({
  name: style.name,
  description: style.description,
  tunes: style.tunes,
  render(graph, canvas, theme, options) {
    const frame = frameOf(canvas);
    const tunedOptions = optionsTunedBy(style.tunes, options);
    const view = viewLayout(graph, layout(graph, tunedOptions), theme);
    const drawing = style.draw({ graph, frame, theme, options: tunedOptions, view });
    const definitions = element("defs", {}, [...backgroundDefinitions(frame, theme), ...(drawing.definitions ?? [])]);
    return renderSvg(
      svgDocument(frame.width, frame.height, [
        definitions,
        ...backgroundLayers(frame, style.showsGrid ?? false),
        ...drawing.layers,
        ...titleLayers(graph, theme, frame, drawing.branchCount ?? view.lanes.length, drawing.headingFont),
      ]),
    );
  },
});
