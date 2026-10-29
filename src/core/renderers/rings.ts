import type { Graph } from "../model.ts";
import { defineStyle } from "../style/renderer.ts";
import type { LayoutView } from "../style/view.ts";
import { seededRandom, seedFromText } from "../util/random.ts";
import { bark, headBlaze, pith } from "./rings/bark.ts";
import { branchSectors, pores } from "./rings/branches.ts";
import { ringGrowth } from "./rings/growth.ts";
import { branchKnots, grainFlow, knotScars } from "./rings/knots.ts";
import { type Section, sawDisc, sectorsFor } from "./rings/section.ts";
import { ringStrays, wood } from "./rings/wood.ts";

const shapeSeed = (graph: Graph, view: LayoutView): number =>
  seedFromText(`${graph.commits.length}:${view.lanes.length}:${graph.commits[0]?.sha ?? ""}:${graph.commits.at(-1)?.sha ?? ""}`);

export const rings = defineStyle({
  name: "rings",
  description: "Tree rings: a sawn trunk, busy periods growing wide rings, branches as sectors that knot where they fork.",
  tunes: ["arrange"],

  draw({ graph, frame, theme, options, view }) {
    const { unit } = frame;
    const inTimeOrder = view.commitsInTimeOrder;
    const growth = ringGrowth(graph, inTimeOrder, options.timeMode);
    const seed = shapeSeed(graph, view);
    const grain = seededRandom(seed);
    const disc = sawDisc(frame, grain);
    const sectors = sectorsFor(view);
    const knots = branchKnots(view, disc, growth, sectors, unit);
    const section: Section = { disc, growth, sectors, flowAroundKnots: grainFlow(knots), unit, theme };
    const { definitions, layers: woodLayers } = wood(section, ringStrays(grain, growth.radii), seed);
    return {
      definitions,
      layers: [
        ...woodLayers,
        ...branchSectors(section, view),
        knotScars(knots, section),
        pores(section, inTimeOrder),
        ...bark(section, seed),
        pith(section),
        headBlaze(
          section,
          view.commits.find((commit) => commit.isHead),
        ),
      ],
    };
  },
});
