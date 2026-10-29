import { FORMATS } from "../../core/index.ts";
import { Cell } from "../components/cell.tsx";
import { RadioGroup } from "../components/radio-group.tsx";
import { DimControl, Segmented } from "../components/segmented.tsx";
import { svgUrl } from "../download.ts";
import { OPTIONS, type Settings, tunable, withLayout, withSetting } from "../settings.ts";
import type { Drawing } from "./use-drawing.ts";

export type Choose = (setting: string, value: string, next: Settings) => void;

const FORMAT_ICON_PIXELS = 22;

const PALETTE_NAMES: Record<string, string> = { midnight: "Midnight", pcb: "Circuit board", paper: "Paper" };
const FORMAT_NAMES: Record<string, string> = { portrait: "Portrait", square: "Square", landscape: "Landscape" };
const FORMAT_NOTES: Record<string, string> = {
  portrait: "Instagram deserves to know your git activity.",
  square: "Dependable. Familiar. Square.",
  landscape: "Link previews and LinkedIn posts.",
};

function FormatOption({ name, width, height }: { name: string; width: number; height: number }) {
  const longest = Math.max(width, height);
  return (
    <>
      <span class="ratio" style={{ width: `${(width / longest) * FORMAT_ICON_PIXELS}px`, height: `${(height / longest) * FORMAT_ICON_PIXELS}px` }} />
      {name}
    </>
  );
}

export function FormatCell({ settings, choose }: { settings: Settings; choose: Choose }) {
  const canvas = FORMATS[settings.format];
  return (
    <Cell label="Format" className="design" meta={canvas && `${canvas.width} × ${canvas.height}`} title="What shape?">
      {(titleId) => (
        <>
          <RadioGroup
            className="formats"
            labelledBy={titleId}
            selected={settings.format}
            onSelect={(format) => choose("format", format, withSetting(settings, "format", format))}
            options={Object.entries(FORMATS).map(([id, { width, height }]) => ({
              value: id,
              content: <FormatOption name={FORMAT_NAMES[id] ?? id} width={width} height={height} />,
            }))}
          />
          <p class="hint">{FORMAT_NOTES[settings.format]}</p>
        </>
      )}
    </Cell>
  );
}

function LayoutThumbnails({ drawing, settings, choose, titleId }: { drawing: Drawing; settings: Settings; choose: Choose; titleId: string }) {
  const canvas = FORMATS[settings.format];
  return (
    <RadioGroup
      className="looks"
      labelledBy={titleId}
      selected={drawing.layout?.id ?? ""}
      onSelect={(id) => {
        const layout = drawing.thumbnails.find((thumbnail) => thumbnail.layout.id === id)?.layout;
        if (layout) choose("layout", id, withLayout(settings, layout));
      }}
      options={drawing.thumbnails.map(({ layout, svg }) => ({
        value: layout.id,
        className: "look",
        content: (
          <>
            <span class="look-img" style={{ aspectRatio: canvas && `${canvas.width} / ${canvas.height}` }}>
              {svg && <img src={svgUrl(svg)} alt="" />}
            </span>
            {layout.label}
          </>
        ),
      }))}
    />
  );
}

export function DrawingCell({ drawing, settings, choose }: { drawing: Drawing; settings: Settings; choose: Choose }) {
  return (
    <Cell
      label="Drawing"
      className="design look-cell"
      meta={`${drawing.layoutName} · ${PALETTE_NAMES[settings.theme] ?? settings.theme}`}
      title="Choose a layout"
    >
      {(titleId) => (
        <>
          <LayoutThumbnails drawing={drawing} settings={settings} choose={choose} titleId={titleId} />
          <div class="fields">
            <Segmented
              label="Palette"
              options={OPTIONS.theme}
              names={PALETTE_NAMES}
              value={settings.theme}
              onChange={(theme) => choose("theme", theme, withSetting(settings, "theme", theme))}
            />
          </div>
          <div class="fine-tune">
            <h3 class="fine-tune-title">Fine-tune {drawing.layoutName}</h3>
            <div class="more-body">
              {tunable(settings.style).map((dim) => (
                <DimControl key={dim} dim={dim} settings={settings} onChange={(next) => choose(dim, next[dim], next)} />
              ))}
            </div>
          </div>
        </>
      )}
    </Cell>
  );
}
