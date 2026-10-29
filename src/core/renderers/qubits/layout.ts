import { buildChains, timePositions } from "../../graph/layout.ts";
import { chainNumberBySha, childrenOf, commitsBySha } from "../../graph/queries.ts";
import type { Commit, Edge, Graph, Layout, Options, Placement } from "../../model.ts";
import { smallestGapBetweenTimes } from "../../util/maths.ts";
import { type Circuit, type Cnot, cnotsOf, qubitCountOf, slotOfQubit, type Wire } from "./circuit.ts";
import { packCircuit } from "./columns.ts";

const SMALLEST_ROOM_AT_WIRE_ENDS = 0.004;
const OPEN_WIRE_END_ROOM_SHARE = 0.5;
const LONGEST_FORK_LEAD_IN_STEPS = 0.6;
const SMALLEST_NORMALISED_SPAN = 1e-9;
const TIME_WITHOUT_WIRES = 0.5;

export interface QubitsLayout {
  readonly layout: Layout;
  readonly wires: readonly Wire[];
  readonly cnots: readonly Cnot[];
  readonly qubitCount: number;
}

interface Timing {
  readonly order: ReadonlyMap<string, number>;
  readonly windows: readonly [number, number][];
  readonly smallestStep: number;
  readonly roomAtWireEnds: number;
}

function timingOf(graph: Graph, options: Options): Timing {
  const chronological = options.timeMode === "chronological";
  const { t: order, windows } = timePositions(graph, options.timeMode, chronological ? options.twistEvery : 0);
  const smallestStep = smallestGapBetweenTimes(order.values());
  return { order, windows, smallestStep, roomAtWireEnds: Math.max(smallestStep, SMALLEST_ROOM_AT_WIRE_ENDS) };
}

function forkInto(chain: readonly string[], commitBySha: ReadonlyMap<string, Commit>, timing: Timing): Cnot | undefined {
  const first = chain[0];
  const parent = commitBySha.get(first)?.parents[0];
  const parentTime = parent === undefined ? undefined : timing.order.get(parent);
  const firstTime = timing.order.get(first);
  if (parent === undefined || parentTime === undefined || firstTime === undefined) return undefined;
  const time = firstTime - Math.min((firstTime - parentTime) / 2, timing.smallestStep * LONGEST_FORK_LEAD_IN_STEPS);
  return { kind: "fork", time, target: first, controls: [parent] };
}

const mergeCnots = (graph: Graph, order: ReadonlyMap<string, number>): Cnot[] =>
  graph.commits.flatMap((commit) => {
    const controls = commit.parents.slice(1).filter((parent) => order.has(parent));
    const time = order.get(commit.sha);
    return controls.length && time !== undefined ? [{ kind: "merge" as const, time, target: commit.sha, controls }] : [];
  });

function lastNeeded(chains: readonly string[][], cnots: readonly Cnot[], order: ReadonlyMap<string, number>): number[] {
  const chainOf = chainNumberBySha([...chains]);
  const reach = chains.map((chain) => order.get(chain.at(-1) ?? "") ?? 0);
  for (const cnot of cnots) {
    for (const control of cnot.controls) {
      const owner = chainOf.get(control);
      if (owner !== undefined) reach[owner] = Math.max(reach[owner], cnot.time);
    }
  }
  return reach;
}

function allocateQubits(wires: readonly Wire[]): Wire[] {
  const freeFrom: number[] = [Number.POSITIVE_INFINITY];
  const qubitOf = new Map<Wire, number>();
  for (const wire of wires.slice(1).sort((a, b) => a.start - b.start)) {
    const reused = freeFrom.findIndex((end, qubit) => qubit > 0 && end < wire.start);
    const qubit = reused < 0 ? freeFrom.length : reused;
    freeFrom[qubit] = wire.end;
    qubitOf.set(wire, qubit);
  }
  return wires.map((wire) => ({ ...wire, qubit: qubitOf.get(wire) ?? 0 }));
}

