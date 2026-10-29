import { useEffect } from "preact/hooks";
import { FORMATS } from "../../core/index.ts";
import { reportError, track } from "../analytics.ts";
import { savePng, saveSvg, svgUrl } from "../download.ts";
import { type Prepared, useRender } from "../render.ts";
import type { Settings } from "../settings.ts";
import type { History } from "./histories.ts";

type FileKind = "png" | "svg";

export const nameForStats = (history: History): string => (history.kind === "example" ? history.name : history.kind);

function download(history: History, settings: Settings, svg: string, kind: FileKind): void {
  const properties = { view: "zoo", file: kind, example: nameForStats(history), format: settings.format, style: settings.style, theme: settings.theme };
  const fileName = `${history.name}-${settings.style}`;
  const canvas = FORMATS[settings.format];
  const saving = kind === "png" && canvas ? savePng(svg, canvas, `${fileName}.png`) : Promise.resolve(saveSvg(svg, `${fileName}.svg`));
  saving.then(
    () => track("downloaded", properties),
    (error) => reportError(error, { where: "download", ...properties }),
  );
}

function useLightboxKeys(onClose: () => void, onStep: (delta: number) => void): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight") onStep(1);
      if (event.key === "ArrowLeft") onStep(-1);
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [onClose, onStep]);
}

interface LightboxProps {
  readonly history: History;
  readonly prepared: Prepared;
  readonly settings: Settings;
  readonly onClose: () => void;
  readonly onStep: (delta: number) => void;
}

export function Lightbox({ history, prepared, settings, onClose, onStep }: LightboxProps) {
  const { svg, error } = useRender(prepared, settings);
  useLightboxKeys(onClose, onStep);
  return (
    <dialog open class="lightbox" aria-label={history.name}>
      <button type="button" class="lightbox-backdrop" tabIndex={-1} aria-hidden="true" onClick={onClose} />
      <button type="button" class="nav prev" onClick={() => onStep(-1)} aria-label="Previous">
        ‹
      </button>
      <div class="lightbox-body">
        {error ? <div class="render-error">{error}</div> : <img src={svgUrl(svg)} alt={history.name} />}
        <div class="lightbox-meta">
          <div>
            <strong>{history.name}</strong> <span class="dim">{history.description}</span>
          </div>
          <div class="links">
            <button type="button" class="button" disabled={Boolean(error)} onClick={() => download(history, settings, svg, "png")}>
              PNG
            </button>
            <button type="button" class="button" disabled={Boolean(error)} onClick={() => download(history, settings, svg, "svg")}>
              SVG
            </button>
          </div>
        </div>
      </div>
      <button type="button" class="nav next" onClick={() => onStep(1)} aria-label="Next">
        ›
      </button>
      <button type="button" class="close" onClick={onClose} aria-label="Close">
        ×
      </button>
    </dialog>
  );
}
