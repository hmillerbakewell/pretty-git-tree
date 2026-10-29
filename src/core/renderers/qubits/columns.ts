import { weight } from "../../graph/queries.ts";
import type { Graph } from "../../model.ts";
import { type Circuit, type Cnot, qubitCountOf, type Wire } from "./circuit.ts";

const COLUMNS_PER_TWIST = 4;
const TWIST_STARTS_AFTER_COLUMN = 0.75;
const TWIST_ENDS_BEFORE_COLUMN = 0.25;
const PREPARATION_COLUMNS_BEFORE_FIRST_GATE = 1;

interface ColumnEvent {
  readonly key: number;
  readonly lowestQubit: number;
  readonly highestQubit: number;
  readonly weight: number;
}

interface CircuitEvents {
  readonly wireEnds: readonly ColumnEvent[];
  readonly commits: readonly ColumnEvent[];
  readonly forks: readonly (ColumnEvent | undefined)[];
  readonly all: readonly ColumnEvent[];
}

const eventOn = (key: number, qubits: readonly number[], eventWeight: number): ColumnEvent => ({
  key,
  lowestQubit: Math.min(...qubits),
  highestQubit: Math.max(...qubits),
  weight: eventWeight,
});

function circuitEvents(graph: Graph, circuit: Circuit): CircuitEvents {
  const qubitBySha = new Map(circuit.wires.flatMap((wire) => wire.chain.map((sha) => [sha, wire.qubit] as const)));
  const qubitsOf = (shas: readonly string[]) => shas.map((sha) => qubitBySha.get(sha) ?? 0);
  const mergeInto = new Map(circuit.merges.map((merge) => [merge.target, merge]));
  const wireStarts = circuit.wires.map((wire) => eventOn(wire.start, [wire.qubit], 0));
  const wireEnds = circuit.wires.map((wire) => eventOn(wire.end, [wire.qubit], 0));
  const commits = graph.commits.map((commit) =>
    eventOn(circuit.commitTimes.get(commit.sha) ?? 0, qubitsOf([commit.sha, ...(mergeInto.get(commit.sha)?.controls ?? [])]), weight(commit)),
  );
  const forks = circuit.forkIntoWire.map((fork) => fork && eventOn(fork.time, qubitsOf([fork.target, ...fork.controls]), 0));
  const wireEvents = wireStarts.flatMap((start, index) => [start, wireEnds[index]]);
  return { wireEnds, commits, forks, all: [...wireEvents, ...commits, ...forks.flatMap((fork) => fork ?? [])] };
}

function packIntoColumns(events: readonly ColumnEvent[], qubitCount: number): Map<ColumnEvent, number> {
  const lastColumnOnQubit = new Array<number>(qubitCount).fill(-1);
  const columnOf = new Map<ColumnEvent, number>();
  for (const event of [...events].sort((a, b) => a.key - b.key)) {
    let column = 0;
    for (let qubit = event.lowestQubit; qubit <= event.highestQubit; qubit++) column = Math.max(column, lastColumnOnQubit[qubit] + 1);
    for (let qubit = event.lowestQubit; qubit <= event.highestQubit; qubit++) lastColumnOnQubit[qubit] = column;
    columnOf.set(event, column);
  }
  return columnOf;
}

function columnsBeforeTwists(events: readonly ColumnEvent[], columnOf: ReadonlyMap<ColumnEvent, number>, twistEvery: number): number[] {
  if (twistEvery <= 0) return [];
  const columnCount = Math.max(...columnOf.values()) + 1;
  const weightPerColumn = new Array<number>(columnCount).fill(0);
  for (const event of events) weightPerColumn[columnOf.get(event) ?? 0] += event.weight;
  let runningWeight = 0;
  const weightUpTo = weightPerColumn.map((columnWeight) => (runningWeight += columnWeight));
  const twistCount = Math.floor(runningWeight / twistEvery);
  const targets = Array.from({ length: twistCount }, (_, index) => runningWeight / 2 + (index - (twistCount - 1) / 2) * twistEvery);
  const columns = targets.map((target) => weightUpTo.findIndex((upTo) => upTo >= target)).filter((column) => column >= 0 && column < columnCount - 1);
  return [...new Set(columns)].sort((a, b) => a - b);
}

function retimedWires(
  circuit: Circuit,
  wireEndTimes: readonly number[],
  forkIntoWire: readonly (Cnot | undefined)[],
  commitTimes: ReadonlyMap<string, number>,
): Wire[] {
  return circuit.wires.map((wire, index) => {
    const firstGate = Math.min(forkIntoWire[index]?.time ?? Number.POSITIVE_INFINITY, commitTimes.get(wire.chain[0]) ?? Number.POSITIVE_INFINITY);
    return { ...wire, start: firstGate - PREPARATION_COLUMNS_BEFORE_FIRST_GATE, end: wireEndTimes[index] };
  });
}

export function packCircuit(graph: Graph, circuit: Circuit, twistEvery: number): Circuit {
  const events = circuitEvents(graph, circuit);
  const columnOf = packIntoColumns(events.all, qubitCountOf(circuit.wires));
  const twistAfter = columnsBeforeTwists(events.all, columnOf, twistEvery);
  const shifted = (column: number) => column + twistAfter.filter((before) => before < column).length * COLUMNS_PER_TWIST;
  const timeOf = (event: ColumnEvent) => shifted(columnOf.get(event) ?? 0);
  const commitTimes = new Map(graph.commits.map((commit, index) => [commit.sha, timeOf(events.commits[index])]));
  const forkIntoWire = circuit.forkIntoWire.map((fork, index) => {
    const event = events.forks[index];
    return fork && event && { ...fork, time: timeOf(event) };
  });
  return {
    wires: retimedWires(circuit, events.wireEnds.map(timeOf), forkIntoWire, commitTimes),
    forkIntoWire,
    merges: circuit.merges.map((merge) => ({ ...merge, time: commitTimes.get(merge.target) ?? merge.time })),
    commitTimes,
    twists: twistAfter.map((column) => [shifted(column) + TWIST_STARTS_AFTER_COLUMN, shifted(column) + COLUMNS_PER_TWIST + TWIST_ENDS_BEFORE_COLUMN] as const),
  };
}
