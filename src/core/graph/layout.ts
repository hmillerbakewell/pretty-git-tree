import { ARRANGEMENTS, type Commit, DEFAULT_OPTIONS, type Edge, type Graph, type Lane, type Layout, type Options, type Placement } from "../model.ts";
import { isOneOf } from "../util/guards.ts";
import { buildChains, chainSpans, type Span } from "./layout/chains.ts";
import { assignSlots } from "./layout/slots.ts";
import { type TimePositions, timePositions } from "./layout/time.ts";
import { commitsBySha } from "./queries.ts";

export { buildChains, chainSpans, type Span } from "./layout/chains.ts";
export { type TimePositions, timePositions } from "./layout/time.ts";

function edgesOfChain(chain: string[], span: Span, index: Map<string, Commit>, t: Map<string, number>): Edge[] {
  const edges: Edge[] = [];
  if (span.entersFromLeftEdge) edges.push({ parent: null, child: chain[0], kind: "line" });
  if (span.forkParent !== undefined && t.has(span.forkParent)) edges.push({ parent: span.forkParent, child: chain[0], kind: "fork" });
  for (let step = 1; step < chain.length; step++) edges.push({ parent: chain[step - 1], child: chain[step], kind: "line" });
  for (const sha of chain) {
    const mergedParentsInRange = (index.get(sha)?.parents.slice(1) ?? []).filter((parent) => t.has(parent));
    for (const parent of mergedParentsInRange) edges.push({ parent, child: sha, kind: "merge" });
  }
  return edges;
}

function placementsOfChain(chain: string[], colourIndex: number, slot: number, times: TimePositions): Placement[] {
  return chain.map((sha) => ({ sha, colourIndex, slot, timeFraction: times.t.get(sha) ?? 0, runStartTimeFraction: times.t0.get(sha) ?? 0 }));
}

export function layout(graph: Graph, options: Options = DEFAULT_OPTIONS): Layout {
  if (!isOneOf(ARRANGEMENTS, options.arrange)) {
    throw new Error(`unknown arrangement ${options.arrange}; choose from ${ARRANGEMENTS.join(", ")}`);
  }
  const index = commitsBySha(graph);
  const times = timePositions(graph, options.timeMode, options.twistEvery);
  const chains = buildChains(graph);
  const spans = chainSpans(graph, chains, times.t);
  const minimumGap = 1 / Math.max(graph.commits.length, 1);
  const slotOfChain = assignSlots(chains, spans, options.arrange, minimumGap);
  const lanes: Lane[] = chains.map((chain, colourIndex) => {
    const { entersFromLeftEdge, leavesThroughRightEdge } = spans[colourIndex];
    return { colourIndex, slot: slotOfChain[colourIndex], shas: chain, entersFromLeftEdge, leavesThroughRightEdge };
  });
  const placements = chains.flatMap((chain, colourIndex) => placementsOfChain(chain, colourIndex, slotOfChain[colourIndex], times));
  const edges = chains.flatMap((chain, colourIndex) => edgesOfChain(chain, spans[colourIndex], index, times.t));
  placements.sort((earlier, later) => earlier.timeFraction - later.timeFraction);
  return { lanes, placements, edges, options, halfTwistWindows: times.windows };
}

export function laneSlotRange(laidOut: Layout): [number, number] {
  const slots = laidOut.lanes.length ? laidOut.lanes.map((lane) => lane.slot) : [0];
  return [Math.min(...slots), Math.max(...slots)];
}
