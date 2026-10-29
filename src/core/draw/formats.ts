export interface Canvas {
  width: number;
  height: number;
}

export const isPortrait = (canvas: Canvas): boolean => canvas.height > canvas.width;

export const FORMATS: Record<string, Canvas> = {
  "linkedin-portrait": { width: 1080, height: 1350 },
  "linkedin-square": { width: 1080, height: 1080 },
  "linkedin-landscape": { width: 1200, height: 627 },
};

export const DEFAULT_FORMAT = "linkedin-landscape";

const WIDTH_BY_HEIGHT = /^(\d+)x(\d+)$/i;

export function parseCanvas(value: string): Canvas {
  if (value in FORMATS) return FORMATS[value];
  const size = WIDTH_BY_HEIGHT.exec(value);
  if (!size) throw new Error(`unknown format ${value}; use one of ${Object.keys(FORMATS).join(", ")} or WxH`);
  return { width: Number(size[1]), height: Number(size[2]) };
}
