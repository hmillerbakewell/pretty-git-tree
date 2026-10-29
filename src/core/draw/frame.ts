import { type Canvas, isPortrait } from "./formats.ts";

const REFERENCE_SIDE_PIXELS = 1080;

export interface Frame {
  readonly width: number;
  readonly height: number;
  readonly unit: number;
  readonly vertical: boolean;
  readonly margin: number;
  readonly header: number;
  readonly footer: number;
  readonly plot: readonly [left: number, top: number, right: number, bottom: number];
}

export function frameOf(canvas: Canvas): Frame {
  const { width, height } = canvas;
  const vertical = isPortrait(canvas);
  const margin = Math.round(Math.min(width, height) * 0.075);
  const header = Math.round(height * (vertical ? 0.15 : 0.2));
  const footer = Math.round(height * (vertical ? 0.07 : 0.11));
  return {
    width,
    height,
    unit: Math.min(width, height) / REFERENCE_SIDE_PIXELS,
    vertical,
    margin,
    header,
    footer,
    plot: [margin, header, width - margin, height - footer],
  };
}
