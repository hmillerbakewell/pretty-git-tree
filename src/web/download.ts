import type { Canvas } from "../core/index.ts";

const OBJECT_URL_LIFETIME_MILLISECONDS = 1000;

export const svgUrl = (svg: string): string => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

function save(blob: Blob, fileName: string): void {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), OBJECT_URL_LIFETIME_MILLISECONDS);
}

export const saveSvg = (svg: string, fileName: string): void => save(new Blob([svg], { type: "image/svg+xml" }), fileName);

export async function savePng(svg: string, canvas: Canvas, fileName: string, scale = 1): Promise<void> {
  const image = new Image();
  image.src = svgUrl(svg);
  await image.decode();
  const drawingSurface = document.createElement("canvas");
  drawingSurface.width = Math.round(canvas.width * scale);
  drawingSurface.height = Math.round(canvas.height * scale);
  const context = drawingSurface.getContext("2d");
  if (!context) throw new Error("couldn't draw the PNG");
  context.drawImage(image, 0, 0, drawingSurface.width, drawingSurface.height);
  const blob = await new Promise<Blob | null>((resolve) => drawingSurface.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("couldn't encode the PNG");
  save(blob, fileName);
}
