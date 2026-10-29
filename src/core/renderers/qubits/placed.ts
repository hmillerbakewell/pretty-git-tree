import type { Theme } from "../../draw/themes.ts";
import type { Graph, Options } from "../../model.ts";
import { type LayoutView, type PlacedCommit, type PlacedLane, viewLayout } from "../../style/view.ts";
import type { Cnot } from "./circuit.ts";
import { type QubitsLayout, qubitsLayout } from "./layout.ts";

export interface PlacedWire {
  readonly lane: PlacedLane;
  readonly qubit: number;
  readonly start: number;
  readonly end: number;
}

export interface PlacedGate {
  readonly kind: Cnot["kind"];
  readonly time: number;
  readonly target: PlacedCommit;
  readonly controls: readonly PlacedCommit[];
}

export interface PlacedCircuit {
  readonly circuit: QubitsLayout;
  readonly view: LayoutView;
  readonly wires: readonly PlacedWire[];
  readonly gates: readonly PlacedGate[];
}

export function placeCircuit(graph: Graph, options: Options, theme: Theme): PlacedCircuit {
  const circuit = qubitsLayout(graph, options);
  const view = viewLayout(graph, circuit.layout, theme);
  const wires = view.lanes.flatMap((lane, index) => {
    const wire = circuit.wires[index];
    return wire ? [{ lane, qubit: wire.qubit, start: wire.start, end: wire.end }] : [];
  });
  const placedBySha = new Map(view.commits.map((commit) => [commit.sha, commit]));
  const gates = circuit.cnots.flatMap((cnot) => {
    const target = placedBySha.get(cnot.target);
    const controls = cnot.controls.flatMap((sha) => placedBySha.get(sha) ?? []);
    return target ? [{ kind: cnot.kind, time: cnot.time, target, controls }] : [];
  });
  return { circuit, view, wires, gates };
}
