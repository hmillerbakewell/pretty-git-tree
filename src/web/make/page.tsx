import { FORMATS } from "../../core/index.ts";
import { reportError, shape, track } from "../analytics.ts";
import { Masthead } from "../components/masthead.tsx";
import { savePng, saveSvg } from "../download.ts";
import { FINE_DIMS, type Settings } from "../settings.ts";
import { CommandCell } from "./command-cell.tsx";
import { type Choose, DrawingCell, FormatCell } from "./design-cells.tsx";
import { InputSummary, PasteCell } from "./paste-cell.tsx";
import { type FileKind, PreviewSheet } from "./preview-sheet.tsx";
import { RangeCell } from "./range-cell.tsx";
import { type SavedInput, useSavedInput } from "./saved-input.ts";
import { type Drawing, useDrawing } from "./use-drawing.ts";
import { useLogInput } from "./use-log-input.ts";

function downloadProperties(drawing: Drawing, saved: SavedInput, kind: FileKind) {
  const { layout } = drawing;
  const { settings } = saved;
  const tuned = layout !== undefined && FINE_DIMS.some((dim) => settings[dim] !== layout[dim]);
  return {
    view: "make",
    file: kind,
    format: settings.format,
    layout: layout?.id ?? settings.style,
    style: settings.style,
    theme: settings.theme,
    tuned,
    range: saved.preset,
    ...shape(drawing.prepared.stats),
  };
}

function download(drawing: Drawing, saved: SavedInput, kind: FileKind): void {
  const properties = downloadProperties(drawing, saved, kind);
  const canvas = FORMATS[saved.settings.format];
  const saving =
    kind === "png" && canvas ? savePng(drawing.svg, canvas, `${drawing.fileName}.png`) : Promise.resolve(saveSvg(drawing.svg, `${drawing.fileName}.svg`));
  saving.then(
    () => track("downloaded", properties),
    (error) => reportError(error, { where: "download", ...properties }),
  );
}

export function Make() {
  const { saved, update, persisted } = useSavedInput();
  const input = useLogInput(saved, update);
  const drawing = useDrawing(saved.log, saved.settings);
  const choose: Choose = (setting, value, next: Settings) => {
    update({ settings: next });
    track("setting_changed", { view: "make", setting, value, pasted: drawing.pasted });
  };
  const folded = drawing.pasted && !input.editing;
  return (
    <>
      <Masthead>
        <a class="text-link" href="#view=gallery">
          Examples →
        </a>
      </Masthead>
      {!persisted && <p class="notice">This browser won't keep your paste, so it'll be gone when you close the tab.</p>}
      <main class="make">
        <PreviewSheet drawing={drawing} settings={saved.settings} onDownload={(kind) => download(drawing, saved, kind)} />
        <div class="block">
          {folded ? <InputSummary input={input} drawing={drawing} /> : <RangeCommandAndPaste saved={saved} update={update} input={input} drawing={drawing} />}
          <FormatCell settings={saved.settings} choose={choose} />
          <DrawingCell drawing={drawing} settings={saved.settings} choose={choose} />
        </div>
      </main>
    </>
  );
}

function RangeCommandAndPaste(props: {
  saved: SavedInput;
  update: (changes: Partial<SavedInput>) => void;
  input: ReturnType<typeof useLogInput>;
  drawing: Drawing;
}) {
  return (
    <>
      <RangeCell saved={props.saved} update={props.update} />
      <CommandCell saved={props.saved} update={props.update} />
      <PasteCell input={props.input} drawing={props.drawing} />
    </>
  );
}
