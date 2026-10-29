import { expect, test } from "vitest";
import { DEFAULT_OPTIONS, layout, sampleLog, simplify, sliceLog } from "../src/core/index.ts";
import { qubitsLayout, type Wire } from "../src/core/renderers/qubits.ts";
import { corpus } from "./corpus.ts";

const wireLookup = (wires: readonly Wire[]) => {
  const wireBySha = new Map(wires.flatMap((wire) => wire.chain.map((sha) => [sha, wire] as const)));
  return (sha: string): Wire => {
    const wire = wireBySha.get(sha);
    if (!wire) throw new Error(`no wire holds ${sha}`);
    return wire;
  };
};

for (const [name, log] of corpus) {
  const graph = simplify(sliceLog(log));
  test(`${name}: wires sharing a qubit never overlap, and gates sit inside their wire`, () => {
    for (const timeMode of ["topological", "chronological"] as const) {
      const { wires, cnots, layout: circuitLayout, qubitCount } = qubitsLayout(graph, { ...DEFAULT_OPTIONS, timeMode, twistEvery: 10 });
      const wireOf = wireLookup(wires);
      for (let qubit = 0; qubit < qubitCount; qubit++) {
        const onQubit = wires.filter((wire) => wire.qubit === qubit).sort((a, b) => a.start - b.start);
        for (let index = 1; index < onQubit.length; index++) expect(onQubit[index].start).toBeGreaterThan(onQubit[index - 1].end);
      }
      for (const node of circuitLayout.placements) {
        const wire = wireOf(node.sha);
        expect(node.timeFraction).toBeGreaterThan(wire.start);
        expect(node.timeFraction).toBeLessThan(wire.end);
      }
      for (const cnot of cnots) for (const sha of cnot.controls) expect(wireOf(sha).qubit).not.toBe(wireOf(cnot.target).qubit);
    }
  });

  test(`${name}: no more qubits than lanes, and nothing under a CNOT`, () => {
    const { wires, cnots, qubitCount, layout: circuitLayout } = qubitsLayout(graph, DEFAULT_OPTIONS);
    expect(qubitCount).toBeLessThanOrEqual(Math.max(layout(graph).lanes.length, 1));
    const wireOf = wireLookup(wires);
    for (const cnot of cnots) {
      const qubits = [cnot.target, ...cnot.controls].map((sha) => wireOf(sha).qubit);
      const [lowest, highest] = [Math.min(...qubits), Math.max(...qubits)];
      const under = circuitLayout.placements.filter(
        (node) => node.timeFraction === cnot.time && node.sha !== cnot.target && wireOf(node.sha).qubit >= lowest && wireOf(node.sha).qubit <= highest,
      );
      expect(under).toEqual([]);
    }
  });
}

test("a branch that is merged and done frees its qubit for the next", () => {
  const { wires, qubitCount } = qubitsLayout(simplify(sliceLog(sampleLog("feature-branches"))), DEFAULT_OPTIONS);
  expect(wires.length).toBeGreaterThan(qubitCount);
  expect(wires.some((wire) => wire.measured)).toBe(true);
});

test("a commit keeps its colour across options and styles", () => {
  for (const [, log] of corpus) {
    const graph = simplify(sliceLog(log));
    const colours = (laidOut: { placements: { sha: string; colourIndex: number }[] }) =>
      new Map(laidOut.placements.map((placement) => [placement.sha, placement.colourIndex]));
    const want = colours(layout(graph));
    for (const timeMode of ["topological", "chronological"] as const) {
      for (const arrange of ["centre", "edge"] as const) {
        const options = { ...DEFAULT_OPTIONS, timeMode, arrange };
        expect(colours(layout(graph, options))).toEqual(want);
        expect(colours(qubitsLayout(graph, options).layout)).toEqual(want);
      }
    }
  }
});
