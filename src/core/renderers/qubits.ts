import { Band, fillFit } from "../draw/band.ts";
import { glowFilter } from "../draw/marks.ts";
import { group, type Point } from "../draw/svg.ts";
import type { Theme } from "../draw/themes.ts";
import { defineStyle } from "../style/renderer.ts";
import type { PlacedCommit } from "../style/view.ts";
import { type Board, backToFront, boardFor, glyph, type Painted, PaintLayer, strand } from "./qubits/board.ts";
import { dot, gateBox, headMarker, ket, meter, oplus } from "./qubits/glyphs.ts";
import type { QubitsLayout } from "./qubits/layout.ts";
import { type PlacedGate, type PlacedWire, placeCircuit } from "./qubits/placed.ts";

export type { Cnot, Wire } from "./qubits/circuit.ts";
export { type QubitsLayout, qubitsLayout } from "./qubits/layout.ts";
export { type PlacedCircuit, type PlacedGate, type PlacedWire, placeCircuit } from "./qubits/placed.ts";

const WIRE_OPACITY = 0.75;
const KET_ROOM_SHARE_OF_GATE = 0.75;
const METER_ROOM_SHARE_OF_GATE = 0.5;
const PREPARATION_DOT_SHARE = 0.15;
const CONTROL_DOT_SHARE = 0.18;
const BOARD_STROKE_SHARE_OF_LINE = 1.4;

const eventTimes = ({ layout, wires, cnots }: QubitsLayout): number[] => [
  ...layout.placements.map((node) => node.timeFraction),
  ...wires.flatMap((wire) => [wire.start, wire.end]),
  ...cnots.map((cnot) => cnot.time),
];

function paintWire(board: Board, wire: PlacedWire, theme: Theme): Painted[] {
  const { band, gateSize, showsLabels } = board;
  const { lane } = wire;
  const across = band.acrossAt(lane.slot);
  const [startAlong, endAlong] = [band.alongAt(wire.start), band.alongAt(wire.end)];
  const measured = !lane.continuesAfterRange;
  const wireLine = strand(
    board,
    [
      [startAlong + (showsLabels ? gateSize * KET_ROOM_SHARE_OF_GATE : 0), across],
      [measured ? endAlong - gateSize * METER_ROOM_SHARE_OF_GATE : endAlong, across],
    ],
    lane.colour,
    PaintLayer.wire,
    { opacity: WIRE_OPACITY, "stroke-width": board.lineWidth },
  );
  const label = lane.entersFromBeforeRange ? "|ψ⟩" : "|0⟩";
  const preparation = glyph(board, [startAlong, across], (spot) =>
    showsLabels ? [ket(spot, label, lane.colour, theme)] : [dot(spot, PREPARATION_DOT_SHARE, lane.colour)],
  );
  const measurement = measured ? [glyph(board, [endAlong, across], (spot) => meter(spot, board.timeRunsDown, lane.colour, theme))] : [];
  return [...wireLine, preparation, ...measurement];
}

function paintGate(board: Board, gate: PlacedGate, theme: Theme): Painted[] {
  const { band } = board;
  const along = band.alongAt(gate.time);
  const ink = gate.target.colour;
  const targetAcross = band.acrossAt(gate.target.slot);
  const acrosses = [targetAcross, ...gate.controls.map((control) => band.acrossAt(control.slot))];
  const connector = strand(
    board,
    [
      [along, Math.min(...acrosses)],
      [along, Math.max(...acrosses)],
    ],
    ink,
    PaintLayer.connector,
  );
  const controls = gate.controls.map((control) => glyph(board, [along, band.acrossAt(control.slot)], (spot) => [dot(spot, CONTROL_DOT_SHARE, ink)]));
  const target = gate.kind === "fork" ? [glyph(board, [along, targetAcross], (spot) => oplus(spot, ink, theme))] : [];
  return [...connector, ...controls, ...target];
}

function paintCommit(board: Board, commit: PlacedCommit, isMerge: boolean, theme: Theme): Painted {
  const at: Point = [board.band.alongAt(commit.timeFraction), board.band.acrossAt(commit.slot)];
  return glyph(board, at, (spot) => [
    ...(isMerge ? oplus(spot, commit.colour, theme) : gateBox(spot, commit.weight, board.timeRunsDown, commit.colour, theme)),
    ...(commit.isHead ? [headMarker(spot, theme)] : []),
  ]);
}

export const qubits = defineStyle({
  name: "qubits",
  description: "Branches as qubits: merges are CNOTs, and branches reuse wires.",
  tunes: ["arrange", "route", "twistEvery"],
  showsGrid: true,

  draw({ graph, frame, theme, options }) {
    const { circuit, view, wires, gates } = placeCircuit(graph, options, theme);
    const { layout } = circuit;
    const band = new Band(layout, frame, options.route === "fill" ? fillFit(layout, frame) : undefined, false);
    const board = boardFor(band, frame, eventTimes(circuit));
    const mergeTargets = new Set(gates.filter((gate) => gate.kind === "merge").map((gate) => gate.target));
    const commitsInTimeOrder = view.commitsInTimeOrder;
    const painted = [
      ...wires.flatMap((wire) => paintWire(board, wire, theme)),
      ...gates.flatMap((gate) => paintGate(board, gate, theme)),
      ...commitsInTimeOrder.map((commit) => paintCommit(board, commit, mergeTargets.has(commit), theme)),
    ];
    const boardAttributes = {
      fill: "none",
      "stroke-width": board.lineWidth * BOARD_STROKE_SHARE_OF_LINE,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      ...glowFilter(theme),
    };
    return {
      layers: [
        group(
          boardAttributes,
          backToFront(painted).map((paint) => paint.element),
        ),
      ],
      branchCount: wires.length,
    };
  },
});
