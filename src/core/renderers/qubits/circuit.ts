import type { Options } from "../../model.ts";

export interface Wire {
  readonly chain: readonly string[];
  readonly qubit: number;
  readonly colourIndex: number;
  readonly start: number;
  readonly end: number;
  readonly preparation: "input" | "fresh";
  readonly measured: boolean;
}

export interface Cnot {
  readonly kind: "fork" | "merge";
  readonly time: number;
  readonly target: string;
  readonly controls: readonly string[];
}

export interface Circuit {
  readonly wires: readonly Wire[];
  readonly forkIntoWire: readonly (Cnot | undefined)[];
  readonly merges: readonly Cnot[];
  readonly commitTimes: ReadonlyMap<string, number>;
  readonly twists: readonly (readonly [start: number, end: number])[];
}

export const cnotsOf = (circuit: Circuit): Cnot[] => [...circuit.forkIntoWire.flatMap((fork) => fork ?? []), ...circuit.merges];

export const qubitCountOf = (wires: readonly Wire[]): number => Math.max(0, ...wires.map((wire) => wire.qubit)) + 1;

export const slotOfQubit = (qubit: number, arrange: Options["arrange"]): number => {
  if (arrange === "edge" || qubit === 0) return qubit;
  return qubit % 2 ? (qubit + 1) / 2 : -qubit / 2;
};
