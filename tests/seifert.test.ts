import { expect, test } from "vitest";
import { DEFAULT_OPTIONS, DEFAULT_THEME, type Graph, layout, type Options, parseLog, simplify, sliceLog, THEMES } from "../src/core/index.ts";
import { ribbonSurface } from "../src/core/renderers/seifert.ts";
import { viewLayout } from "../src/core/style/view.ts";
import { corpus } from "./corpus.ts";

const surfaceOf = (graph: Graph, options: Options = DEFAULT_OPTIONS) => ribbonSurface(graph, viewLayout(graph, layout(graph, options), THEMES[DEFAULT_THEME]));

const graphs = corpus.map(([name, log]) => [name, sliceLog(log)] as const);

for (const [name, graph] of graphs) {
  test(`${name}: the surface is a real surface, the same at every level of detail`, () => {
    const found = (["full", "fused"] as const).map((level) => {
      const surface = surfaceOf(simplify(graph, level));
      expect(Number.isInteger(surface.genus)).toBe(true);
      expect(surface.genus).toBeGreaterThanOrEqual(0);
      expect(surface.boundaries).toBeGreaterThanOrEqual(surface.components);
      return surface;
    });
    expect([found[1].euler, found[1].boundaries, found[1].genus]).toEqual([found[0].euler, found[0].boundaries, found[0].genus]);
  });
}

for (const [name, graph] of graphs) {
  test(`${name}: the drawing moves genus and boundaries, never pieces or loops`, () => {
    const fused = simplify(graph, "fused");
    const surfaces = (["topological", "chronological"] as const).flatMap((timeMode) =>
      (["centre", "edge"] as const).map((arrange) => surfaceOf(fused, { ...DEFAULT_OPTIONS, timeMode, arrange })),
    );
    for (const surface of surfaces) {
      expect([surface.euler, surface.components]).toEqual([surfaces[0].euler, surfaces[0].components]);
      expect(2 * surface.genus + surface.boundaries).toBe(2 * surface.components - surface.euler);
    }
  });
}

test("a branch merged back makes an annulus; two make a pair of pants", () => {
  const surfaceOfLog = (log: string) => surfaceOf(simplify(sliceLog(parseLog(log)), "full"));
  const sha = (number: number) => String(number).padStart(40, "0");
  const line = (number: number, ...parents: number[]) => `${sha(number)} ${1000 + number} ${parents.map(sha).join(" ")}`;
  const one = surfaceOfLog([line(1), line(2, 1), line(3, 1), line(4, 2, 3)].join("\n"));
  expect([one.euler, one.boundaries, one.genus]).toEqual([0, 2, 0]);
  const two = surfaceOfLog([line(1), line(2, 1), line(3, 1), line(4, 1), line(5, 2, 3), line(6, 5, 4)].join("\n"));
  expect([two.euler, two.boundaries, two.genus]).toEqual([-1, 3, 0]);
});
