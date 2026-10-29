import { useMemo } from "preact/hooks";
import { formatDayRange, type Log, parseLog, sampleLog } from "../../core/index.ts";
import { reportError } from "../analytics.ts";
import { day } from "../range.ts";
import { prepare, renderSvg, useRender } from "../render.ts";
import { LAYOUTS, type Layout, layoutOf, type Settings, withLayout } from "../settings.ts";

const EXAMPLE_LOG: Log = sampleLog("busy-team");

function renderThumbnail(render: () => string): string {
  try {
    return render();
  } catch (error) {
    reportError(error, { where: "thumbnail" });
    return "";
  }
}

const datedStem = (firstSeconds: number, lastSeconds: number): string => {
  const [firstDay, lastDay] = [firstSeconds, lastSeconds].map((seconds) => day(new Date(seconds * 1000)));
  return firstDay === lastDay ? `git-${firstDay}` : `git-${firstDay}-to-${lastDay}`;
};

export interface Thumbnail {
  readonly layout: Layout;
  readonly svg: string;
}

export function useDrawing(logText: string, settings: Settings) {
  const log = useMemo(() => parseLog(logText), [logText]);
  const pasted = log.commits.length > 0;
  const prepared = useMemo(() => prepare(pasted ? log : EXAMPLE_LOG, {}), [log, pasted]);
  const { svg, error } = useRender(prepared, settings);
  const thumbnails = useMemo(
    (): Thumbnail[] => LAYOUTS.map((layout) => ({ layout, svg: renderThumbnail(() => renderSvg(prepared.graph, withLayout(settings, layout))) })),
    [prepared, settings.theme, settings.format],
  );
  const { first, last } = prepared.stats;
  const days = first !== null && last !== null ? formatDayRange(first, last) : "";
  const layout = layoutOf(settings);
  const layoutName = layout?.label ?? settings.style;
  const fileName = pasted && first !== null && last !== null ? `${datedStem(first, last)}-${layout?.id ?? settings.style}-${settings.theme}` : "";
  return { log, pasted, prepared, svg, error, thumbnails, days, layout, layoutName, fileName, ready: pasted && !error };
}

export type Drawing = ReturnType<typeof useDrawing>;
