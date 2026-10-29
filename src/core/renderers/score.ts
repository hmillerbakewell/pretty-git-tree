import type { Frame } from "../draw/frame.ts";
import { group, type SvgElement } from "../draw/svg.ts";
import type { Theme } from "../draw/themes.ts";
import { defineStyle } from "../style/renderer.ts";
import type { PlacedCommit, PlacedLane } from "../style/view.ts";
import { consecutivePairs } from "../util/lists.ts";
import { type PlacedCircuit, placeCircuit } from "./qubits.ts";
import { drawNote, type Note, noteFor, slurs } from "./score/notes.ts";
import { faintStaves, fitSystems, type Systems, systemBars, timeSignature, voiceStaves } from "./score/systems.ts";

const STAFF_LINE_WIDTH = 0.8;
const THINNEST_STAFF_LINE = 0.6;
const VOICE_LINE_WIDTH = 1.1;
const THINNEST_VOICE_LINE = 0.8;
const VOICE_OPACITY = 0.85;

function notesOf(systems: Systems, { view, wires }: PlacedCircuit): Note[] {
  const qubitOf = new Map<PlacedLane, number>(wires.map((wire) => [wire.lane, wire.qubit]));
  const nextOf = new Map(view.lanes.flatMap((lane) => consecutivePairs(lane.commits)));
  return view.commitsInTimeOrder.map((commit) => noteFor(systems, commit, qubitOf.get(commit.lane) ?? 0, nextOf.get(commit)));
}

function drawScore(placed: PlacedCircuit, frame: Frame, theme: Theme): SvgElement[] {
  const { circuit, wires, gates } = placed;
  const columns = [...new Set(circuit.layout.placements.map((node) => node.timeFraction))].sort((a, b) => a - b);
  const systems = fitSystems(frame, circuit.qubitCount, columns.length);
  const notes = notesOf(systems, placed);
  const noteOf = new Map<PlacedCommit, Note>(notes.map((note) => [note.commit, note]));
  const drawnNotes = notes.map((note) => drawNote(systems, note, theme));
  const { unit } = frame;
  return [
    group({ stroke: theme.muted, "stroke-width": Math.max(STAFF_LINE_WIDTH * unit, THINNEST_STAFF_LINE), fill: "none" }, [
      ...faintStaves(systems),
      ...drawnNotes.flatMap((drawn) => drawn.ledgers),
    ]),
    group(
      { stroke: theme.ink, "stroke-width": Math.max(VOICE_LINE_WIDTH * unit, THINNEST_VOICE_LINE), fill: "none", opacity: VOICE_OPACITY },
      wires.flatMap((wire) => voiceStaves(systems, wire)),
    ),
    group({ stroke: theme.ink, fill: "none" }, systemBars(systems, columns)),
    group(
      { fill: "none", "stroke-linecap": "round" },
      gates.flatMap((gate) => slurs(systems, gate, noteOf)),
    ),
    group(
      {},
      drawnNotes.flatMap((drawn) => drawn.glyphs),
    ),
    group({ fill: theme.ink }, [...timeSignature(systems), ...drawnNotes.flatMap((drawn) => drawn.marks)]),
  ];
}

export const score = defineStyle({
  name: "score",
  description: "An orchestral score: branches as voices, commits as notes, merges as slurs.",
  tunes: [],

  draw({ graph, frame, theme, options }) {
    if (!graph.commits.length) return { layers: [], branchCount: 0 };
    const placed = placeCircuit(graph, options, theme);
    return { layers: drawScore(placed, frame, theme), branchCount: placed.wires.length };
  },
});