function draftCircuit(graph: Graph, timing: Timing): Circuit {
  const chains = buildChains(graph);
  const commitBySha = commitsBySha(graph);
  const children = childrenOf(graph);
  const continues = new Set(graph.continuingAfterRange);
  const forkIntoWire = chains.map((chain) => forkInto(chain, commitBySha, timing));
  const merges = mergeCnots(graph, timing.order);
  const reach = lastNeeded(chains, [...forkIntoWire.flatMap((fork) => fork ?? []), ...merges], timing.order);
  const wires = chains.map((chain, index): Wire => {
    const tip = chain.at(-1) ?? "";
    const open = continues.has(tip) || !children.get(tip)?.length || tip === graph.headSha;
    const fork = forkIntoWire[index];
    const firstHasParents = (commitBySha.get(chain[0])?.parents.length ?? 0) > 0;
    return {
      chain,
      qubit: 0,
      colourIndex: index,
      start: (fork?.time ?? timing.order.get(chain[0]) ?? 0) - timing.roomAtWireEnds,
      end: reach[index] + timing.roomAtWireEnds * (open ? OPEN_WIRE_END_ROOM_SHARE : 1),
      preparation: firstHasParents && !fork ? "input" : "fresh",
      measured: !open,
    };
  });
  return { wires: allocateQubits(wires), forkIntoWire, merges, commitTimes: timing.order, twists: [] };
}

function twistsClearOfEvents(circuit: Circuit, windows: readonly [number, number][]): [number, number][] {
  const times = [...circuit.commitTimes.values(), ...cnotsOf(circuit).map((cnot) => cnot.time), ...circuit.wires.flatMap((wire) => [wire.start, wire.end])];
  return windows.filter(([start, end]) => !times.some((time) => time > start && time < end));
}

function normalised(circuit: Circuit): Circuit {
  const first = Math.min(...circuit.wires.map((wire) => wire.start));
  const last = Math.max(...circuit.wires.map((wire) => wire.end));
  const scale = (time: number) => (circuit.wires.length ? (time - first) / Math.max(last - first, SMALLEST_NORMALISED_SPAN) : TIME_WITHOUT_WIRES);
  const retime = (cnot: Cnot): Cnot => ({ ...cnot, time: scale(cnot.time) });
  return {
    wires: circuit.wires.map((wire) => ({ ...wire, start: scale(wire.start), end: scale(wire.end) })),
    forkIntoWire: circuit.forkIntoWire.map((fork) => fork && retime(fork)),
    merges: circuit.merges.map(retime),
    commitTimes: new Map([...circuit.commitTimes].map(([sha, time]) => [sha, scale(time)])),
    twists: circuit.twists.map(([start, end]) => [scale(start), scale(end)] as const),
  };
}

function layoutOf(graph: Graph, circuit: Circuit, options: Options): Layout {
  const wireBySha = new Map(circuit.wires.flatMap((wire) => wire.chain.map((sha) => [sha, wire] as const)));
  const placement = (commit: Commit): Placement[] => {
    const wire = wireBySha.get(commit.sha);
    const time = circuit.commitTimes.get(commit.sha);
    if (!wire || time === undefined) return [];
    return [{ sha: commit.sha, colourIndex: wire.colourIndex, slot: slotOfQubit(wire.qubit, options.arrange), timeFraction: time, runStartTimeFraction: time }];
  };
  return {
    lanes: circuit.wires.map((wire) => ({
      colourIndex: wire.colourIndex,
      slot: slotOfQubit(wire.qubit, options.arrange),
      shas: [...wire.chain],
      entersFromLeftEdge: wire.preparation === "input",
      leavesThroughRightEdge: !wire.measured,
    })),
    placements: graph.commits.flatMap(placement).sort((a, b) => a.timeFraction - b.timeFraction),
    edges: cnotsOf(circuit).flatMap((cnot) => cnot.controls.map((parent): Edge => ({ parent, child: cnot.target, kind: cnot.kind }))),
    options,
    halfTwistWindows: circuit.twists.map(([start, end]): [number, number] => [start, end]),
  };
}

function timedCircuit(graph: Graph, options: Options, timing: Timing): Circuit {
  const drafted = draftCircuit(graph, timing);
  if (options.timeMode === "topological") return graph.commits.length ? packCircuit(graph, drafted, options.twistEvery) : drafted;
  return { ...drafted, twists: twistsClearOfEvents(drafted, timing.windows) };
}

export function qubitsLayout(graph: Graph, options: Options): QubitsLayout {
  const circuit = normalised(timedCircuit(graph, options, timingOf(graph, options)));
  return { layout: layoutOf(graph, circuit, options), wires: circuit.wires, cnots: cnotsOf(circuit), qubitCount: qubitCountOf(circuit.wires) };
}
