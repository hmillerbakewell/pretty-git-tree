import { FORMATS } from "../../core/index.ts";
import { svgUrl } from "../download.ts";
import type { Settings } from "../settings.ts";
import type { Drawing } from "./use-drawing.ts";

export type FileKind = "png" | "svg";

function Frame({ drawing }: { drawing: Drawing }) {
  const description = drawing.pasted ? `Git history for ${drawing.days}, drawn as ${drawing.layoutName}` : "An example history";
  return (
    <div class="frame">
      {drawing.error ? <div class="render-error">{drawing.error}</div> : <img src={svgUrl(drawing.svg)} alt={description} />}
      {!drawing.pasted && <span class="stamp label">Example</span>}
    </div>
  );
}

function SheetFoot({ drawing, onDownload }: { drawing: Drawing; onDownload: (kind: FileKind) => void }) {
  return (
    <div class="sheet-foot">
      <span class="mono" title={drawing.pasted ? drawing.fileName : undefined}>
        {drawing.pasted ? drawing.fileName : "Paste your history to draw yours"}
      </span>
      <div class="downloads">
        <button type="button" class="button primary" disabled={!drawing.ready} onClick={() => onDownload("png")}>
          Download PNG
        </button>
        <button type="button" class="button" disabled={!drawing.ready} onClick={() => onDownload("svg")}>
          SVG
        </button>
      </div>
    </div>
  );
}

export function PreviewSheet({ drawing, settings, onDownload }: { drawing: Drawing; settings: Settings; onDownload: (kind: FileKind) => void }) {
  const canvas = FORMATS[settings.format] ?? { width: 1, height: 1 };
  return (
    <section class="sheet" aria-label="Preview">
      <div class="dims" style={{ "--ratio": canvas.width / canvas.height }}>
        <span class="dim-w" aria-hidden="true">
          {canvas.width}
        </span>
        <Frame drawing={drawing} />
        <span class="dim-h" aria-hidden="true">
          <span>{canvas.height}</span>
        </span>
        <SheetFoot drawing={drawing} onDownload={onDownload} />
      </div>
    </section>
  );
}
