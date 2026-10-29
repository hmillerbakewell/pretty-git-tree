import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { parseCanvas, parseLog, renderers, sliceLog } from "../src/core/index.ts";
import { renderSvg } from "../src/web/render.ts";
import { DEFAULTS, LAYOUTS, type Settings } from "../src/web/settings.ts";

const EXAMPLE = "git";
const OUTPUT_DIR = "media/styles";

const graph = sliceLog(parseLog(readFileSync(`src/web/examples/${EXAMPLE}.log`, "utf8")), { repoName: EXAMPLE });
const width = parseCanvas(DEFAULTS.format).width;

const toPng = (svg: string): Buffer => new Resvg(svg, { fitTo: { mode: "width", value: width } }).render().asPng();

const settingsFor = (style: string): Settings => ({ ...DEFAULTS, ...LAYOUTS.find((layout) => layout.style === style), style });

mkdirSync(OUTPUT_DIR, { recursive: true });
for (const { name } of renderers()) {
  const path = join(OUTPUT_DIR, `${name}.png`);
  writeFileSync(path, toPng(renderSvg(graph, settingsFor(name))));
  console.log(`wrote ${path}`);
}
