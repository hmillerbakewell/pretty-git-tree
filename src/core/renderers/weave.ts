import { defineStyle } from "../style/renderer.ts";
import { seededRandom, seedFromText } from "../util/random.ts";
import { clothLayer, fringe, selvedgeTurns } from "./weave/cloth.ts";
import { draftNotation } from "./weave/draft.ts";
import { weaveDrawdown } from "./weave/drawdown.ts";
import { setUpLoom } from "./weave/loom.ts";
import { patternBook } from "./weave/patterns.ts";

export const weave = defineStyle({
  name: "weave",
  description: "A weaving draft: branches as warp stripes, time as weft; commits lift, merges float across.",
  tunes: ["arrange"],

  draw({ graph, frame, theme, view }) {
    if (!graph.commits.length) return { layers: [], branchCount: 0 };
    const loom = setUpLoom(view, frame, theme);
    const drawdown = weaveDrawdown(view, loom);
    const patterns = patternBook(loom, drawdown, theme);
    const cloth = clothLayer(loom, theme, patterns.fillAt);
    const fringeRandom = seededRandom(seedFromText(`${graph.commits.length}:${view.lanes.length}:${loom.rowCount}`));
    return {
      definitions: patterns.definitions(),
      layers: [
        fringe(view, loom, fringeRandom),
        cloth,
        selvedgeTurns(loom, theme),
        draftNotation(
          loom,
          drawdown,
          view.commits.find((commit) => commit.isHead),
          theme,
        ),
      ],
    };
  },
});
