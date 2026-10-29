import { pluralOf } from "../../core/index.ts";
import { svgUrl } from "../download.ts";
import { type Prepared, useRender } from "../render.ts";
import type { Settings } from "../settings.ts";

export function Picture({ prepared, settings, alt }: { prepared: Prepared; settings: Settings; alt: string }) {
  const { svg, error } = useRender(prepared, settings);
  if (error) return <div class="render-error">{error}</div>;
  return <img src={svgUrl(svg)} alt={alt} />;
}

export const localisedCount = (count: number, word: string): string => `${count.toLocaleString()} ${count === 1 ? word : pluralOf(word)}`;
